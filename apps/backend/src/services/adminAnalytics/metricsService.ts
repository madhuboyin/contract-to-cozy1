// apps/backend/src/services/adminAnalytics/metricsService.ts
//
// Business logic wrapping repository queries for admin overview, trends,
// feature adoption, and top-tools metrics.

import {
  countTotalProperties,
  countActivatedProperties,
  countNewActivationsInPeriod,
  countDistinctActiveProperties,
  countTotalEvents,
  countEventsPerProperty,
  countDecisionsGuided,
  getDailyEventCounts,
  getFeatureUsage,
  getTopTools,
} from './repository';
import { resolveDateRange } from './schemas';
import type {
  AdminOverviewResponse,
  AdminTrendsResponse,
  AdminFeatureAdoptionResponse,
  AdminTopToolsResponse,
  DailyTrendPoint,
  FeatureAdoptionRow,
  TopToolRow,
} from './types';

// ============================================================================
// OVERVIEW
// ============================================================================

export async function getOverviewMetrics(
  fromRaw: Date | undefined,
  toRaw: Date | undefined,
): Promise<AdminOverviewResponse> {
  const range = resolveDateRange(fromRaw, toRaw, 30);

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalProperties,
    activatedProperties,
    newActivations,
    wahRaw,
    mahRaw,
    totalEvents,
    eventsPerProperty,
    decisionsRaw,
  ] = await Promise.all([
    countTotalProperties(),
    countActivatedProperties(),
    countNewActivationsInPeriod(range),
    countDistinctActiveProperties(sevenDaysAgo),
    countDistinctActiveProperties(thirtyDaysAgo),
    countTotalEvents(range),
    countEventsPerProperty(range),
    countDecisionsGuided(range),
  ]);

  // Median interactions per active home
  const counts = eventsPerProperty
    .map((r) => Number(r.count))
    .sort((a, b) => a - b);
  let median: number | null = null;
  if (counts.length > 0) {
    const mid = Math.floor(counts.length / 2);
    median = counts.length % 2 === 0
      ? (counts[mid - 1] + counts[mid]) / 2
      : counts[mid];
  }

  const activationRate = totalProperties > 0
    ? activatedProperties / totalProperties
    : 0;

  const avgInteractions = mahRaw > 0 ? totalEvents / mahRaw : 0;

  const wahOverMah = mahRaw > 0 ? wahRaw / mahRaw : null;

  const totalDecisions = decisionsRaw.reduce((sum, r) => sum + Number(r.count), 0);
  const byModule = decisionsRaw
    .filter((r) => r.moduleKey != null)
    .map((r) => ({ moduleKey: r.moduleKey as string, count: Number(r.count) }));

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    activation: {
      totalProperties,
      activatedProperties,
      activationRate,
      newActivationsInPeriod: newActivations,
    },
    activeHomes: {
      weeklyActiveHomes: wahRaw,
      monthlyActiveHomes: mahRaw,
      wahOverMah,
    },
    interactions: {
      totalInteractions: totalEvents,
      avgInteractionsPerActiveHome: avgInteractions,
      medianInteractionsPerHome: median,
    },
    decisionsGuided: {
      totalDecisionsGuided: totalDecisions,
      byModule,
    },
  };
}

// ============================================================================
// TRENDS
// ============================================================================

export async function getTrends(
  fromRaw: Date | undefined,
  toRaw: Date | undefined,
): Promise<AdminTrendsResponse> {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const rows = await getDailyEventCounts(range);

  // Build a complete day series filling gaps with zeroes
  const byDay = new Map<string, DailyTrendPoint>();
  for (const row of rows) {
    const dateStr = row.day.toISOString().slice(0, 10);
    byDay.set(dateStr, {
      date: dateStr,
      wah: 0, // will be computed below with a 7d rolling window
      eventCount: Number(row.eventCount),
      activeProperties: Number(row.activeProperties),
    });
  }

  // Fill missing days
  const current = new Date(range.from);
  while (current <= range.to) {
    const key = current.toISOString().slice(0, 10);
    if (!byDay.has(key)) {
      byDay.set(key, { date: key, wah: 0, eventCount: 0, activeProperties: 0 });
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const series = Array.from(byDay.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  // Rolling 7-day unique home approximation (using activeProperties as proxy per day)
  // A proper WAH requires a window query; here we sum unique daily properties
  // over last 7 days (may double count but is a reasonable approximation)
  for (let i = 0; i < series.length; i++) {
    const windowStart = Math.max(0, i - 6);
    const window = series.slice(windowStart, i + 1);
    const wahApprox = window.reduce((sum, p) => sum + p.activeProperties, 0);
    series[i].wah = wahApprox;
  }

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    granularity: 'day',
    series,
  };
}

// ============================================================================
// FEATURE ADOPTION
// ============================================================================

const FEATURE_LABELS: Record<string, string> = {
  property_profile: 'Property Profile',
  property_onboarding: 'Property Onboarding',
  property_activation: 'Property Activation',
  maintenance_task: 'Maintenance Task',
  seasonal_checklist: 'Seasonal Checklist',
  maintenance_prediction: 'Maintenance Prediction',
  risk_assessment: 'Risk Assessment',
  risk_mitigation: 'Risk Mitigation',
  inventory_item: 'Inventory Item',
  inventory_room: 'Inventory Room',
  inventory_scan: 'Inventory Scan',
  claim: 'Insurance Claim',
  incident: 'Incident',
  document_upload: 'Document Upload',
  vault: 'Vault',
  hidden_asset: 'Hidden Asset',
  negotiation_shield: 'Negotiation Shield',
  home_pulse: 'Daily Home Pulse',
  digital_twin: 'Home Digital Twin',
  home_score: 'Home Score',
  home_capital_timeline: 'Capital Timeline',
  knowledge_article: 'Knowledge Article',
  financial_efficiency: 'Financial Efficiency',
  coverage_analysis: 'Coverage Analysis',
  replace_repair: 'Replace vs Repair',
  admin_analytics_dashboard: 'Admin Analytics',
};

export async function getFeatureAdoption(
  fromRaw: Date | undefined,
  toRaw: Date | undefined,
  moduleKey?: string,
): Promise<AdminFeatureAdoptionResponse> {
  const range = resolveDateRange(fromRaw, toRaw, 30);

  const [activatedHomes, rows] = await Promise.all([
    countActivatedProperties(),
    getFeatureUsage(range, moduleKey),
  ]);

  const features: FeatureAdoptionRow[] = rows
    .filter((r) => r.featureKey != null)
    .map((r) => ({
      moduleKey: r.moduleKey ?? 'unknown',
      featureKey: r.featureKey as string,
      uniqueHomes: Number(r.uniqueHomes),
      totalEvents: Number(r.totalEvents),
      adoptionRate: activatedHomes > 0 ? Number(r.uniqueHomes) / activatedHomes : 0,
    }));

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    totalActivatedHomes: activatedHomes,
    features,
  };
}

// ============================================================================
// TOP TOOLS
// ============================================================================

export async function getTopToolsMetrics(
  fromRaw: Date | undefined,
  toRaw: Date | undefined,
  topN: number,
): Promise<AdminTopToolsResponse> {
  const range = resolveDateRange(fromRaw, toRaw, 30);
  const rows = await getTopTools(range, topN);

  const tools: TopToolRow[] = rows.map((r, idx) => {
    const fk = r.featureKey ?? '';
    return {
      moduleKey: r.moduleKey ?? 'unknown',
      featureKey: fk,
      label: FEATURE_LABELS[fk] ?? fk,
      uniqueHomes: Number(r.uniqueHomes),
      totalEvents: Number(r.totalEvents),
      rank: idx + 1,
    };
  });

  return {
    period: { from: range.from.toISOString(), to: range.to.toISOString() },
    topN,
    tools,
  };
}
