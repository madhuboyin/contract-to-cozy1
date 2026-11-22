// Guidance Advisor model call controls (owner decision 2026-11-22, BICC-OPS-006/008). The advisor is a Guidance Engine feature, not an Ask
// flow, and its model call sends property-derived text to a provider. It stays off until its own provider terms and property-data
// transmission are approved; nothing here is inferred from any Ask provider approval, and the authored/deterministic guidance continues
// to work without it.
function flag(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  return !['0', 'false', 'off', 'no'].includes(value.trim().toLowerCase());
}

export interface GuidanceAdvisorControls {
  /** True only when the flag is on, the kill switch is off, and both approvals are recorded. */
  enabled: boolean;
  featureFlag: boolean;
  killSwitch: boolean;
  providerTermsRecorded: boolean;
  propertyDataTransmissionApproved: boolean;
  /** The first missing precondition, for logs and tests. */
  disabledReason: 'FEATURE_OFF' | 'KILL_SWITCH' | 'PROVIDER_TERMS_NOT_RECORDED' | 'PROPERTY_DATA_NOT_APPROVED' | null;
}

export function readGuidanceAdvisorControls(env: NodeJS.ProcessEnv = process.env): GuidanceAdvisorControls {
  const featureFlag = flag(env.GUIDANCE_ADVISOR_AI_ENABLED);
  const killSwitch = flag(env.GUIDANCE_ADVISOR_AI_KILL_SWITCH);
  const providerTermsRecorded = flag(env.GUIDANCE_ADVISOR_PROVIDER_TERMS_RECORDED);
  const propertyDataTransmissionApproved = flag(env.GUIDANCE_ADVISOR_PROPERTY_DATA_APPROVED);
  const disabledReason = killSwitch ? 'KILL_SWITCH'
    : !featureFlag ? 'FEATURE_OFF'
      : !providerTermsRecorded ? 'PROVIDER_TERMS_NOT_RECORDED'
        : !propertyDataTransmissionApproved ? 'PROPERTY_DATA_NOT_APPROVED'
          : null;
  return { enabled: disabledReason === null, featureFlag, killSwitch, providerTermsRecorded, propertyDataTransmissionApproved, disabledReason };
}
