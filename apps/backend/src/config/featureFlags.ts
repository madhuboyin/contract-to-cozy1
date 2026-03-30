// apps/backend/src/config/featureFlags.ts
//
// Cohort-aware feature flag registry for Contract to Cozy.
// Supports phased rollout: DISABLED → INTERNAL (10%) → BETA (25%) → FULL (100%)
//
// Env var override pattern: TOOL_ROLLOUT_<KEY>=0|10|25|100
// Example: TOOL_ROLLOUT_EMERGENCY_HELP=25

// ============================================================================
// ROLLOUT COHORT TYPE
// ============================================================================

export type RolloutCohort = 'DISABLED' | 'INTERNAL' | 'BETA' | 'FULL';

// ============================================================================
// TOOL FLAG INTERFACE
// ============================================================================

export interface ToolFlag {
  key: string;
  label: string;
  rolloutPct: number;
  cohort: RolloutCohort;
}

// ============================================================================
// COHORT HELPER
// ============================================================================

/**
 * Maps a rollout percentage to a named cohort.
 *  0       → DISABLED
 *  1–10    → INTERNAL
 *  11–25   → BETA
 *  26–100  → FULL
 */
export function cohortFromPct(pct: number): RolloutCohort {
  if (pct <= 0) return 'DISABLED';
  if (pct <= 10) return 'INTERNAL';
  if (pct <= 25) return 'BETA';
  return 'FULL';
}

// ============================================================================
// DJB2 HASH — deterministic user bucketing
// ============================================================================

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    // Keep in 32-bit signed integer range
    hash |= 0;
  }
  // Convert to unsigned 32-bit integer for modulo safety
  return hash >>> 0;
}

// ============================================================================
// TOOL FLAG DEFAULTS — (key → defaultRolloutPct)
// ============================================================================

const TOOL_DEFAULTS: Record<string, { label: string; defaultPct: number }> = {
  EMERGENCY_HELP:            { label: 'Emergency Help',              defaultPct: 10  },
  DOCUMENT_VAULT:            { label: 'Document Vault',              defaultPct: 25  },
  BUDGET_PLANNER:            { label: 'Budget Planner',              defaultPct: 25  },
  CLIMATE_RISK:              { label: 'Climate Risk',                defaultPct: 10  },
  HOME_UPGRADES:             { label: 'Home Upgrades',               defaultPct: 10  },
  COVERAGE_INTELLIGENCE:     { label: 'Coverage Intelligence',       defaultPct: 100 },
  RISK_PREMIUM_OPTIMIZER:    { label: 'Risk Premium Optimizer',      defaultPct: 100 },
  REPLACE_OR_REPAIR:         { label: 'Replace or Repair',           defaultPct: 100 },
  DO_NOTHING_SIMULATOR:      { label: 'Do Nothing Simulator',        defaultPct: 100 },
  HOME_SAVINGS:              { label: 'Home Savings',                defaultPct: 100 },
  ENERGY_AUDIT:              { label: 'Energy Audit',                defaultPct: 25  },
  APPLIANCE_ORACLE:          { label: 'Appliance Oracle',            defaultPct: 100 },
  VALUE_TRACKER:             { label: 'Value Tracker',               defaultPct: 100 },
  HOME_EVENT_RADAR:          { label: 'Home Event Radar',            defaultPct: 100 },
  HOME_RISK_REPLAY:          { label: 'Home Risk Replay',            defaultPct: 100 },
  SERVICE_PRICE_RADAR:       { label: 'Service Price Radar',         defaultPct: 100 },
  PROPERTY_TAX:              { label: 'Property Tax',                defaultPct: 100 },
  COST_GROWTH:               { label: 'Cost Growth',                 defaultPct: 100 },
  INSURANCE_TREND:           { label: 'Insurance Trend',             defaultPct: 25  },
  NEGOTIATION_SHIELD:        { label: 'Negotiation Shield',          defaultPct: 100 },
  PRICE_FINALIZATION:        { label: 'Price Finalization',          defaultPct: 100 },
  COST_EXPLAINER:            { label: 'Cost Explainer',              defaultPct: 100 },
  TRUE_COST:                 { label: 'True Cost',                   defaultPct: 100 },
  SELL_HOLD_RENT:            { label: 'Sell Hold Rent',              defaultPct: 100 },
  COST_VOLATILITY:           { label: 'Cost Volatility',             defaultPct: 100 },
  BREAK_EVEN:                { label: 'Break Even',                  defaultPct: 100 },
  HOME_CAPITAL_TIMELINE:     { label: 'Home Capital Timeline',       defaultPct: 100 },
  SELLER_PREP:               { label: 'Seller Prep',                 defaultPct: 100 },
  STATUS_BOARD:              { label: 'Status Board',                defaultPct: 100 },
  HOME_DIGITAL_WILL:         { label: 'Home Digital Will',           defaultPct: 100 },
  HIDDEN_ASSET_FINDER:       { label: 'Hidden Asset Finder',         defaultPct: 100 },
  HOME_DIGITAL_TWIN:         { label: 'Home Digital Twin',           defaultPct: 100 },
  HOME_HABIT_COACH:          { label: 'Home Habit Coach',            defaultPct: 100 },
  MORTGAGE_REFINANCE_RADAR:  { label: 'Mortgage Refinance Radar',    defaultPct: 100 },
  HOME_GAZETTE:              { label: 'Home Gazette',                defaultPct: 100 },
  RENOVATION_RISK_ADVISOR:   { label: 'Renovation Risk Advisor',     defaultPct: 100 },
  PLANT_ADVISOR:             { label: 'Plant Advisor',               defaultPct: 100 },
  NEIGHBORHOOD_CHANGE_RADAR: { label: 'Neighborhood Change Radar',   defaultPct: 25  },
};

// ============================================================================
// BUILD TOOL_FLAGS REGISTRY — applies env var overrides
// ============================================================================

function buildRegistry(): Record<string, ToolFlag> {
  const registry: Record<string, ToolFlag> = {};
  for (const [key, { label, defaultPct }] of Object.entries(TOOL_DEFAULTS)) {
    const envKey = `TOOL_ROLLOUT_${key}`;
    const envVal = process.env[envKey];
    const pct = envVal !== undefined ? Math.max(0, Math.min(100, parseInt(envVal, 10) || 0)) : defaultPct;
    registry[key] = { key, label, rolloutPct: pct, cohort: cohortFromPct(pct) };
  }
  return registry;
}

export const TOOL_FLAGS: Record<string, ToolFlag> = buildRegistry();

// ============================================================================
// isToolEnabled — deterministic per-user bucketing
// ============================================================================

/**
 * Returns true if the given tool is enabled for the given user.
 *
 * - If `userId` is provided, uses djb2 hash bucketing for consistent per-user assignment.
 * - If no `userId` is provided, falls back to pct >= 100 (only fully-rolled-out tools pass).
 */
export function isToolEnabled(flagKey: string, userId?: string): boolean {
  const flag = TOOL_FLAGS[flagKey];
  if (!flag) return false;
  if (flag.rolloutPct <= 0) return false;
  if (flag.rolloutPct >= 100) return true;

  if (!userId) {
    // No user context — only allow if fully rolled out
    return false;
  }

  const bucket = djb2Hash(`${userId}:${flagKey}`) % 100;
  return bucket < flag.rolloutPct;
}

// ============================================================================
// BACKWARDS COMPATIBILITY — keep old FEATURE_FLAGS export
// ============================================================================

export const FEATURE_FLAGS = {
  SELLER_PREP: process.env.FEATURE_SELLER_PREP === 'true',
  PROPERTY_NARRATIVE_ENGINE: process.env.FEATURE_PROPERTY_NARRATIVE_ENGINE !== 'false',
};
