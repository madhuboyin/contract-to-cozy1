// apps/backend/src/config/smokeTestConfig.ts
//
// W6 item 2: property + internal-email allowlists for controlled smoke
// validation. This repo has only one environment (production) — a smoke
// run that touches a real property or sends a real email must be
// explicitly scoped to operator-controlled targets, never the full
// customer base. Deliberately env-var-based (no schema change, no
// caching) — mirrors the existing single-recipient precedent in
// weeklyRetentionReport.job.ts's RETENTION_REPORT_EMAIL, generalized to a
// small allowlist and read fresh on every call so an operator can adjust
// it without a restart, consistent with evaluateWorkerExecution()'s
// re-evaluate-per-tick convention.

export interface SmokeTestConfig {
  propertyAllowlist: Set<string>;
  recipientAllowlist: Set<string>;
}

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getSmokeTestConfig(): SmokeTestConfig {
  return {
    propertyAllowlist: new Set(parseList(process.env.SMOKE_TEST_PROPERTY_ALLOWLIST)),
    recipientAllowlist: new Set(
      parseList(process.env.SMOKE_TEST_RECIPIENT_EMAIL_ALLOWLIST).map((email) => email.toLowerCase()),
    ),
  };
}

export function isPropertyAllowlisted(propertyId?: string | null): boolean {
  if (!propertyId) return false;
  return getSmokeTestConfig().propertyAllowlist.has(propertyId);
}

export function isRecipientAllowlisted(email?: string | null): boolean {
  if (!email) return false;
  return getSmokeTestConfig().recipientAllowlist.has(email.toLowerCase());
}

/** Both allowlists have at least one entry configured — a smoke-checklist prerequisite. */
export function isSmokeAllowlistConfigured(): boolean {
  const config = getSmokeTestConfig();
  return config.propertyAllowlist.size > 0 && config.recipientAllowlist.size > 0;
}
