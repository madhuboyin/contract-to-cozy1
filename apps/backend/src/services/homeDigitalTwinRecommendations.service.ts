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

import { HomeTwinComponentType, HomeTwinScenarioType } from '@prisma/client';
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
  failureRiskScore: number | null;
  replacementCostEstimate: { toString(): string } | null; // Decimal
  confidenceScore: number | null;
  installYear: number | null;
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

function resolveUrgency(
  ratio: number | null,
  failureRisk: number | null,
): 'HIGH' | 'MEDIUM' | 'LOW' {
  if ((ratio != null && ratio >= 0.85) || (failureRisk != null && failureRisk >= 0.65)) {
    return 'HIGH';
  }
  if ((ratio != null && ratio >= 0.60) || (failureRisk != null && failureRisk >= 0.45)) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Scoring function for ranking suggestions.
 * Higher score = higher priority.
 * Factors: urgency weight + confidence boost + estimated value signal.
 */
function scoreCandidate(
  urgency: 'HIGH' | 'MEDIUM' | 'LOW',
  confidence: number | null,
  estimatedCost: number | null,
): number {
  const urgencyScore = urgency === 'HIGH' ? 3 : urgency === 'MEDIUM' ? 2 : 1;
  const confidenceBoost = (confidence ?? 0.5) * 1.5;
  // Higher-cost items have more impact potential — normalize against $20k cap
  const valueBoost = estimatedCost != null ? Math.min(estimatedCost / 20000, 1) : 0;
  return urgencyScore + confidenceBoost + valueBoost;
}

/**
 * Generates replacement suggestion for a component if it meets thresholds.
 * Returns null if the component doesn't warrant a suggestion yet.
 */
function replaceSuggestion(
  c: ComponentRow,
  minAgeRatio: number,
  minFailureRisk: number,
  title: string,
  description: string,
): ScenarioSuggestion | null {
  // Skip if we don't have enough data to make a meaningful suggestion
  if (c.confidenceScore != null && c.confidenceScore < 0.25) return null;

  const ratio = ageRatio(c);
  const risk = c.failureRiskScore;

  const meetsAge = ratio != null && ratio >= minAgeRatio;
  const meetsRisk = risk != null && risk >= minFailureRisk;

  if (!meetsAge && !meetsRisk) return null;

  const urgency = resolveUrgency(ratio, risk);
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

  const reasonParts: string[] = [];
  if (meetsAge && c.estimatedAgeYears != null && c.usefulLifeYears != null) {
    const pct = Math.round((c.estimatedAgeYears / c.usefulLifeYears) * 100);
    reasonParts.push(
      `${c.label ?? c.componentType} is ${ageLabel} (${pct}% through its ${usefulLifeLabel})`,
    );
  }
  if (meetsRisk && risk != null) {
    reasonParts.push(`failure risk score is ${Math.round(risk * 100)}%`);
  }

  return {
    key: `replace-${c.componentType.toLowerCase().replace(/_/g, '-')}`,
    title,
    description,
    scenarioType: 'REPLACE_COMPONENT',
    componentType: c.componentType,
    urgency,
    estimatedUpfrontCost: cost,
    reason: reasonParts.join('; '),
    suggestedInputPayload: {
      componentType: c.componentType,
      assumptions: {
        replacementCost: cost,
        riskReductionPercent: risk != null ? Math.round(risk * 80) : undefined,
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
      where: { digitalTwinId: twin.id, isUserConfirmed: false },
      select: {
        id: true,
        componentType: true,
        label: true,
        estimatedAgeYears: true,
        usefulLifeYears: true,
        conditionScore: true,
        failureRiskScore: true,
        replacementCostEstimate: true,
        confidenceScore: true,
        installYear: true,
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
    const hvac = byType.get('HVAC');
    if (hvac) {
      const s = replaceSuggestion(
        hvac,
        0.75, // 75% through useful life
        0.50, // 50% failure risk
        'Replace Aging HVAC System',
        'Your HVAC system is approaching end of useful life. Replacing it now can reduce energy costs and prevent unexpected failure.',
      );
      if (s) suggestions.push(s);
    }

    // ── ROOF ──────────────────────────────────────────────────────────────────
    const roof = byType.get('ROOF');
    if (roof) {
      const s = replaceSuggestion(
        roof,
        0.72,
        0.45,
        'Roof Replacement',
        'Your roof is aging and may need replacement soon. A new roof improves protection, energy efficiency, and home resale value.',
      );
      if (s) suggestions.push(s);
    }

    // ── WATER HEATER ──────────────────────────────────────────────────────────
    const waterHeater = byType.get('WATER_HEATER');
    if (waterHeater) {
      const s = replaceSuggestion(
        waterHeater,
        0.80,
        0.55,
        'Replace Aging Water Heater',
        'Your water heater is nearing the end of its typical lifespan. Proactive replacement avoids emergency failures.',
      );
      if (s) suggestions.push(s);
    }

    // ── ELECTRICAL ────────────────────────────────────────────────────────────
    const electrical = byType.get('ELECTRICAL');
    if (electrical) {
      const s = replaceSuggestion(
        electrical,
        0.80,
        0.45,
        'Electrical Panel Upgrade',
        'An aging electrical panel increases risk and may not support modern appliance loads. Upgrading improves safety and resale value.',
      );
      if (s) suggestions.push(s);
    }

    // ── INSULATION — only for older homes (>15 years) ────────────────────────
    const insulation = byType.get('INSULATION');
    const insulationCost = decimalToNum(insulation?.replacementCostEstimate ?? null) ?? 3500;
    const homeAgeYears = property?.yearBuilt
      ? new Date().getFullYear() - property.yearBuilt
      : null;
    const homeIsOldEnoughForInsulation = homeAgeYears == null || homeAgeYears >= 15;

    const shouldSuggestInsulation =
      homeIsOldEnoughForInsulation &&
      (!insulation ||
        (insulation.confidenceScore ?? 1) < 0.50 ||
        (ageRatio(insulation) ?? 0) >= 0.50);

    if (shouldSuggestInsulation) {
      const ageDesc = homeAgeYears != null ? `${homeAgeYears}-year-old home` : 'your home';
      suggestions.push({
        key: 'upgrade-insulation',
        title: 'Upgrade Insulation',
        description:
          'Adding or upgrading insulation is one of the highest-ROI energy improvements. Typical payback is 3–7 years with ongoing comfort and energy savings.',
        scenarioType: 'ENERGY_IMPROVEMENT',
        componentType: 'INSULATION',
        urgency: 'LOW',
        estimatedUpfrontCost: insulationCost,
        reason: insulation
          ? `Insulation data has low confidence or is aging in your ${ageDesc}`
          : `No insulation has been modeled for your ${ageDesc} — a high-value opportunity to evaluate`,
        suggestedInputPayload: {
          upfrontCost: insulationCost,
          energySavingsPerYear: 380,
          comfortImpactDescription: 'Improved temperature consistency across all rooms',
        },
      });
    }

    // ── WINDOWS ───────────────────────────────────────────────────────────────
    const windows = byType.get('WINDOWS');
    if (windows) {
      const ratio = ageRatio(windows);
      if (ratio != null && ratio >= 0.70) {
        const cost = decimalToNum(windows.replacementCostEstimate) ?? 8000;
        suggestions.push({
          key: 'upgrade-windows',
          title: 'Upgrade Windows',
          description:
            'Aging windows reduce energy efficiency and comfort. Modern double-pane or triple-pane windows cut heat loss significantly.',
          scenarioType: 'ENERGY_IMPROVEMENT',
          componentType: 'WINDOWS',
          urgency: resolveUrgency(ratio, windows.failureRiskScore),
          estimatedUpfrontCost: cost,
          reason: `Windows are ${Math.round(ratio * 100)}% through their typical lifespan`,
          suggestedInputPayload: {
            upfrontCost: cost,
            energySavingsPerYear: 250,
            comfortImpactDescription: 'Reduced drafts and improved indoor temperature control',
          },
        });
      }
    }

    // ── SOLAR — only suggest when twin has enough data to trust the absence ──
    const hasSolar = byType.has('SOLAR');
    const twinCompleteness = twin.completenessScore ?? 0;
    if (!hasSolar && twinCompleteness >= 0.40) {
      suggestions.push({
        key: 'consider-solar',
        title: 'Consider Solar Panels',
        description:
          'Solar panels can significantly reduce electricity bills and increase property value. Typical payback is 6–10 years.',
        scenarioType: 'ENERGY_IMPROVEMENT',
        componentType: 'SOLAR',
        urgency: 'LOW',
        estimatedUpfrontCost: 18000,
        reason: 'No solar system has been detected on this property',
        suggestedInputPayload: {
          upfrontCost: 18000,
          energySavingsPerYear: 1500,
          carbonOffsetTonsCO2PerYear: 3.2,
          comfortImpactDescription: 'Reduced reliance on grid energy',
        },
      });
    }

    // Score and sort: weighted by urgency, confidence, and estimated cost impact
    suggestions.sort((a, b) => {
      const aComp = byType.get(a.componentType ?? 'OTHER' as HomeTwinComponentType);
      const bComp = byType.get(b.componentType ?? 'OTHER' as HomeTwinComponentType);
      return (
        scoreCandidate(b.urgency, bComp?.confidenceScore ?? null, b.estimatedUpfrontCost) -
        scoreCandidate(a.urgency, aComp?.confidenceScore ?? null, a.estimatedUpfrontCost)
      );
    });

    return suggestions.slice(0, MAX_SUGGESTIONS);
  }
}
