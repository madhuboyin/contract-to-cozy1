import type { PropertyContextSnapshot, PropertyFact } from '../../modules/propertyContext';

type ContextRow = Record<string, unknown>;

export interface ProtectionIssueReconciliation {
  suppressedGuidanceSignalIds: string[];
  suppressionReasons: Record<string, 'DUPLICATE_SIGNAL' | 'SOURCE_ISSUE_RESOLVED_OR_CLOSED'>;
}

function knownRows(context: PropertyContextSnapshot, key: string): ContextRow[] | null {
  const fact = context.facts[key] as PropertyFact<ContextRow[]> | undefined;
  return fact?.state === 'KNOWN' && Array.isArray(fact.value) ? fact.value : null;
}

function rowIds(rows: ContextRow[] | null): Set<string> | null {
  return rows ? new Set(rows.map((row) => String(row.id ?? '')).filter(Boolean)) : null;
}

export function reconcileProtectionIssues(context: PropertyContextSnapshot): ProtectionIssueReconciliation {
  const signals = knownRows(context, 'guidance.activeSignals') ?? [];
  const activeSources = new Map<string, Set<string> | null>([
    ['RECALLMATCH', rowIds(knownRows(context, 'recalls.unresolvedMatches'))],
    ['INSPECTIONFINDING', rowIds(knownRows(context, 'inspection.openFindings'))],
    ['INCIDENT', rowIds(knownRows(context, 'risk.activeIncidents'))],
    ['CLAIM', rowIds(knownRows(context, 'coverage.activeClaims'))],
  ]);
  const suppressed = new Set<string>();
  const reasons: ProtectionIssueReconciliation['suppressionReasons'] = {};
  const seenDedupeKeys = new Set<string>();

  for (const signal of signals) {
    const id = String(signal.id ?? '');
    if (!id) continue;
    const dedupeKey = typeof signal.dedupeKey === 'string' ? signal.dedupeKey : null;
    if (dedupeKey && seenDedupeKeys.has(dedupeKey)) {
      suppressed.add(id);
      reasons[id] = 'DUPLICATE_SIGNAL';
      continue;
    }
    if (dedupeKey) seenDedupeKeys.add(dedupeKey);

    const sourceType = String(signal.sourceEntityType ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
    const sourceId = typeof signal.sourceEntityId === 'string' ? signal.sourceEntityId : null;
    const activeIds = activeSources.get(sourceType);
    if (sourceId && activeIds && !activeIds.has(sourceId)) {
      suppressed.add(id);
      reasons[id] = 'SOURCE_ISSUE_RESOLVED_OR_CLOSED';
    }
  }

  return {
    suppressedGuidanceSignalIds: [...suppressed],
    suppressionReasons: reasons,
  };
}
