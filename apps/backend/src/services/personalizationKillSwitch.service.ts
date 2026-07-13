// apps/backend/src/services/personalizationKillSwitch.service.ts
//
// System-wide emergency stop for the personalization engine, distinct from
// the per-consumer rollout flags in config/featureFlags.ts. Rollout flags are
// env-var driven and require a redeploy to change; this is DB-backed so an
// admin can flip it instantly with no deploy — the actual "kill switch"
// property called for in docs/personalization/09-implementation-roadmap.md
// ("Pause definitions first for content incidents. Stop queue producers/
// workers for systemic issues.") and 08-personalization-frd.md ("no duplicate
// cron execution; definition kill switch").
//
// Scoped to a single system-wide switch rather than per-definition (per
// docs/personalization/06-api-design.md's
// `POST /api/admin/personalization/definitions/:code/pause`) because no
// PersonalizationDefinition catalog exists yet — that's Phase 1 scope. This
// covers the "stop everything now" case; per-definition pause is a follow-up
// once the catalog exists.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordPersonalizationAuditEvent } from './personalizationAudit.service';

const SYSTEM_SETTING_KEY = 'personalization.killSwitch';

export interface PersonalizationKillSwitchState {
  paused: boolean;
  reason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
}

const DEFAULT_STATE: PersonalizationKillSwitchState = {
  paused: false,
  reason: null,
  pausedBy: null,
  pausedAt: null,
};

function parseState(value: Prisma.JsonValue | undefined): PersonalizationKillSwitchState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_STATE;
  }
  const v = value as Record<string, unknown>;
  return {
    paused: v.paused === true,
    reason: typeof v.reason === 'string' ? v.reason : null,
    pausedBy: typeof v.pausedBy === 'string' ? v.pausedBy : null,
    pausedAt: typeof v.pausedAt === 'string' ? v.pausedAt : null,
  };
}

/** Current kill-switch state. Safe to call frequently — single indexed row read. */
export async function getKillSwitchState(): Promise<PersonalizationKillSwitchState> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEY },
  });
  return parseState(setting?.value);
}

/**
 * The actual enforcement point: personalization evaluation/scheduling code
 * (once it exists) should check this before doing any work and no-op if paused.
 */
export async function isPersonalizationPaused(): Promise<boolean> {
  const state = await getKillSwitchState();
  return state.paused;
}

/**
 * Pauses personalization system-wide. Idempotent — calling this while already
 * paused just updates reason/timestamp/actor and still succeeds.
 */
export async function pausePersonalization(
  adminUserId: string,
  reason: string
): Promise<PersonalizationKillSwitchState> {
  const state: PersonalizationKillSwitchState = {
    paused: true,
    reason,
    pausedBy: adminUserId,
    pausedAt: new Date().toISOString(),
  };

  const previous = await getKillSwitchState();

  await prisma.systemSetting.upsert({
    where: { key: SYSTEM_SETTING_KEY },
    create: {
      key: SYSTEM_SETTING_KEY,
      value: state as unknown as Prisma.InputJsonValue,
      description: 'Personalization engine emergency kill switch (system-wide).',
    },
    update: {
      value: state as unknown as Prisma.InputJsonValue,
    },
  });

  await recordPersonalizationAuditEvent({
    actorUserId: adminUserId,
    action: 'PERSONALIZATION_KILL_SWITCH_PAUSED',
    entityType: 'SYSTEM_SETTING',
    entityId: SYSTEM_SETTING_KEY,
    reason,
    metadata: { previous, next: state },
  });

  return state;
}

/**
 * Resumes personalization system-wide. Idempotent — calling this while
 * already resumed just succeeds with no-op semantics.
 */
export async function resumePersonalization(
  adminUserId: string
): Promise<PersonalizationKillSwitchState> {
  const previous = await getKillSwitchState();

  await prisma.systemSetting.upsert({
    where: { key: SYSTEM_SETTING_KEY },
    create: {
      key: SYSTEM_SETTING_KEY,
      value: DEFAULT_STATE as unknown as Prisma.InputJsonValue,
      description: 'Personalization engine emergency kill switch (system-wide).',
    },
    update: {
      value: DEFAULT_STATE as unknown as Prisma.InputJsonValue,
    },
  });

  await recordPersonalizationAuditEvent({
    actorUserId: adminUserId,
    action: 'PERSONALIZATION_KILL_SWITCH_RESUMED',
    entityType: 'SYSTEM_SETTING',
    entityId: SYSTEM_SETTING_KEY,
    metadata: { previous, next: DEFAULT_STATE },
  });

  return DEFAULT_STATE;
}
