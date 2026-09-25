// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { type CorrectionOption } from '../askCorrectionFields';
import { humanDate } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch, InspectionResolution } from '../askHandlerSupport';

// Inspection-hub capability-card slice (FRD v1.43). The three confirmed INSPECTION_FINDING_UPDATE actions, declared on
// each finding row; the inline detail (InspectionFindingResultList) shows only those the finding's LIVE state allows.
// inspectionFindingAction parses each message back to exactly its own action.
export const INSPECTION_FINDING_ACTIONS = [
  { id: 'finding-accept', label: 'Accept as work', message: 'Accept this inspection finding as work.', action: 'ACCEPT' },
  { id: 'finding-dismiss', label: 'Dismiss', message: 'Dismiss this inspection finding.', action: 'DISMISS' },
  { id: 'finding-resolve', label: 'Mark resolved', message: 'Mark this inspection finding resolved.', action: 'RESOLVE' },
] as const;

export function inspectionFindingItemActions(role: HouseholdRole) {
  if (role === HouseholdRole.VIEWER) return [];
  return INSPECTION_FINDING_ACTIONS.map(({ id, label, message }) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'INSPECTION_FINDING_UPDATE' }));
}

// The actions a finding's recorded state allows, mirroring inspectionHub.service and the inline detail's
// findingActionsForLiveState: accepting as work needs an OPEN finding not already accepted; a dismissed or resolved
// finding cannot be dismissed or resolved again. Every confirm re-checks against the live record.
export function inspectionFindingActionAllowed(action: 'ACCEPT' | 'DISMISS' | 'RESOLVE', finding: { status: string; workDisposition: string }): boolean {
  if (action === 'ACCEPT') return finding.status === 'OPEN' && finding.workDisposition !== 'ACCEPTED';
  return finding.status !== 'DISMISSED' && finding.status !== 'RESOLVED';
}

// ASK_COZY_INLINE_WORKSPACE_FRD §11.10 (IW-PRES-015, FRD v1.75): each finding declares only the actions its state allows.
export function inspectionFindingItemActionsFor(role: HouseholdRole, finding: { status: string; workDisposition: string }) {
  const allowed = new Set(INSPECTION_FINDING_ACTIONS.filter(({ action }) => inspectionFindingActionAllowed(action, finding)).map(({ id }) => id));
  return inspectionFindingItemActions(role).filter((action) => allowed.has(action.id));
}

// Accept as work and Dismiss are collected in the deck and confirmed together; Mark resolved asks how the finding was
// fixed, so it keeps its own confirmation.
export const INSPECTION_FINDING_BATCH_ACTIONS: Readonly<Record<string, 'ACCEPT' | 'DISMISS'>> = { 'finding-accept': 'ACCEPT', 'finding-dismiss': 'DISMISS' };

export const INSPECTION_FINDING_DECK_PRESENTATION = {
  pattern: 'DECK' as const,
  swipeRightActionId: 'finding-accept',
  swipeLeftActionId: 'finding-dismiss',
  batch: { operationId: 'INSPECTION_FINDING_UPDATE', entityType: 'INSPECTION_FINDING', actionIds: Object.keys(INSPECTION_FINDING_BATCH_ACTIONS), message: 'Review my inspection finding decisions.' },
};

const INSPECTION_SEVERITY_LABELS: Record<string, string> = { SAFETY: 'Safety', MAJOR: 'Major', MINOR: 'Minor', MONITOR: 'Monitor', INFORMATIONAL: 'Informational' };

export function inspectionFindingDeckFacts(finding: { severity: string; estimatedCostCentsLow: number | null; estimatedCostCentsHigh: number | null }, inspectionDate: string | null) {
  const dollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;
  const low = finding.estimatedCostCentsLow;
  const high = finding.estimatedCostCentsHigh;
  return {
    tone: finding.severity === 'SAFETY' ? 'CRITICAL' as const : finding.severity === 'MAJOR' ? 'CAUTION' as const : 'DEFAULT' as const,
    badgeLabel: INSPECTION_SEVERITY_LABELS[finding.severity] ?? String(finding.severity).toLowerCase(),
    timingLabel: inspectionDate ? `Inspected ${inspectionDate}` : null,
    amountLabel: low && high && low !== high ? `Est. ${dollars(low)}–${dollars(high)}` : low || high ? `Est. ${dollars((low || high)!)}` : null,
  };
}

// The traditional hub pages. There is no /inspection route; earlier Ask links pointed there and were broken.
export function inspectionHubHref(propertyId: string, finding?: { id: string; reportId: string }): string {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}/inspection-hub`;
  return finding ? `${base}/${encodeURIComponent(finding.reportId)}?findingId=${encodeURIComponent(finding.id)}` : `${base}/open-items`;
}

async function inspectionFindingsResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const findings = await prisma.inspectionFinding.findMany({
    where: { propertyId, status: { in: ['OPEN', 'ACCEPTED_AS_IS'] }, report: { status: 'CONFIRMED' } },
    orderBy: [{ severity: 'asc' }, { updatedAt: 'desc' }], take: 50,
    include: { report: { select: { inspectionDate: true, inspectorName: true } } },
  });
  const href = inspectionHubHref(propertyId);
  const findingActions = inspectionFindingItemActions(access.role);
  if (findings.length === 0) return {
    status: 'ANSWERED', reasonCode: 'NO_OPEN_INSPECTION_FINDINGS',
    blocks: [{ type: 'EMPTY_STATE', id: 'inspection-findings-empty', title: 'No open confirmed inspection findings', body: 'Ask found no unresolved findings from a homeowner-confirmed inspection report.', actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href, style: 'PRIMARY' }] }], suggestions: [],
  };
  return {
    status: 'ANSWERED', reasonCode: 'INSPECTION_FINDINGS_FOUND',
    blocks: [{ type: 'GROUPED_LIST', filters: [], ...(findingActions.length ? { presentation: INSPECTION_FINDING_DECK_PRESENTATION } : {}), id: 'inspection-findings', title: 'Open inspection findings', description: 'These findings come only from confirmed inspection reports. Open a finding to accept it as work, dismiss it, or mark it resolved.', sections: [{ id: 'open', title: 'Needs review', count: findings.length, items: findings.map((finding) => ({ id: finding.id, title: `${finding.homeSystem}: ${finding.inspectorDescription}`, description: `${String(finding.severity).toLowerCase()} · ${finding.report.inspectorName ?? 'Inspector'} · ${humanDate(finding.report.inspectionDate) ?? 'date unavailable'}`, meta: [`Disposition: ${String(finding.workDisposition).toLowerCase().replace(/_/g, ' ')}`], status: String(finding.status), href: inspectionHubHref(propertyId, finding), entityType: 'INSPECTION_FINDING', parentId: finding.reportId, actions: inspectionFindingItemActionsFor(access.role, finding), ...inspectionFindingDeckFacts(finding, humanDate(finding.report.inspectionDate) ?? null) })) }], actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href, style: 'SECONDARY' }] }],
    suggestions: findings.slice(0, 2).map((finding) => `Accept ${finding.homeSystem} finding ${finding.id} as work`),
  };
}

function inspectionFindingAction(message: string): 'ACCEPT' | 'DISMISS' | 'RESOLVE' | null {
  if (/\baccept|track|make (?:this )?work\b/i.test(message)) return 'ACCEPT';
  if (/\bdismiss|not applicable|ignore\b/i.test(message)) return 'DISMISS';
  if (/\bresolve|already (?:fixed|resolved)|completed\b/i.test(message)) return 'RESOLVE';
  return null;
}

// Resolving asks what the traditional "Mark as Resolved" dialog asks: how it was resolved (the same five methods,
// defaulting to contractor work), optional notes and an optional cost. FRD v1.43: Ask previously wrote the method
// 'HOMEOWNER_CONFIRMED', which is not an InspectionResolutionMethod value, so every Ask resolve would have been
// rejected by the database.
const INSPECTION_RESOLUTION_METHOD_OPTIONS: readonly CorrectionOption[] = [
  { label: 'Contractor work', value: 'CONTRACTOR_WORK' },
  { label: 'DIY repair', value: 'DIY' },
  { label: 'Seller repair', value: 'SELLER_REPAIR' },
  { label: 'Credited at closing', value: 'CREDITED_AT_CLOSING' },
  { label: 'Dismissed / not applicable', value: 'DISMISSED' },
];

export const INSPECTION_RESOLUTION_DEFAULT: InspectionResolution = { method: 'CONTRACTOR_WORK', notes: null, costCents: null };

export function inspectionResolutionEditableFields(resolution: InspectionResolution) {
  return [
    { key: 'method', label: 'How was this resolved?', type: 'SELECT' as const, value: resolution.method, options: [...INSPECTION_RESOLUTION_METHOD_OPTIONS] },
    { key: 'notes', label: 'Notes (optional)', type: 'TEXTAREA' as const, value: resolution.notes ?? '' },
    { key: 'costCents', label: 'Cost in dollars (optional)', type: 'MONEY' as const, value: resolution.costCents === null ? '' : (resolution.costCents / 100).toFixed(2) },
  ];
}

export const inspectionFindingVersion = (finding: { id: string; status: string; workDisposition: string; updatedAt: Date }) =>
  createHash('sha256').update(`${finding.id}:${finding.status}:${finding.workDisposition}:${finding.updatedAt.toISOString()}`).digest('hex');

// IW-PRES-015 (FRD v1.75): the card deck's collected decisions, proposed together for ONE confirmation. Only Accept as
// work and Dismiss can be batched. A decision whose finding is gone, closed or not in an allowed state is left out and
// named; nothing is written here.
async function inspectionFindingBatchProposal(propertyId: string, decisions: Array<{ entityId: string; actionId: string }>): Promise<AskOperationResult> {
  const latest = new Map<string, string>();
  decisions.forEach((decision) => latest.set(decision.entityId, decision.actionId));
  const findings = await prisma.inspectionFinding.findMany({
    where: { propertyId, id: { in: [...latest.keys()] }, status: { in: ['OPEN', 'ACCEPTED_AS_IS'] }, report: { status: 'CONFIRMED' } },
    select: { id: true, reportId: true, homeSystem: true, inspectorDescription: true, status: true, workDisposition: true, updatedAt: true },
  });
  const byId = new Map(findings.map((finding) => [finding.id, finding]));
  const included: Array<{ finding: typeof findings[number]; action: 'ACCEPT' | 'DISMISS' }> = [];
  const leftOut: string[] = [];
  latest.forEach((actionId, findingId) => {
    const finding = byId.get(findingId);
    const action = INSPECTION_FINDING_BATCH_ACTIONS[actionId];
    const title = finding ? `${finding.homeSystem}: ${finding.inspectorDescription}` : 'A finding';
    if (!finding) leftOut.push(`${title} is no longer open, or is no longer on a confirmed report for this home.`);
    else if (!action) leftOut.push(`${title}: that action needs its own confirmation.`);
    else if (!inspectionFindingActionAllowed(action, finding)) leftOut.push(`${title} can no longer be ${action === 'ACCEPT' ? 'accepted as work' : 'dismissed'}.`);
    else included.push({ finding, action });
  });
  const href = inspectionHubHref(propertyId);
  const leftOutBlock = leftOut.length ? [{ type: 'LIMITATION' as const, id: 'inspection-finding-batch-left-out', title: `${leftOut.length} decision${leftOut.length === 1 ? ' was' : 's were'} left out`, body: leftOut.slice(0, 10).join(' '), severity: 'CAUTION' as const }] : [];
  if (included.length === 0) return {
    status: 'BLOCKED', reasonCode: 'INSPECTION_FINDING_BATCH_EMPTY',
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-batch-empty', title: 'Nothing to confirm', body: 'None of these decisions can be applied to the findings as they are now. Nothing was changed.', tone: 'CAUTION', actions: [] }, ...leftOutBlock],
    suggestions: ['Show remaining inspection findings'],
  };
  const entries = included.map(({ finding, action }) => ({ findingId: finding.id, reportId: finding.reportId, action, contextVersion: inspectionFindingVersion(finding) }));
  const contextVersion = createHash('sha256').update(entries.map((entry) => `${entry.findingId}:${entry.action}:${entry.contextVersion}`).join('|')).digest('hex');
  const accepts = included.filter((entry) => entry.action === 'ACCEPT');
  const dismissals = included.filter((entry) => entry.action === 'DISMISS');
  const count = (n: number) => `${n} finding${n === 1 ? '' : 's'}`;
  const reviewItem = ({ finding }: typeof included[number]) => ({ id: finding.id, title: `${finding.homeSystem}: ${finding.inspectorDescription}`, description: null, meta: [], status: String(finding.status), href: inspectionHubHref(propertyId, finding), entityType: 'INSPECTION_FINDING', parentId: finding.reportId });
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSPECTION_FINDING_BATCH_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { inspectionFindingBatch: entries },
    blocks: [
      { type: 'SUMMARY', id: 'inspection-finding-batch-review', title: `Review ${count(included.length)}`, body: `${accepts.length ? `Accepting as work creates or reuses tracked work for ${count(accepts.length)}. ` : ''}${dismissals.length ? `Dismissing closes ${count(dismissals.length)} without work. ` : ''}Nothing changes until you confirm. Each finding is checked again when you confirm.`, tone: 'DEFAULT', actions: [] },
      { type: 'GROUPED_LIST', filters: [], id: 'inspection-finding-batch-decisions', title: 'Your decisions', description: null, sections: [
        ...(accepts.length ? [{ id: 'accept', title: 'Accept as work', count: accepts.length, items: accepts.map(reviewItem) }] : []),
        ...(dismissals.length ? [{ id: 'dismiss', title: 'Dismiss', count: dismissals.length, items: dismissals.map(reviewItem) }] : []),
      ], actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href, style: 'SECONDARY' }] },
      ...leftOutBlock,
    ],
    confirmation: {
      confirmationId: `inspection-finding-batch-${contextVersion.slice(0, 16)}`, version: 1,
      title: `Confirm ${count(included.length)}?`,
      description: 'These changes are saved to the canonical inspection record, one finding at a time.',
      fields: [
        ...(accepts.length ? [{ label: 'Accept as work', value: count(accepts.length) }] : []),
        ...(dismissals.length ? [{ label: 'Dismiss', value: count(dismissals.length) }] : []),
      ],
      editableFields: [], confirmLabel: `Confirm ${included.length} change${included.length === 1 ? '' : 's'}`,
      consentText: 'I have reviewed these inspection finding decisions and want them saved.',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    },
    suggestions: [],
  };
}

async function inspectionFindingUpdateResult(propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  if (launchContext?.batchDecisions?.length) return inspectionFindingBatchProposal(propertyId, launchContext.batchDecisions);
  const findings = await prisma.inspectionFinding.findMany({ where: { propertyId, status: { in: ['OPEN', 'ACCEPTED_AS_IS'] }, report: { status: 'CONFIRMED' } }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, reportId: true, homeSystem: true, inspectorDescription: true, severity: true, status: true, workDisposition: true, updatedAt: true } });
  const selected = exactEntityMatch(findings.map((finding) => ({ ...finding, title: `${finding.homeSystem}: ${finding.inspectorDescription}` })), message, launchContext);
  const action = inspectionFindingAction(message);
  const href = selected ? inspectionHubHref(propertyId, selected) : inspectionHubHref(propertyId);
  if (!selected || !action) return {
    status: 'NEEDS_ENTITY', reasonCode: 'INSPECTION_FINDING_TARGET_REQUIRED',
    blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'inspection-finding-targets', title: 'Choose a finding and action', description: 'Use the finding id or exact system/description and say accept, dismiss, or resolve.', sections: [{ id: 'findings', title: 'Open confirmed findings', count: findings.length, items: findings.map((finding) => ({ id: finding.id, title: `${finding.homeSystem}: ${finding.inspectorDescription}`, description: String(finding.severity).toLowerCase(), meta: [], status: String(finding.status), href })) }], actions: [{ id: 'open-inspection', label: 'Open Inspection Hub', href, style: 'SECONDARY' }] }], suggestions: [],
  };
  const contextVersion = createHash('sha256').update(`${selected.id}:${selected.status}:${selected.workDisposition}:${selected.updatedAt.toISOString()}`).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'INSPECTION_FINDING_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { inspectionFindingId: selected.id, inspectionReportId: selected.reportId, inspectionFindingAction: action, inspectionFindingContextVersion: contextVersion, ...(action === 'RESOLVE' ? { inspectionResolution: INSPECTION_RESOLUTION_DEFAULT } : {}), confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'inspection-finding-review', title: `Review ${action.toLowerCase()} action`, body: action === 'ACCEPT' ? 'Accepting creates or reuses canonical Operational Work and routes it to the appropriate maintenance, guidance, or project workflow.' : action === 'DISMISS' ? 'Dismissing marks this canonical finding not active and reconciles linked work.' : 'Resolving records a homeowner-confirmed outcome on this canonical finding.', tone: 'CAUTION', actions: [{ id: 'open-finding', label: 'Review in Inspection Hub', href, style: 'SECONDARY' }] }],
    confirmation: { confirmationId: `inspection-finding-${selected.id}-1`, version: 1, title: `${action[0]}${action.slice(1).toLowerCase()} this finding?`, description: selected.inspectorDescription, fields: [{ label: 'System', value: selected.homeSystem }, { label: 'Severity', value: String(selected.severity).toLowerCase() }, { label: 'Action', value: action.toLowerCase() }], editableFields: action === 'RESOLVE' ? inspectionResolutionEditableFields(INSPECTION_RESOLUTION_DEFAULT) : [], confirmLabel: `${action[0]}${action.slice(1).toLowerCase()} finding`, consentText: 'I reviewed this inspection finding and authorize updating its canonical disposition.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

registerCapabilityHandler('inspection-findings.review', async (envelope) => inspectionFindingsResult(envelope.userId, envelope.propertyId!));

registerCapabilityHandler('inspection-findings.update', async (envelope) => inspectionFindingUpdateResult(envelope.propertyId!, envelope.message, envelope.launchContext));
