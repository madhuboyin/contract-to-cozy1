// apps/backend/src/services/releaseGate.service.ts
//
// KPI gate checker for rollout advancement.
// Evaluates safety/incident health for each tool flag before advancing cohorts.

import { prisma } from '../lib/prisma';
import { TOOL_FLAGS, cohortFromPct, RolloutCohort } from '../config/featureFlags';
import { logger } from '../lib/logger';

// ============================================================================
// INTERFACES
// ============================================================================

export interface GateCheckResult {
  toolKey: string;
  label: string;
  cohort: RolloutCohort;
  rolloutPct: number;
  pass: boolean;
  issues: string[];
  activeIncidentCount: number;
  checkedAt: string;
}

// ============================================================================
// checkGate — evaluate a single tool
// ============================================================================

/**
 * Checks the release gate for a given tool key.
 *
 * Gate rules:
 *  1. Flag must exist in the registry.
 *  2. No ACTIVE incidents in the last 24h.
 *  3. No CRITICAL severity incidents in the last 24h.
 */
export async function checkGate(toolKey: string): Promise<GateCheckResult> {
  const checkedAt = new Date().toISOString();
  const issues: string[] = [];

  const flag = TOOL_FLAGS[toolKey];
  if (!flag) {
    return {
      toolKey,
      label: toolKey,
      cohort: 'DISABLED',
      rolloutPct: 0,
      pass: false,
      issues: ['Unknown tool flag'],
      activeIncidentCount: 0,
      checkedAt,
    };
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count active incidents for this tool in the last 24h
  let activeIncidentCount = 0;
  try {
    activeIncidentCount = await prisma.incident.count({
      where: {
        typeKey: {
          contains: toolKey,
          mode: 'insensitive',
        },
        status: {
          in: ['ACTIVE'],
        },
        createdAt: {
          gte: since24h,
        },
      },
    });

    if (activeIncidentCount > 0) {
      issues.push(`${activeIncidentCount} active incidents in last 24h`);
    }

    // Count CRITICAL severity incidents in last 24h (any status)
    const criticalCount = await prisma.incident.count({
      where: {
        typeKey: {
          contains: toolKey,
          mode: 'insensitive',
        },
        severity: 'CRITICAL',
        createdAt: {
          gte: since24h,
        },
      },
    });

    if (criticalCount > 0) {
      issues.push(`${criticalCount} CRITICAL incidents in last 24h — rollout blocked`);
    }
  } catch (err) {
    issues.push('Failed to query incident data');
    logger.error({ err }, `[ReleaseGate] Error checking gate for ${toolKey}`);
  }

  return {
    toolKey: flag.key,
    label: flag.label,
    cohort: cohortFromPct(flag.rolloutPct),
    rolloutPct: flag.rolloutPct,
    pass: issues.length === 0,
    issues,
    activeIncidentCount,
    checkedAt,
  };
}

// ============================================================================
// checkAllGates — evaluate all registered tools
// ============================================================================

/**
 * Runs checkGate for all keys registered in TOOL_FLAGS.
 */
export async function checkAllGates(): Promise<GateCheckResult[]> {
  const toolKeys = Object.keys(TOOL_FLAGS);
  return Promise.all(toolKeys.map((key) => checkGate(key)));
}

// ============================================================================
// getReleaseSummary — aggregated rollout health
// ============================================================================

/**
 * Returns an aggregated summary of all release gate results.
 */
export async function getReleaseSummary(): Promise<{
  totalTools: number;
  passing: number;
  failing: number;
  byRolloutCohort: Record<RolloutCohort, number>;
  gates: GateCheckResult[];
}> {
  const gates = await checkAllGates();

  const passing = gates.filter((g) => g.pass).length;
  const failing = gates.length - passing;

  const byRolloutCohort: Record<RolloutCohort, number> = {
    DISABLED: 0,
    INTERNAL: 0,
    BETA: 0,
    FULL: 0,
  };

  for (const gate of gates) {
    byRolloutCohort[gate.cohort] = (byRolloutCohort[gate.cohort] ?? 0) + 1;
  }

  return {
    totalTools: gates.length,
    passing,
    failing,
    byRolloutCohort,
    gates,
  };
}
