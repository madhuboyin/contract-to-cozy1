/**
 * HomeDigitalTwinRecommendationsService
 *
 * Returns lightweight prebuilt scenario suggestions based on the
 * current state of the twin's modeled components.
 *
 * Design notes:
 * - Suggestions are derived entirely from existing HomeTwinComponent state
 * - Nothing is persisted here — caller decides whether to act on suggestions
 * - Each suggestion carries a pre-filled suggestedInputPayload the frontend
 *   can send directly to POST /scenarios
 * - Low-data or low-confidence components are suppressed to avoid noise
 */

import { HomeTwinComponentType, HomeTwinFactState, HomeTwinScenarioType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';

// ============================================================================
// TYPES
// ============================================================================

export type ScenarioSuggestion = {
  key: string;                         // deterministic slug, e.g. "replace-hvac"
  title: string;
  description: string;
  scenarioType: HomeTwinScenarioType;
  componentType: HomeTwinComponentType | null;
  // The specific real system this suggestion is about, when the suggestion
  // engine resolved to exactly one — pass through as componentId when
  // creating a scenario from this suggestion so it's never ambiguous which
  // system the decision targets (see HomeTwinComponent identityKey).
  componentId: string | null;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  estimatedUpfrontCost: number | null; // USD
  reason: string;                      // human-readable explanation for the card
  suggestedInputPayload: Record<string, unknown>; // ready to send to POST /scenarios
};

// ============================================================================
// COMPONENT DEFAULTS (mirrors builder + scenario service)
// ============================================================================

const DEFAULT_REPLACEMENT_COST: Record<HomeTwinComponentType, number> = {
  HVAC:         9500,
  WATER_HEATER: 1200,
  ROOF:         12000,
  PLUMBING:     8000,
  ELECTRICAL:   5000,
  INSULATION:   3500,
  WINDOWS:      8000,
  SOLAR:        18000,
  APPLIANCE:    1500,
  FLOORING:     6000,
  EXTERIOR:     12000,
  FOUNDATION:   15000,
  OTHER:        3000,
};

// ============================================================================
// SUGGESTION RULES
// ============================================================================

type ComponentRow = {
  id: string;
  componentType: HomeTwinComponentType;
  label: string | null;
  estimatedAgeYears: number | null;
  usefulLifeYears: number | null;
  conditionScore: number | null;
  replacementCostEstimate: { toString(): string } | null; // Decimal
  confidenceScore: number | null;
  installYear: number | null;
  projectedFacts: Array<{ fieldName: string; factState: HomeTwinFactState }>;
};

function decimalToNum(d: { toString(): string } | null): number | null {
  return d != null ? Number(d.toString()) : null;
}

function ageRatio(c: ComponentRow): number | null {
  if (c.estimatedAgeYears == null || c.usefulLifeYears == null || c.usefulLifeYears === 0) {
    return null;
  }
  return c.estimatedAgeYears / c.usefulLifeYears;
}

function hasEvidenceBoundedInstallDate(c: ComponentRow): boolean {
  const state = c.projectedFacts.find((fact) => fact.fieldName === 'installYear')?.factState;
  return state === 'REPORTED' || state === 'VERIFIED' || state === 'DOCUMENT_DERIVED';
}

function resolveUrgency(ratio: number | null): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (ratio != null && ratio >= 0.85) {
    return 'HIGH';
  }
  if (ratio != null && ratio >= 0.60) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Scoring function for ranking suggestions.
 * Higher score = higher priority.
 * Factors: planning-window urgency and evidence confidence. Estimated project
 * cost is deliberately not a priority input: expensive work is not more
 * important merely because it is expensive.
 */
function scoreCandidate(
  urgency: 'HIGH' | 'MEDIUM' | 'LOW',
  confidence: number | null,
): number {
  const urgencyScore = urgency === 'HIGH' ? 3 : urgency === 'MEDIUM' ? 2 : 1;
  const confidenceBoost = (confidence ?? 0.5) * 1.5;
  return urgencyScore + confidenceBoost;
}

/**
 * Generates replacement suggestion for a component if it meets thresholds.
 * Returns null if the component doesn't warrant a suggestion yet.
 */
function replaceSuggestion(
  c: ComponentRow,
  minAgeRatio: number,
  title: string,
  description: string,
): ScenarioSuggestion | null {
  // An age-based planning window requires a reported/verified/document-derived
  // install date. Inferred dates may prompt fact review, but must never create
  // replacement urgency or failure guidance.
  if (!hasEvidenceBoundedInstallDate(c)) return null;

  if (c.confidenceScore != null && c.confidenceScore < 0.25) return null;

  const ratio = ageRatio(c);
  const meetsAge = ratio != null && ratio >= minAgeRatio;
  if (!meetsAge) return null;

  const urgency = resolveUrgency(ratio);
  const cost =
    decimalToNum(c.replacementCostEstimate) ??
    DEFAULT_REPLACEMENT_COST[c.componentType] ??
    DEFAULT_REPLACEMENT_COST.OTHER;

  const ageLabel =
    c.estimatedAgeYears != null
      ? `~${Math.round(c.estimatedAgeYears)} years old`
      : 'age unknown';

  const usefulLifeLabel =
    c.usefulLifeYears != null ? `${c.usefulLifeYears}-year typical lifespan` : 'typical lifespan';

  const pct = Math.round((c.estimatedAgeYears! / c.usefulLifeYears!) * 100);
  const reason =
    `${c.label ?? c.componentType} is ${ageLabel} (${pct}% through its ${usefulLifeLabel}). ` +
    'Age identifies a planning window, not a probability of failure; verify physical condition before deciding.';

  return {
    key: `replace-${c.componentType.toLowerCase().replace(/_/g, '-')}-${c.id}`,
    title,
    description,
    scenarioType: 'REPLACE_COMPONENT',
    componentType: c.componentType,
    componentId: c.id,
    urgency,
    estimatedUpfrontCost: cost,
    reason,
    suggestedInputPayload: {
      componentType: c.componentType,
      assumptions: {
        replacementCost: cost,
        newUsefulLifeYears: c.usefulLifeYears ?? undefined,
      },
    },
  };
}

// ============================================================================
// SERVICE
// ============================================================================

const MAX_SUGGESTIONS = 5;

export class HomeDigitalTwinRecommendationsService {
  async getRecommendations(propertyId: string): Promise<ScenarioSuggestion[]> {
    const [twin, property] = await Promise.all([
      prisma.homeDigitalTwin.findUnique({
        where: { propertyId },
        select: { id: true, status: true, completenessScore: true },
      }),
      prisma.property.findUnique({
        where: { id: propertyId },
        select: { yearBuilt: true },
      }),
    ]);

    if (!twin) {
      throw new APIError(
        'Digital twin not found. Use /init to create one first.',
        404,
        'TWIN_NOT_FOUND',
      );
    }

    const components = await prisma.homeTwinComponent.findMany({
      where: { digitalTwinId: twin.id, lifecycleState: 'ACTIVE' },
      select: {
        id: true,
        componentType: true,
        label: true,
        estimatedAgeYears: true,
        usefulLifeYears: true,
        conditionScore: true,
        replacementCostEstimate: true,
        confidenceScore: true,
        installYear: true,
        projectedFacts: {
          where: { fieldName: 'installYear' },
          select: { fieldName: true, factState: true },
        },
      },
    });

    const byType = new Map<HomeTwinComponentType, ComponentRow>();
    for (const c of components) {
      // Keep the one with highest confidence per type
      const existing = byType.get(c.componentType);
      if (!existing || (c.confidenceScore ?? 0) > (existing.confidenceScore ?? 0)) {
        byType.set(c.componentType, c as ComponentRow);
      }
    }

    const suggestions: ScenarioSuggestion[] = [];

    // ── HVAC ─────────────────────────────────────────────────────────────────
    for (const hvac of components.filter((component) => component.componentType === 'HVAC')) {
      const s = replaceSuggestion(
        hvac,
        0.75, // 75% through useful life
        'Replace Aging HVAC System',
        'Your HVAC system is approaching its typical replacement planning window. Compare waiting, inspection, repair, and replacement before deciding.',
      );
      if (s) suggestions.push(s);
    }

    // ── ROOF ──────────────────────────────────────────────────────────────────
    for (const roof of components.filter((component) => component.componentType === 'ROOF')) {
      const s = replaceSuggestion(
        roof,
        0.72,
        'Roof Replacement',
        'Your roof is approaching its typical replacement planning window. Confirm its physical condition before choosing repair or replacement.',
      );
      if (s) suggestions.push(s);
    }

    // ── WATER HEATER ──────────────────────────────────────────────────────────
    for (const waterHeater of components.filter((component) => component.componentType === 'WATER_HEATER')) {
      const s = replaceSuggestion(
        waterHeater,
        0.80,
        'Replace Aging Water Heater',
        'Your water heater is nearing its typical replacement planning window. Compare inspection, waiting, repair, and replacement.',
      );
      if (s) suggestions.push(s);
    }

    // ── ELECTRICAL ────────────────────────────────────────────────────────────
    for (const electrical of components.filter((component) => component.componentType === 'ELECTRICAL')) {
      const s = replaceSuggestion(
        electrical,
        0.80,
        'Electrical Panel Upgrade',
        'Your electrical panel is approaching its typical planning window. Have a licensed electrician assess condition and capacity before deciding.',
      );
      if (s) suggestions.push(s);
    }

    // ── INSULATION — only for older homes (>15 years) ────────────────────────
    const insulation = byType.get('INSULATION');
    const insulationCost = decimalToNum(insulation?.replacementCostEstimate ?? null) ?? 3500;
    const homeAgeYears = property?.yearBuilt
      ? new Date().getFullYear() - property.yearBuilt
      : null;
    const homeIsOldEnoughForInsulation = homeAgeYears != null && homeAgeYears >= 15;

    const shouldSuggestInsulation =
      Boolean(insulation) &&
      homeIsOldEnoughForInsulation &&
      ((insulation?.confidenceScore ?? 0) >= 0.50) &&
      (ageRatio(insulation!) ?? 0) >= 0.50;

    if (shouldSuggestInsulation) {
      const ageDesc = homeAgeYears != null ? `${homeAgeYears}-year-old home` : 'your home';
      suggestions.push({
        key: 'upgrade-insulation',
        title: 'Upgrade Insulation',
        description:
          'Insulation may improve comfort and energy performance, but savings depend on your home, climate, utility usage, and installation details.',
        scenarioType: 'ENERGY_IMPROVEMENT',
        componentType: 'INSULATION',
        componentId: insulation?.id ?? null,
        urgency: 'LOW',
        estimatedUpfrontCost: insulationCost,
        reason: `Recorded insulation is in its planning window for this ${ageDesc}; verify current performance before deciding.`,
        suggestedInputPayload: {
          upfrontCost: insulationCost,
          comfortImpactDescription: 'Improved temperature consistency across all rooms',
        },
      });
    }

    // ── WINDOWS ───────────────────────────────────────────────────────────────
    const windows = byType.get('WINDOWS');
    if (windows) {
      const ratio = ageRatio(windows);
      if (hasEvidenceBoundedInstallDate(windows) && ratio != null && ratio >= 0.70) {
        const cost = decimalToNum(windows.replacementCostEstimate) ?? 8000;
        suggestions.push({
          key: 'upgrade-windows',
          title: 'Upgrade Windows',
          description:
            'Aging windows reduce energy efficiency and comfort. Modern double-pane or triple-pane windows cut heat loss significantly.',
          scenarioType: 'ENERGY_IMPROVEMENT',
          componentType: 'WINDOWS',
          componentId: windows.id,
          urgency: resolveUrgency(ratio),
          estimatedUpfrontCost: cost,
          reason: `Windows are ${Math.round(ratio * 100)}% through their typical lifespan`,
          suggestedInputPayload: {
            upfrontCost: cost,
            comfortImpactDescription: 'Reduced drafts and improved indoor temperature control',
          },
        });
      }
    }

    // Solar suitability requires roof/site and utility evidence that this
    // projection does not currently own, so absence alone cannot create a
    // recommendation.

    // Score and sort: weighted by planning urgency and evidence confidence.
    suggestions.sort((a, b) => {
      const aComp = components.find((component) => component.id === a.componentId);
      const bComp = components.find((component) => component.id === b.componentId);
      return (
        scoreCandidate(b.urgency, bComp?.confidenceScore ?? null) -
        scoreCandidate(a.urgency, aComp?.confidenceScore ?? null)
      );
    });

    return suggestions.slice(0, MAX_SUGGESTIONS);
  }
}
