// Ask Intelligence FRD §18.3, Phase 9C. A DB-backed, no-deploy feature flag
// for home-action proactive delivery -- mirrors
// personalizationKillSwitch.service.ts's SystemSetting-backed pattern rather
// than the env-var-only HOME_ACTION_PROACTIVE_DELIVERY_ENABLED flag this
// module supersedes as the primary switch (the env var still applies as a
// deploy-time default/floor; either one being off stops sends). This is a
// simple on/off toggle an admin can flip instantly, not an approval
// workflow -- there is no blocker list, cohort, or governance review here,
// deliberately, since this product has no real users yet to gate a rollout
// against.

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const SYSTEM_SETTING_KEY = 'homeActionProactiveDelivery.killSwitch';

export interface HomeActionProactiveDeliveryKillSwitchState {
  paused: boolean;
  reason: string | null;
  pausedBy: string | null;
  pausedAt: string | null;
}

const DEFAULT_STATE: HomeActionProactiveDeliveryKillSwitchState = {
  paused: false,
  reason: null,
  pausedBy: null,
  pausedAt: null,
};

function parseState(value: Prisma.JsonValue | undefined): HomeActionProactiveDeliveryKillSwitchState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_STATE;
  const v = value as Record<string, unknown>;
  return {
    paused: v.paused === true,
    reason: typeof v.reason === 'string' ? v.reason : null,
    pausedBy: typeof v.pausedBy === 'string' ? v.pausedBy : null,
    pausedAt: typeof v.pausedAt === 'string' ? v.pausedAt : null,
  };
}

export async function getHomeActionProactiveDeliveryKillSwitchState(): Promise<HomeActionProactiveDeliveryKillSwitchState> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: SYSTEM_SETTING_KEY } });
  return parseState(setting?.value);
}

/** The actual enforcement point -- checked alongside the env-var flag before any evaluation pass does work. */
export async function isHomeActionProactiveDeliveryPaused(): Promise<boolean> {
  const state = await getHomeActionProactiveDeliveryKillSwitchState();
  return state.paused;
}

export async function pauseHomeActionProactiveDelivery(
  adminUserId: string,
  reason: string,
): Promise<HomeActionProactiveDeliveryKillSwitchState> {
  const state: HomeActionProactiveDeliveryKillSwitchState = {
    paused: true, reason, pausedBy: adminUserId, pausedAt: new Date().toISOString(),
  };
  await prisma.systemSetting.upsert({
    where: { key: SYSTEM_SETTING_KEY },
    create: { key: SYSTEM_SETTING_KEY, value: state as unknown as Prisma.InputJsonValue, description: 'Home Action proactive external delivery kill switch.' },
    update: { value: state as unknown as Prisma.InputJsonValue },
  });
  return state;
}

export async function resumeHomeActionProactiveDelivery(): Promise<HomeActionProactiveDeliveryKillSwitchState> {
  await prisma.systemSetting.upsert({
    where: { key: SYSTEM_SETTING_KEY },
    create: { key: SYSTEM_SETTING_KEY, value: DEFAULT_STATE as unknown as Prisma.InputJsonValue, description: 'Home Action proactive external delivery kill switch.' },
    update: { value: DEFAULT_STATE as unknown as Prisma.InputJsonValue },
  });
  return DEFAULT_STATE;
}
