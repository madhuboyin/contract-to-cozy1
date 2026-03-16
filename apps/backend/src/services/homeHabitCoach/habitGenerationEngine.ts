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

// ─── Reason text generation ────────────────────────────────────────────────

function buildReasonSummary(
  template: { cadence: string },
  evalResult: EvalResult,
  ctx: PropertyEvalContext,
): string {
  if (evalResult.isFallback) {
    return `Suggested as a general ${template.cadence.toLowerCase()} upkeep habit for occupied homes.`;
  }

  const parts: string[] = [];

  if (evalResult.matchedConditions.some((c) => c.startsWith('season:'))) {
    const season = ctx.currentSeason.charAt(0) + ctx.currentSeason.slice(1).toLowerCase();
    parts.push(`${season} is approaching`);
  }
  if (evalResult.matchedConditions.some((c) => c.startsWith('climateRegion:'))) {
    parts.push(`your climate region (${ctx.climateRegion})`);
  }
  if (evalResult.matchedConditions.some((c) => c === 'flag:hasSumpPump=true')) {
    parts.push('this property includes a sump pump');
  }
  if (evalResult.matchedConditions.some((c) => c === 'flag:hasIrrigation=true')) {
    parts.push('this property has an irrigation system');
  }
  if (evalResult.matchedConditions.some((c) => c.startsWith('heatingType:'))) {
    parts.push(`your heating system type (${ctx.heatingType})`);
  }
  if (evalResult.matchedConditions.some((c) => c.startsWith('propertyType:'))) {
    parts.push(`your property type (${ctx.propertyType})`);
  }
  if (evalResult.matchedConditions.some((c) => c.startsWith('state:'))) {
    parts.push(`your location (${ctx.state})`);
  }

  if (parts.length === 0) {
    return 'Suggested based on your home profile.';
  }

  return `Suggested because ${parts.join(' and ')}.`;
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

  // 5. Load currently alive habits to deduplicate
  const aliveHabits = await prisma.propertyHabit.findMany({
    where: {
      propertyId,
      status: { in: ['ACTIVE', 'SNOOZED'] },
    },
    select: { habitTemplateId: true },
  });
  const aliveTemplateIds = new Set(aliveHabits.map((h) => h.habitTemplateId));

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
