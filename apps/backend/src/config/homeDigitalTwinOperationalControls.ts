/**
 * Operator-facing kill switches for the Home Digital Twin projection and
 * scenario engine — separate from the user-cohort rollout flag in
 * featureFlags.ts (HOME_DIGITAL_TWIN), which controls who sees the tool at
 * all, not whether a specific part of the computation is currently safe to
 * run. These are read from the environment so an operator can flip them
 * without a deploy while a real fix is rolled out through git (see
 * HOME_DIGITAL_TWIN_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md Slice 7:
 * "category disable and model rollback switches"). Nothing here is user-
 * or cohort-aware; a change takes effect for every property on next read.
 */

import { HomeTwinComponentType } from '@prisma/client';

const VALID_COMPONENT_TYPES = new Set<string>([
  'ROOF', 'HVAC', 'WATER_HEATER', 'PLUMBING', 'ELECTRICAL', 'INSULATION',
  'WINDOWS', 'SOLAR', 'FLOORING', 'EXTERIOR', 'FOUNDATION', 'APPLIANCE', 'OTHER',
]);

/**
 * Component types to skip when (re)building the projection — e.g. a bug is
 * found in how one system type is modeled and needs to stop generating new
 * (or updated) rows while it's fixed, without disabling the whole twin.
 * Existing rows of a disabled type are left as-is; they are simply not
 * upserted on the next build, so they'll show as increasingly stale rather
 * than disappearing.
 */
export function getDisabledComponentTypes(): HomeTwinComponentType[] {
  const raw = process.env.HOME_DIGITAL_TWIN_DISABLED_COMPONENT_TYPES;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => VALID_COMPONENT_TYPES.has(s)) as HomeTwinComponentType[];
}

/**
 * Whole-engine kill switch for scenario computation — the practical
 * "rollback" lever available today. There is only one calculation model in
 * production (HomeTwinComputationRun.calculationVersion is always 1; no
 * second implementation exists to branch to), so a real version-rollback
 * would be dishonest to build. This switch instead buys time to revert the
 * offending code change through git and redeploy, without deleting any
 * homeowner data or blocking the rest of the twin (facts, corrections, and
 * decisions already recorded remain fully readable).
 */
export function isScenarioComputeDisabled(): boolean {
  return process.env.HOME_DIGITAL_TWIN_SCENARIO_COMPUTE_DISABLED === 'true';
}
