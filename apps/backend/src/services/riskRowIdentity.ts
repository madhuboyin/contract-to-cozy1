import { resolveCanonicalAssetLabel } from '../productFramework/homeAssetDisplay';

/**
 * The pure parts of how a stored risk-report row becomes an orchestrated Home Action, shared by the feed
 * (`orchestration.service.ts`) and by the read-only measurement script (`scripts/measure-asset-identity-conflicts.ts`)
 * so the script counts exactly what the feed would raise and cannot drift from it.
 */
export function normalizeUpper(raw: unknown): string {
  return String(raw ?? '').trim().toUpperCase();
}

/** Whether a risk-report row is surfaced as an action at all (unchanged from the feed's own rule). */
export function isRiskActionable(d: any): boolean {
  const HIGH_LEVELS = new Set(['HIGH', 'CRITICAL']);
  const ACTION_STATUSES = new Set([
    'NEEDS_ATTENTION',
    'ACTION_REQUIRED',
    'MISSING_DATA',
    'NEEDS_REVIEW',
  ]);

  const riskLevel = normalizeUpper(d?.riskLevel ?? d?.severity);
  const status = normalizeUpper(d?.status);
  const hasRecommendedAction =
    typeof d?.recommendedAction === 'string' && d.recommendedAction.trim().length > 0;

  return Boolean(
    HIGH_LEVELS.has(riskLevel) || ACTION_STATUSES.has(status) || hasRecommendedAction
  );
}

/**
 * The "names this item as X but classifies its system as Y" rule: both labels must resolve to a known canonical
 * asset AND differ. A label that does not resolve (null) can never conflict, which is why every `MAJOR_APPLIANCE_*`
 * system type is inert here.
 */
export function detectAssetIdentityConflict(namedLabel: string | null | undefined, typedLabel: string | null | undefined): boolean {
  return Boolean(namedLabel && typedLabel && namedLabel !== typedLabel);
}

/** What the feed would compute for one stored risk-report detail row (a risk row is never a coverage-gap row). */
export function riskRowIdentity(d: any): { title: string; systemType: string; namedLabel: string | null; typedLabel: string | null; conflict: boolean } {
  const systemType = String(d?.systemType ?? d?.assetName ?? 'Unknown');
  const title = d?.assetName || systemType;
  const namedLabel = resolveCanonicalAssetLabel(title);
  const typedLabel = resolveCanonicalAssetLabel(systemType);
  return { title: String(title), systemType, namedLabel, typedLabel, conflict: detectAssetIdentityConflict(namedLabel, typedLabel) };
}
