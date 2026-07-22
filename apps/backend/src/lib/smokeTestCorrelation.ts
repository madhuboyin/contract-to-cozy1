// apps/backend/src/lib/smokeTestCorrelation.ts
//
// W6 item 3: correlation IDs for records created by a smoke-test run, so
// they can be found and removed by exact ID afterward — never by a
// date/status sweep (see cleanupInventoryDrafts.job.ts for the pattern
// this deliberately avoids). Tags go into existing free-form JSON metadata
// columns (Notification.metadata, MortgageRateSnapshot.metadataJson) that
// already accept arbitrary keys at their current call sites — no schema
// migration needed.

import { randomUUID } from 'crypto';

const PREFIX = 'smoke';

export function generateSmokeCorrelationId(jobKey: string): string {
  return `${PREFIX}:${jobKey}:${Date.now()}:${randomUUID().slice(0, 8)}`;
}

export function isSmokeCorrelationId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}
