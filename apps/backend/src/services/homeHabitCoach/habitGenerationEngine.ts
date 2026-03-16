// apps/backend/src/services/homeHabitCoach/habitGenerationEngine.ts
//
// Rule-based generation engine for PropertyHabit records.
//
// Flow:
//   1. Load property context (systems, flags, climate, location)
//   2. Check if feature is enabled via PropertyHabitPreference
//   3. Load all active HabitTemplates
//   4. Load currently "alive" habits (ACTIVE | SNOOZED) to prevent duplicates
//   5. For each template: evaluate targeting rules → dedupe check → create
//   6. Return a structured summary of what was created vs. skipped

import type { HabitCadence, HabitDifficulty, HabitImpactType, Prisma, Season } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import {
  evaluateTargetingRules,
  getCurrentSeason,
  getHomeAgeYears,
  PropertyEvalContext,
  EvalResult,
  HabitTargetingRules,
} from './habitRuleEvaluator';

// ─── Priority scoring ──────────────────────────────────────────────────────

const IMPACT_SCORE: Record<HabitImpactType, number> = {
  PREVENT_DAMAGE: 10,
  IMPROVE_SAFETY: 9,
  REDUCE_WEAR: 7,
  IMPROVE_EFFICIENCY: 6,
  IMPROVE_AIR_QUALITY: 5,
  GENERAL_UPKEEP: 3,
};

const DIFFICULTY_PENALTY: Record<HabitDifficulty, number> = {
  EASY: 0,
  MODERATE: -3,
  ADVANCED: -8,
};

const CADENCE_SCORE: Record<HabitCadence, number> = {
  DAILY: 8,
  WEEKLY: 9,
  MONTHLY: 10,
  SEASONAL: 12,
  ANNUAL: 6,
  AD_HOC: 2,
};

function computePriorityScore(
  difficulty: HabitDifficulty,
  impactType: HabitImpactType,
  cadence: HabitCadence,
  evalResult: EvalResult,
  isSeasonal: boolean,
): number {
  let score = 50;
  score += IMPACT_SCORE[impactType] ?? 0;
  score += DIFFICULTY_PENALTY[difficulty] ?? 0;
  score += CADENCE_SCORE[cadence] ?? 0;

  // Seasonal habits get a boost when they match the current season
  if (isSeasonal && evalResult.matchedConditions.some((c) => c.startsWith('season:'))) {
    score += 15;
  }

  // Habits that matched specific system/flag context are more targeted → higher value
  const specificMatches = evalResult.matchedConditions.filter(
    (c) =>
      c.startsWith('flag:') ||
      c.startsWith('heatingType:') ||
      c.startsWith('coolingType:') ||
      c.startsWith('climateRegion:'),
  );
  score += specificMatches.length * 5;

  return Math.round(score);
}

// ─── Cooldown windows ──────────────────────────────────────────────────────
//
// After a habit is COMPLETED, it should not be re-generated until the cadence
// window has mostly elapsed. After a DISMISS, suppress for 90 days.

const DAY_MS = 24 * 60 * 60 * 1000;

const COOLDOWN_DAYS: Record<HabitCadence, number> = {
  DAILY: 1,
  WEEKLY: 6,
  MONTHLY: 25,
  SEASONAL: 60,
  ANNUAL: 300,
  AD_HOC: 0, // ad-hoc habits are always eligible
};

const DISMISS_COOLDOWN_DAYS = 90;

// ─── Reason text generation ────────────────────────────────────────────────
//
// Produces concise, human-sounding sentences rather than template strings.
// Priority of signals: flag-specific > season > climate > heating type > home age.

function buildReasonSummary(
  template: { cadence: string },
  evalResult: EvalResult,
  ctx: PropertyEvalContext,
): string {
  if (evalResult.isFallback) {
    const cadencePhrase: Record<string, string> = {
      DAILY: 'a quick daily habit worth building',
      WEEKLY: 'a weekly routine most homeowners benefit from',
      MONTHLY: 'a monthly check worth adding to your routine',
      SEASONAL: 'a seasonal care step for your home',
      ANNUAL: 'an annual maintenance task for most homes',
      AD_HOC: 'a maintenance habit for occupied homes',
    };
    return `This is ${cadencePhrase[template.cadence] ?? 'a maintenance habit for your home'}.`;
  }

  const cond = evalResult.matchedConditions;

  // Flag-specific signals (most concrete — mention the actual feature)
  if (cond.includes('flag:hasSumpPump=true')) {
    const seasonSuffix = cond.some((c) => c.startsWith('season:'))
      ? `, especially ${ctx.currentSeason === 'SPRING' ? 'before spring melt season' : 'this time of year'}`
      : '';
    return `Your home has a sump pump that needs seasonal attention${seasonSuffix}.`;
  }
  if (cond.includes('flag:hasIrrigation=true')) {
    return ctx.currentSeason === 'FALL' || ctx.currentSeason === 'WINTER'
      ? 'Your irrigation system needs to be shut down before freezing temperatures arrive.'
      : 'Your irrigation system benefits from seasonal preparation and inspection.';
  }
  if (cond.includes('flag:hasDrainageIssues=true')) {
    return 'Your property has drainage concerns that warrant regular checks, especially before heavy rain seasons.';
  }
  if (cond.includes('flag:hasFireExtinguisher=true')) {
    return 'Your fire extinguisher needs an annual inspection to confirm it is ready to use.';
  }
  if (cond.includes('flag:hasSmokeDetectors=true')) {
    return 'Smoke detectors need regular testing — this takes under 5 minutes and is one of the highest-impact safety habits.';
  }
  if (cond.includes('flag:hasCoDetectors=true')) {
    return 'CO detectors are life-safety equipment that need monthly testing, especially with the heating season underway.';
  }

  // Season signals
  const seasonPhrases: Record<string, string> = {
    SPRING: "It's spring — the right time to prepare systems before summer heat arrives.",
    SUMMER: 'Summer conditions make this worth checking now before wear becomes visible.',
    FALL: 'Fall is the time to prepare your home before winter weather sets in.',
    WINTER: 'This is especially important during the winter months when conditions are most demanding.',
  };
  if (cond.some((c) => c.startsWith('season:'))) {
    const base = seasonPhrases[ctx.currentSeason] ?? `It's ${ctx.currentSeason.toLowerCase()} — a good time for this habit.`;

    // Add a climate or heating type qualifier if available
    if (cond.some((c) => c.startsWith('climateRegion:'))) {
      const climateQualifier: Record<string, string> = {
        COLD: 'Cold-climate homes benefit especially from this.',
        VERY_COLD: 'In a very cold climate, this is essential.',
        HOT_HUMID: 'Humid conditions make this more important than average.',
        HOT_DRY: 'Dry heat accelerates wear, making this worth staying on top of.',
        MODERATE: '',
      };
      const qualifier = climateQualifier[ctx.climateRegion ?? ''];
      return qualifier ? `${base} ${qualifier}` : base;
    }
    return base;
  }

  // Climate region (no seasonal qualifier)
  if (cond.some((c) => c.startsWith('climateRegion:'))) {
    const climateReasonMap: Record<string, string> = {
      COLD: 'Homes in cold climates should do this regularly to prevent winter damage.',
      VERY_COLD: 'In a very cold climate, this is an essential part of home upkeep.',
      HOT_HUMID: 'Humid conditions accelerate wear and mold — this habit keeps it in check.',
      HOT_DRY: 'Dry heat can cause materials to crack and systems to work harder — this habit helps.',
      MODERATE: 'Matched your home\'s climate profile.',
    };
    return climateReasonMap[ctx.climateRegion ?? ''] ?? 'Matched your home\'s climate profile.';
  }

  // Heating or cooling type
  if (cond.some((c) => c.startsWith('heatingType:'))) {
    const htPhrases: Record<string, string> = {
      FORCED_AIR: 'Forced-air heating systems need regular maintenance to run efficiently and safely.',
      HEAT_PUMP: 'Heat pumps do both heating and cooling — seasonal check-ins keep them running efficiently.',
      BOILER: 'Boiler systems should be serviced annually for safety and reliability.',
      ELECTRIC_BASEBOARD: 'Electric baseboard heaters benefit from seasonal cleaning to maintain output.',
    };
    return htPhrases[ctx.heatingType ?? ''] ?? 'Your heating system benefits from regular care.';
  }
  if (cond.some((c) => c.startsWith('waterHeaterType:'))) {
    return 'Your water heater type warrants this maintenance to extend its lifespan.';
  }

  // Home age
  if (cond.some((c) => c.startsWith('homeAge:'))) {
    const ageYears = getHomeAgeYears(ctx.yearBuilt);
    if (ageYears && ageYears >= 20) {
      return `Homes over ${Math.floor(ageYears / 10) * 10} years old benefit from extra attention to this area.`;
    }
    return 'Matched your home\'s age profile.';
  }

  // State / location
  if (cond.some((c) => c.startsWith('state:'))) {
    return `Relevant for homes in ${ctx.state ?? 'your area'}.`;
  }

  return 'Matched your home profile.';
}

// ─── Due-date helper ───────────────────────────────────────────────────────

function computeDueAt(cadence: HabitCadence): Date | null {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  switch (cadence) {
    case 'DAILY':
      return new Date(now + DAY_MS);
    case 'WEEKLY':
      return new Date(now + 7 * DAY_MS);
    case 'MONTHLY':
      return new Date(now + 30 * DAY_MS);
    case 'SEASONAL':
      return new Date(now + 90 * DAY_MS);
    case 'ANNUAL':
      return new Date(now + 365 * DAY_MS);
    default:
      return null;
  }
}

// ─── Public interface ──────────────────────────────────────────────────────

export interface GenerationResult {
  created: number;
  skipped: number;
  details: Array<{
    templateKey: string;
    action: 'created' | 'skipped';
    reason?: string;
  }>;
}

export async function generateHabitsForProperty(
  propertyId: string,
): Promise<GenerationResult> {
  // 1. Load property context
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      state: true,
      yearBuilt: true,
      propertyType: true,
      heatingType: true,
      coolingType: true,
      waterHeaterType: true,
      roofType: true,
      hasSumpPumpBackup: true,
      hasFireExtinguisher: true,
      hasSmokeDetectors: true,
      hasCoDetectors: true,
      hasSecuritySystem: true,
      hasIrrigation: true,
      hasDrainageIssues: true,
      climateSetting: { select: { climateRegion: true } },
    },
  });

  if (!property) {
    throw new Error(`Property ${propertyId} not found`);
  }

  // 2. Check preferences
  const prefs = await prisma.propertyHabitPreference.findUnique({
    where: { propertyId },
  });

  if (prefs && !prefs.isEnabled) {
    return { created: 0, skipped: 0, details: [] };
  }

  const hiddenCategories: string[] =
    Array.isArray(prefs?.hiddenCategoriesJson) ? (prefs!.hiddenCategoriesJson as string[]) : [];

  // 3. Build evaluation context
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1–12
  const currentSeason: Season = getCurrentSeason(currentMonth);

  const ctx: PropertyEvalContext = {
    propertyType: property.propertyType,
    yearBuilt: property.yearBuilt,
    state: property.state,
    climateRegion: property.climateSetting?.climateRegion ?? null,
    currentMonth,
    currentSeason,
    heatingType: property.heatingType,
    coolingType: property.coolingType,
    waterHeaterType: property.waterHeaterType,
    roofType: property.roofType,
    hasSumpPump: property.hasSumpPumpBackup,
    hasFireExtinguisher: property.hasFireExtinguisher,
    hasSmokeDetectors: property.hasSmokeDetectors,
    hasCoDetectors: property.hasCoDetectors,
    hasSecuritySystem: property.hasSecuritySystem,
    hasIrrigation: property.hasIrrigation,
    hasDrainageIssues: property.hasDrainageIssues,
  };

  // 4. Load templates
  const templates = await prisma.habitTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });

  // 5. Load currently alive habits to deduplicate (ACTIVE/SNOOZED)
  const aliveHabits = await prisma.propertyHabit.findMany({
    where: {
      propertyId,
      status: { in: ['ACTIVE', 'SNOOZED'] },
    },
    select: { habitTemplateId: true },
  });
  const aliveTemplateIds = new Set(aliveHabits.map((h) => h.habitTemplateId));

  // 5b. Load recently completed/dismissed habits to enforce cooldown windows.
  //     Completed → skip until the cadence window has mostly elapsed.
  //     Dismissed → suppress for 90 days so the user isn't badgered.
  const recentlyActedHabits = await prisma.propertyHabit.findMany({
    where: {
      propertyId,
      status: { in: ['COMPLETED', 'DISMISSED'] },
      lastActionAt: { gte: new Date(Date.now() - 365 * DAY_MS) },
    },
    select: {
      habitTemplateId: true,
      status: true,
      lastActionAt: true,
      habitTemplate: { select: { cadence: true } },
    },
  });

  const cooledDownTemplateIds = new Set<string>();
  for (const h of recentlyActedHabits) {
    if (!h.lastActionAt) continue;
    const daysSince = (Date.now() - h.lastActionAt.getTime()) / DAY_MS;

    if (h.status === 'DISMISSED') {
      if (daysSince < DISMISS_COOLDOWN_DAYS) {
        cooledDownTemplateIds.add(h.habitTemplateId);
      }
    } else if (h.status === 'COMPLETED') {
      const cooldown = COOLDOWN_DAYS[h.habitTemplate.cadence as HabitCadence] ?? 0;
      if (cooldown > 0 && daysSince < cooldown) {
        cooledDownTemplateIds.add(h.habitTemplateId);
      }
    }
  }

  // 6. Evaluate and create
  const result: GenerationResult = { created: 0, skipped: 0, details: [] };

  for (const template of templates) {
    // Respect hidden categories from preferences
    if (hiddenCategories.includes(template.category)) {
      result.skipped++;
      result.details.push({
        templateKey: template.key,
        action: 'skipped',
        reason: 'category hidden by preference',
      });
      continue;
    }

    // Evaluate targeting rules
    const rules = template.targetingRulesJson as HabitTargetingRules | null;
    const evalResult = evaluateTargetingRules(rules, ctx);

    if (!evalResult.matches) {
      result.skipped++;
      result.details.push({
        templateKey: template.key,
        action: 'skipped',
        reason: evalResult.failedConditions[0] ?? 'targeting mismatch',
      });
      continue;
    }

    // Dedupe: skip if already ACTIVE or SNOOZED for this template
    if (aliveTemplateIds.has(template.id)) {
      result.skipped++;
      result.details.push({
        templateKey: template.key,
        action: 'skipped',
        reason: 'already active or snoozed',
      });
      continue;
    }

    // Cooldown: skip if recently completed (within cadence window) or dismissed (90 days)
    if (cooledDownTemplateIds.has(template.id)) {
      result.skipped++;
      result.details.push({
        templateKey: template.key,
        action: 'skipped',
        reason: 'in cooldown period after recent action',
      });
      continue;
    }

    // Build reason
    const reasonSummary = buildReasonSummary(template, evalResult, ctx);
    const reasonJson: Prisma.InputJsonValue = {
      matchedConditions: evalResult.matchedConditions,
      failedConditions: evalResult.failedConditions,
      isFallback: evalResult.isFallback,
      generationSource: 'SYSTEM_RULE',
      generatedAt: now.toISOString(),
    };
    const contextJson: Prisma.InputJsonValue = {
      propertyType: ctx.propertyType ?? null,
      yearBuilt: ctx.yearBuilt ?? null,
      state: ctx.state ?? null,
      climateRegion: ctx.climateRegion ?? null,
      season: ctx.currentSeason,
      month: ctx.currentMonth,
      heatingType: ctx.heatingType ?? null,
      coolingType: ctx.coolingType ?? null,
    };

    const priorityScore = computePriorityScore(
      template.difficulty,
      template.impactType,
      template.cadence,
      evalResult,
      template.isSeasonal,
    );

    await prisma.propertyHabit.create({
      data: {
        propertyId,
        habitTemplateId: template.id,
        status: 'ACTIVE',
        generationSource: 'SYSTEM_RULE',
        surfacedAt: now,
        dueAt: computeDueAt(template.cadence),
        priorityScore,
        reasonSummary,
        reasonJson,
        contextJson,
      },
    });

    // Mark as alive within this run to prevent same-run duplicates
    aliveTemplateIds.add(template.id);
    result.created++;
    result.details.push({ templateKey: template.key, action: 'created' });
  }

  return result;
}
