export type RefinanceAlertRolloutMode =
  | 'DISABLED'
  | 'ALLOWLIST'
  | 'GENERAL';

export type RefinanceAlertRolloutDecision = {
  allowed: boolean;
  mode: RefinanceAlertRolloutMode | 'INVALID';
  reason:
    | null
    | 'ROLLOUT_DISABLED'
    | 'RECIPIENT_NOT_IN_COHORT'
    | 'INVALID_ROLLOUT_MODE';
};

function parseRecipientAllowlist(
  env: NodeJS.ProcessEnv,
): Set<string> {
  return new Set(
    (env.REFINANCE_ALERT_RECIPIENT_EMAIL_ALLOWLIST ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function decideRefinanceAlertRollout(
  email: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): RefinanceAlertRolloutDecision {
  const rawMode = (
    env.REFINANCE_ALERT_ROLLOUT_MODE ?? 'ALLOWLIST'
  ).trim().toUpperCase();
  if (rawMode === 'DISABLED') {
    return {
      allowed: false,
      mode: 'DISABLED',
      reason: 'ROLLOUT_DISABLED',
    };
  }
  if (rawMode === 'GENERAL') {
    return { allowed: true, mode: 'GENERAL', reason: null };
  }
  if (rawMode !== 'ALLOWLIST') {
    return {
      allowed: false,
      mode: 'INVALID',
      reason: 'INVALID_ROLLOUT_MODE',
    };
  }
  const allowed = Boolean(
    email &&
    parseRecipientAllowlist(env).has(email.trim().toLowerCase()),
  );
  return {
    allowed,
    mode: 'ALLOWLIST',
    reason: allowed ? null : 'RECIPIENT_NOT_IN_COHORT',
  };
}

export function isRefinanceNotification(notification: {
  type?: string | null;
  metadata?: unknown;
}): boolean {
  if (String(notification.type ?? '').startsWith('REFINANCE_')) return true;
  const metadata =
    notification.metadata &&
    typeof notification.metadata === 'object' &&
    !Array.isArray(notification.metadata)
      ? notification.metadata as Record<string, unknown>
      : {};
  const policy =
    metadata.notificationPolicy &&
    typeof metadata.notificationPolicy === 'object' &&
    !Array.isArray(metadata.notificationPolicy)
      ? metadata.notificationPolicy as Record<string, unknown>
      : {};
  return String(policy.category ?? '').toUpperCase() === 'REFINANCE';
}

export const REFINANCE_ALERT_ROLLOUT_SUPPRESSION_REASON =
  'REFINANCE_ALERT_RECIPIENT_NOT_IN_COHORT';
