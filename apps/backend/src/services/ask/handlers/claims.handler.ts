// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { ClaimType as PrismaClaimType, HouseholdRole } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock, type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch } from '../askHandlerSupport';
import { type AskViewState } from '../support/executionState';
import { containsFilterContinuation } from '../askFollowUpContext';
import { loadAskViewState } from './maintenance.handler';
import type { ClaimStatus, ClaimType } from '../../../types/claims.types';
import { isValidTransition as isValidClaimTransition } from '../../claims/claims.transitions';

// P04 fix (same defect independently found in Phase 8's Protection doc,
// same root cause and same fix shape as B06's Buyer conflict descriptions
// above -- confirmClaimTransition previously threw a static "This claim
// changed while confirmation was open..." with zero claim-specific
// content; the shared generic error-catch wrapper renders error.message
// directly with details/actions hardcoded empty, so the static string WAS
// the entire disclosure). CLOSED gets its own phrasing (a claim closing is
// the one status here analogous to Maintenance/Buyer's "already
// completed" terminal case); every other status falls back to naming the
// claim's current status plainly.
const CLAIM_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'a draft', IN_PROGRESS: 'in progress', SUBMITTED: 'submitted', UNDER_REVIEW: 'under review', APPROVED: 'approved', DENIED: 'denied', CLOSED: 'closed',
};

export function claimConflictDescription(claim: { title: string; status: string }): string {
  if (claim.status === 'CLOSED') {
    return `"${claim.title}" was closed in another session before this change could be applied.`;
  }
  const statusLabel = CLAIM_STATUS_LABELS[claim.status] ?? claim.status.toLowerCase().replace(/_/g, ' ');
  return `"${claim.title}" changed in another session before this could be confirmed -- it is now ${statusLabel}. Review its current state and try again.`;
}

export const CLAIM_TYPE_PATTERNS: readonly [RegExp, ClaimType][] = [
  [/water|leak|flood|plumb/i, 'WATER_DAMAGE'], [/fire|smoke/i, 'FIRE_SMOKE'],
  [/storm|wind|hail|roof/i, 'STORM_WIND_HAIL'], [/theft|stolen|vandal/i, 'THEFT_VANDALISM'],
  [/liability|injur/i, 'LIABILITY'], [/hvac|furnace|air condition|heat pump/i, 'HVAC'],
  [/electrical|wiring|breaker/i, 'ELECTRICAL'], [/appliance|refrigerator|washer|dryer/i, 'APPLIANCE'],
];

function claimTypeFromMessage(message: string): ClaimType | null {
  return CLAIM_TYPE_PATTERNS.find(([pattern]) => pattern.test(message))?.[1]
    ?? (/\bother\b/i.test(message) ? 'OTHER' : null);
}

// P03 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
// hoisted out of claimTitleFromMessage so the same label set also backs the
// CLAIM_FILE_INPUTS capture form's SINGLE_SELECT options below -- one source
// of truth for the 10 declared ClaimType values, not two independently
// maintained lists.
const CLAIM_TYPE_LABELS: Record<ClaimType, string> = {
  WATER_DAMAGE: 'Water damage claim', FIRE_SMOKE: 'Fire or smoke claim', STORM_WIND_HAIL: 'Storm, wind, or hail claim',
  THEFT_VANDALISM: 'Theft or vandalism claim', LIABILITY: 'Liability claim', HVAC: 'HVAC claim', PLUMBING: 'Plumbing claim',
  ELECTRICAL: 'Electrical claim', APPLIANCE: 'Appliance claim', OTHER: 'Home incident claim',
};

function claimTitleFromMessage(message: string, type: ClaimType): string {
  const explicit = message.match(/\b(?:titled?|called)\s+["']?([^"'.]{3,120})/i)?.[1]?.trim();
  return explicit || CLAIM_TYPE_LABELS[type];
}

// P03 fix: mirrors MaintenanceTaskWorkflowInputSchema's own convention --
// the structured answer a homeowner submits through CLAIM_FILE_INPUTS'
// capture form once the incident type can't be parsed from free text alone.
export const ClaimFileWorkflowInputSchema = z.object({
  type: z.nativeEnum(PrismaClaimType),
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(1).max(1000),
}).strict();

type ClaimFileWorkflowInput = z.infer<typeof ClaimFileWorkflowInputSchema>;

function nextClaimStatus(message: string): ClaimStatus | null {
  if (/\bunder review\b/i.test(message)) return 'UNDER_REVIEW';
  if (/\bapprove(?:d)?\b/i.test(message)) return 'APPROVED';
  if (/\bden(?:y|ied)\b/i.test(message)) return 'DENIED';
  if (/\bclose(?:d)?\b/i.test(message)) return 'CLOSED';
  if (/\bsubmit(?:ted)?\b/i.test(message)) return 'SUBMITTED';
  if (/\b(?:start|in progress)\b/i.test(message)) return 'IN_PROGRESS';
  return null;
}

export async function claimFileResult(propertyId: string, message: string, suppliedInput?: ClaimFileWorkflowInput): Promise<AskOperationResult> {
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/claims`;
  const type = suppliedInput?.type ?? claimTypeFromMessage(message);
  // P03 fix (docs/architecture/ASK_COZY_PHASE8_PROTECTION_ACCEPTANCE_VERIFICATION.md):
  // the audit found the missing-type branch used durableFreeTextClarification,
  // which carries forward none of the original message -- a homeowner whose
  // first message didn't match a recognized incident-type pattern had to
  // retype the whole description, not just add the missing type. Switched to
  // a real captureRequests GROUP form (CLAIM_FILE_INPUTS) with
  // currentAnswer pre-filling the original message as the description and
  // any explicit "titled X" match, mirroring MAINTENANCE_TASK_CREATE's own
  // richer pattern exactly.
  if (!type) {
    const explicitTitle = message.match(/\b(?:titled?|called)\s+["']?([^"'.]{3,120})/i)?.[1]?.trim();
    const currentAnswer: Record<string, unknown> = { description: message };
    if (explicitTitle) currentAnswer.title = explicitTitle;
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'CLAIM_TYPE_REQUIRED',
      blocks: [{ type: 'SUMMARY', id: 'claim-type-required', title: 'Describe the incident before filing', body: 'Ask will create only a draft canonical claim after you identify the incident type and confirm. It will not submit anything to an insurer.', tone: 'CAUTION', actions: [{ id: 'open-claims', label: 'Open Claims', href, style: 'SECONDARY' }] }],
      captureRequests: [{
        requirementId: `claim-file-${createHash('sha256').update(message).digest('hex').slice(0, 20)}`,
        captureKey: 'CLAIM_FILE_INPUTS', classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
        title: 'Claim details', question: 'What happened, and what type of incident is this?',
        helpText: 'Nothing is filed with an insurer or warranty provider yet — you will review the draft claim before it is created.',
        inputSchema: { type: 'GROUP', fields: [
          { key: 'type', label: 'Incident type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: Object.entries(CLAIM_TYPE_LABELS).map(([value, label]) => ({ label, value })) } },
          { key: 'title', label: 'Title', helpText: 'Optional — Ask will suggest one from the incident type otherwise.', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 160 } },
          { key: 'description', label: 'What happened', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 1000 } },
        ] },
        currentAnswer, allowNotSure: false, sensitivity: 'STANDARD',
        destinationLabel: 'Used to prepare the draft claim; nothing is saved until you confirm', confirmationText: null,
        expectedContextVersion: `claim-file-${createHash('sha256').update(message).digest('hex').slice(0, 20)}`,
      }],
      suggestions: [],
    };
  }
  const description = suppliedInput?.description ?? message;
  const title = suppliedInput?.title || claimTitleFromMessage(description, type);
  const contextVersion = createHash('sha256').update(JSON.stringify({ propertyId, title, type })).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'CLAIM_FILE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { claimTitle: title, claimType: type, claimDescription: description, claimSourceType: /warranty/i.test(description) ? 'HOME_WARRANTY' : /insurance/i.test(description) ? 'INSURANCE' : 'UNKNOWN', confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'claim-file-review', title: 'Review the draft claim', body: 'Confirming creates a draft claim, its checklist, timeline event, and linked Operational Work Item. It does not transmit the claim to an insurer or warranty provider.', tone: 'CAUTION', actions: [{ id: 'open-claims', label: 'Open Claims instead', href, style: 'SECONDARY' }] }],
    confirmation: { confirmationId: `claim-file-${contextVersion.slice(0, 16)}`, version: 1, title: 'Create this draft claim?', description: 'The claim stays in ContractToCozy until you separately submit it through the appropriate provider channel.', fields: [{ label: 'Title', value: title }, { label: 'Incident type', value: type.toLowerCase().replace(/_/g, ' ') }, { label: 'Initial status', value: 'Draft' }], editableFields: [], confirmLabel: 'Create draft claim', consentText: 'I confirm this incident record is accurate and authorize creating the draft claim and linked home work.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

async function claimTransitionResult(propertyId: string, message: string, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const claims = await prisma.claim.findMany({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, status: true, updatedAt: true } });
  const selected = exactEntityMatch(claims, message, launchContext);
  const nextStatus = nextClaimStatus(message);
  const href = `/dashboard/properties/${encodeURIComponent(propertyId)}/claims`;
  if (!selected || !nextStatus) return {
    status: 'NEEDS_ENTITY', reasonCode: 'CLAIM_TRANSITION_TARGET_REQUIRED',
    blocks: [{ type: 'GROUPED_LIST', filters: [], id: 'claim-transition-targets', title: 'Choose a claim and valid next status', description: 'Use the exact claim title and say submit, move to under review, approve, deny, or close. Ask will recheck the legal transition before saving.', sections: [{ id: 'claims', title: 'Recorded claims', count: claims.length, items: claims.map((claim) => ({ id: claim.id, title: claim.title, description: `Current status: ${String(claim.status).toLowerCase().replace(/_/g, ' ')}`, meta: [], status: String(claim.status), href: `${href}/${claim.id}` })) }], actions: [{ id: 'open-claims', label: 'Open Claims', href, style: 'SECONDARY' }] }], suggestions: [],
  };
  if (!isValidClaimTransition(selected.status as ClaimStatus, nextStatus)) return {
    status: 'BLOCKED', reasonCode: 'CLAIM_TRANSITION_NOT_ALLOWED',
    blocks: [{ type: 'BOUNDARY', id: 'claim-transition-boundary', title: 'That claim status change is not allowed', severity: 'INFO', body: `The canonical claim lifecycle does not allow ${String(selected.status).toLowerCase().replace(/_/g, ' ')} → ${nextStatus.toLowerCase().replace(/_/g, ' ')}. No record was changed.`, suggestions: ['Review the claim and choose its next valid lifecycle step.'] }],
    suggestions: ['Show my open claims'],
  };
  const contextVersion = createHash('sha256').update(`${selected.id}:${selected.status}:${selected.updatedAt.toISOString()}`).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'CLAIM_TRANSITION_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { claimId: selected.id, claimTitle: selected.title, claimFromStatus: selected.status, claimToStatus: nextStatus, claimContextVersion: contextVersion, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'claim-transition-review', title: 'Review the claim status change', body: 'The canonical Claims service will enforce the legal lifecycle and reconcile the linked Operational Work Item and outcome.', tone: ['APPROVED', 'DENIED', 'CLOSED'].includes(nextStatus) ? 'CAUTION' : 'DEFAULT', actions: [{ id: 'open-claim', label: 'Open claim', href: `${href}/${selected.id}`, style: 'SECONDARY' }] }],
    confirmation: { confirmationId: `claim-transition-${selected.id}-1`, version: 1, title: `Change ${selected.title} to ${nextStatus.toLowerCase().replace(/_/g, ' ')}?`, description: 'This changes the shared claim record and its downstream work/outcome reconciliation.', fields: [{ label: 'Current status', value: String(selected.status).toLowerCase().replace(/_/g, ' ') }, { label: 'New status', value: nextStatus.toLowerCase().replace(/_/g, ' ') }], editableFields: [], confirmLabel: 'Change claim status', consentText: 'I confirm this status reflects the provider or claim process and authorize updating the shared record.', expiresAt: expiresAt.toISOString() }, suggestions: [],
  };
}

// FRD v1.64 (emergency capability card, product option A): the Emergency Help card launches this read inline, and the
// page's AI troubleshooter (a stateless Gemini chat, POST /api/emergency/chat) stays a labelled handoff rather than a
// model call inside Ask. Incidents follow the Incidents page's default list (suppressed ones hidden) and link to their
// own incident page; they used to link to Claims. The immediate-danger EMERGENCY_BOUNDARY answer deliberately carries
// no app link at all.
export function incidentContinuationFromRecords(
  propertyId: string,
  incidents: readonly { id: string; title: string; status: string }[],
  claims: readonly { id: string; title: string; status: string }[],
): AskOperationResult {
  const base = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  const href = `${base}/claims`;
  return { status: 'ANSWERED', reasonCode: 'INCIDENT_CONTINUATION_READY', blocks: [
    { type: 'BOUNDARY', id: 'incident-continuation-boundary', title: 'Continue only after immediate danger has passed', severity: 'CAUTION', body: 'If anyone may still be in danger, contact emergency responders or the appropriate utility first. This workflow records what happened; it is not emergency response.', suggestions: [] },
    { type: 'GROUPED_LIST', filters: [], id: 'incident-continuation-records', title: 'Recorded incident and claim follow-up', description: 'Use an existing record or start a draft claim. Filing with an insurer remains a separate provider action.', sections: [
      { id: 'incidents', title: 'Incidents', count: incidents.length, items: incidents.map((row) => ({ id: row.id, title: row.title, description: readableCode(String(row.status)), meta: [], status: String(row.status), href: `${base}/incidents/${encodeURIComponent(row.id)}` })) },
      { id: 'claims', title: 'Claims', count: claims.length, items: claims.map((row) => ({ id: row.id, title: row.title, description: readableCode(String(row.status)), meta: [], status: String(row.status), href: `${href}/${row.id}` })) },
    ], actions: [
      { id: 'open-claims', label: 'Open incident and claims records', href, style: 'PRIMARY' },
      { id: 'open-emergency-help', label: 'Open Emergency Help (AI troubleshooter)', href: `/dashboard/emergency?propertyId=${encodeURIComponent(propertyId)}`, style: 'SECONDARY' },
    ] },
  ], suggestions: ['File a water damage claim', 'What is the status of my open claim?'] };
}

async function incidentContinuationResult(propertyId: string): Promise<AskOperationResult> {
  const [incidents, claims] = await Promise.all([
    prisma.incident.findMany({ where: { propertyId, isSuppressed: false }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, updatedAt: true } }),
    prisma.claim.findMany({ where: { propertyId }, orderBy: { updatedAt: 'desc' }, take: 10, select: { id: true, title: true, status: true, updatedAt: true } }),
  ]);
  return incidentContinuationFromRecords(propertyId, incidents, claims);
}

// Claims capability-card slice (FRD v1.42). Every legal status change a claim can take, as declared item actions on
// each claim row. The inline claim detail (ClaimResultList) shows only the ones legal from the claim's LIVE status,
// re-fetched on open, and each routes to the existing confirmed CLAIM_TRANSITION with the claim as launchContext.
// nextClaimStatus parses each message back to exactly its own status.
export const CLAIM_TRANSITION_ACTIONS = [
  { id: 'claim-start', label: 'Mark in progress', message: 'Mark this claim as in progress.', status: 'IN_PROGRESS' },
  { id: 'claim-submit', label: 'Mark submitted', message: 'Submit this claim.', status: 'SUBMITTED' },
  { id: 'claim-under-review', label: 'Mark under review', message: 'Move this claim to under review.', status: 'UNDER_REVIEW' },
  { id: 'claim-approve', label: 'Mark approved', message: 'Mark this claim approved.', status: 'APPROVED' },
  { id: 'claim-deny', label: 'Mark denied', message: 'Mark this claim denied.', status: 'DENIED' },
  { id: 'claim-close', label: 'Close claim', message: 'Close this claim.', status: 'CLOSED' },
] as const;

export function claimItemActions(role: HouseholdRole) {
  // CLAIM_TRANSITION is a CONTRIBUTOR domain command; viewers get read-only detail.
  if (role === HouseholdRole.VIEWER) return [];
  return CLAIM_TRANSITION_ACTIONS.map(({ id, label, message }) => ({ id, label, message, style: 'SECONDARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId: 'CLAIM_TRANSITION' }));
}

const claimCount = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * Claims C-1 (FRD v1.127): the calm answer for the incident and claim status read, as one sentence, an optional supporting line and answer
 * chips, from counts only (no model). It states what is recorded and never what a claim will do: nothing about approval, coverage or
 * eligibility is said here.
 */
export function claimsCalmCopy(counts: {
  focus: 'BOTH' | 'CLAIMS' | 'INCIDENTS'; activeIncidents: number; resolvedIncidents: number; openClaims: number; closedClaims: number; truncated: boolean;
}): { headline: string; supportLine?: string; chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> } {
  const { focus, activeIncidents, resolvedIncidents, openClaims, closedClaims, truncated } = counts;
  const parts = [
    focus !== 'CLAIMS' && activeIncidents > 0 ? claimCount(activeIncidents, 'active incident', 'active incidents') : null,
    focus !== 'INCIDENTS' && openClaims > 0 ? claimCount(openClaims, 'open claim', 'open claims') : null,
  ].filter((part): part is string => Boolean(part));
  const none = focus === 'CLAIMS' ? 'No open claims.' : focus === 'INCIDENTS' ? 'No active incidents.' : 'No active incidents or open claims.';
  const headline = parts.length ? `${parts.join(' and ')}.` : none;
  const onFile = [
    focus !== 'CLAIMS' && resolvedIncidents > 0 ? claimCount(resolvedIncidents, 'resolved incident', 'resolved incidents') : null,
    focus !== 'INCIDENTS' && closedClaims > 0 ? claimCount(closedClaims, 'closed claim', 'closed claims') : null,
  ].filter((part): part is string => Boolean(part));
  const notes = [onFile.length ? `${onFile.join(' and ')} also on file.` : null, truncated ? 'Showing the most recent records; open the page for the full record.' : null].filter((note): note is string => Boolean(note));
  const chips: Array<{ label: string; tone: 'DEFAULT' | 'CAUTION' | 'CRITICAL' }> = [
    ...(focus !== 'CLAIMS' && activeIncidents > 0 ? [{ label: claimCount(activeIncidents, 'active incident', 'active incidents'), tone: 'CAUTION' as const }] : []),
    ...(focus !== 'INCIDENTS' && openClaims > 0 ? [{ label: claimCount(openClaims, 'open claim', 'open claims'), tone: 'CAUTION' as const }] : []),
    ...(focus !== 'CLAIMS' && resolvedIncidents > 0 ? [{ label: `${resolvedIncidents} resolved`, tone: 'DEFAULT' as const }] : []),
    ...(focus !== 'INCIDENTS' && closedClaims > 0 ? [{ label: `${closedClaims} closed`, tone: 'DEFAULT' as const }] : []),
  ];
  return notes.length ? { headline, supportLine: notes.join(' '), chips } : { headline, chips };
}

const CLAIM_STATUS_BOUNDARY: AskPresentationBlock = {
  type: 'BOUNDARY', id: 'claim-status-boundary', title: 'Recorded information only',
  body: 'This shows the incident and claim records in your Home Record. It does not decide whether a claim will be approved or covered. Filing a claim or changing its status happens only when you ask and confirm.',
  severity: 'INFO', suggestions: [],
};

// Claims C-2 (FRD v1.128): the status read's filters are a governed refinement, the same continuity model as Maintenance, Buyer Deadlines,
// Inventory and Warranties. Two independent dimensions: a scope (incidents and claims, claims only, incidents only) and a state (all, open,
// closed). A declared chip is a fresh authoritative query: every bucket is read with its own filter and its own exact count, never the
// filtered subset of an earlier or truncated result. Reading changes nothing; filing and status changes keep their own flows.
export type ClaimsScope = 'BOTH' | 'CLAIMS' | 'INCIDENTS';
export type ClaimsState = 'ALL' | 'OPEN' | 'CLOSED';
const CLAIMS_SCOPES: ReadonlySet<string> = new Set(['BOTH', 'CLAIMS', 'INCIDENTS']);
const CLAIMS_STATES: ReadonlySet<string> = new Set(['ALL', 'OPEN', 'CLOSED']);
const OPEN_INCIDENT_STATUSES: string[] = ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED'];
const OPEN_CLAIM_STATUSES: string[] = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW'];
// Each declared chip begins with a phrase askFollowUpContext's FILTER_CONTINUATION_PATTERN accepts (asserted in tests).
const CLAIMS_CLEAR_MESSAGE = 'Now show all records with no filters';
// A typed follow-up arrives joined to the prior question ("Show my claims. Only show open records"), so each phrase may follow a sentence break.
const atStart = (phrase: string) => new RegExp(`(?:^|[.!?]\\s+)\\s*${phrase}\\b`, 'i');
const CLAIMS_CLEAR_PATTERN = atStart('now show all records with no filters');

/** The scope this question asks about, from its own words (a fresh question; nothing is remembered). */
export function claimsScopeFromWords(message: string): ClaimsScope {
  const claims = /\bclaims?\b/i.test(message);
  const incidents = /\bincidents?\b/i.test(message);
  return claims && !incidents ? 'CLAIMS' : incidents && !claims ? 'INCIDENTS' : 'BOTH';
}

export function resolveClaimsRefinement(message: string, prior: AskViewState | null | undefined): { scope: ClaimsScope; state: ClaimsState } | null {
  if (!prior || !CLAIMS_STATES.has(prior.statusFilter) || !prior.domainScopePhrase || !CLAIMS_SCOPES.has(prior.domainScopePhrase)) return null;
  // Only a declared chip or a typed filter phrase refines a result; an ordinary question is answered on its own.
  if (!containsFilterContinuation(message)) return null;
  if (CLAIMS_CLEAR_PATTERN.test(message)) return { scope: 'BOTH', state: 'ALL' };
  const scope: ClaimsScope | null = atStart('only show claims').test(message) ? 'CLAIMS' : atStart('only show incidents').test(message) ? 'INCIDENTS' : atStart('now show all incidents and claims').test(message) ? 'BOTH' : null;
  const state: ClaimsState | null = atStart('only show open records').test(message) ? 'OPEN' : atStart('only show closed records').test(message) ? 'CLOSED' : atStart('now show open and closed records').test(message) ? 'ALL' : null;
  if (!scope && !state) return null;
  return { scope: scope ?? prior.domainScopePhrase as ClaimsScope, state: state ?? prior.statusFilter as ClaimsState };
}

export function buildClaimsViewState(prior: AskViewState | null | undefined, scope: ClaimsScope, state: ClaimsState): AskViewState {
  return {
    resultId: prior?.resultId ?? randomUUID(),
    // Claims reuse the generic fields: the scope rides in domainScopePhrase, the state in statusFilter.
    domainScopePhrase: scope, dateScopePhrase: null, statusFilter: state, selectedTaskId: null, revision: (prior?.revision ?? 0) + 1,
  };
}

/** The declared chips: what to look at (scope), which state, and a way back once anything is applied. */
export function claimsFilterChips(scope: ClaimsScope, state: ClaimsState) {
  return [
    { id: 'scope-both', label: 'Incidents and claims', message: 'Now show all incidents and claims', active: scope === 'BOTH' },
    { id: 'scope-claims', label: 'Claims', message: 'Only show claims', active: scope === 'CLAIMS' },
    { id: 'scope-incidents', label: 'Incidents', message: 'Only show incidents', active: scope === 'INCIDENTS' },
    { id: 'state-all', label: 'Open and closed', message: 'Now show open and closed records', active: state === 'ALL' },
    { id: 'state-open', label: 'Open', message: 'Only show open records', active: state === 'OPEN' },
    { id: 'state-closed', label: 'Closed', message: 'Only show closed records', active: state === 'CLOSED' },
    ...(scope !== 'BOTH' || state !== 'ALL' ? [{ id: 'clear-all', label: 'Clear filters', message: CLAIMS_CLEAR_MESSAGE, active: false }] : []),
  ];
}

/** The prior view only when the source execution really was a claim status read (another domain's view state must never be continued). */
async function loadClaimsViewState(sourceExecutionId: string | null | undefined, userId: string): Promise<AskViewState | null> {
  if (!sourceExecutionId) return null;
  const source = await prisma.askExecution.findFirst({ where: { id: sourceExecutionId, userId }, select: { operationId: true } });
  return source?.operationId === 'INCIDENT_CLAIM_STATUS' ? loadAskViewState(sourceExecutionId, userId) : null;
}

const CLAIMS_BUCKET_LIMITS = { activeIncidents: 12, resolvedIncidents: 8, openClaims: 12, closedClaims: 8 } as const;

async function incidentClaimStatusResult(userId: string, propertyId: string, message: string, priorViewState?: AskViewState | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const claimActions = claimItemActions(access.role);
  const refinement = resolveClaimsRefinement(message, priorViewState);
  const scope: ClaimsScope = refinement ? refinement.scope : claimsScopeFromWords(message);
  const state: ClaimsState = refinement ? refinement.state : 'ALL';
  const claimFocus = scope === 'CLAIMS';
  const incidentFocus = scope === 'INCIDENTS';
  const wantIncidents = scope !== 'CLAIMS';
  const wantClaims = scope !== 'INCIDENTS';
  const wantOpen = state !== 'CLOSED';
  const wantClosed = state !== 'OPEN';
  // One query and one exact count per bucket the question asks about; a bucket it does not ask about is never read.
  const incidentWhere = (open: boolean) => ({ propertyId, isSuppressed: false, status: open ? { in: OPEN_INCIDENT_STATUSES as never } : { notIn: OPEN_INCIDENT_STATUSES as never } });
  const claimWhere = (open: boolean) => ({ propertyId, status: open ? { in: OPEN_CLAIM_STATUSES as never } : { notIn: OPEN_CLAIM_STATUSES as never } });
  const incidentSelect = { id: true, title: true, summary: true, status: true, severity: true, openedAt: true, resolvedAt: true, typeKey: true } as const;
  const claimSelect = { id: true, title: true, status: true, type: true, sourceType: true, providerName: true, incidentAt: true, openedAt: true, closedAt: true } as const;
  const readIncidents = (open: boolean, take: number) => Promise.all([
    prisma.incident.findMany({ where: incidentWhere(open), orderBy: [{ openedAt: 'desc' }], take, select: incidentSelect }),
    prisma.incident.count({ where: incidentWhere(open) }),
  ]);
  const readClaims = (open: boolean, take: number) => Promise.all([
    prisma.claim.findMany({ where: claimWhere(open), orderBy: [{ updatedAt: 'desc' }], take, select: claimSelect }),
    prisma.claim.count({ where: claimWhere(open) }),
  ]);
  const none = <T,>(): Promise<[T[], number]> => Promise.resolve([[], 0]);
  const [[activeIncidents, activeIncidentTotal], [resolvedIncidents, resolvedIncidentTotal], [activeClaims, openClaimTotal], [closedClaims, closedClaimTotal]] = await Promise.all([
    wantIncidents && wantOpen ? readIncidents(true, CLAIMS_BUCKET_LIMITS.activeIncidents) : none<never>(),
    wantIncidents && wantClosed ? readIncidents(false, CLAIMS_BUCKET_LIMITS.resolvedIncidents) : none<never>(),
    wantClaims && wantOpen ? readClaims(true, CLAIMS_BUCKET_LIMITS.openClaims) : none<never>(),
    wantClaims && wantClosed ? readClaims(false, CLAIMS_BUCKET_LIMITS.closedClaims) : none<never>(),
  ]);

  const incidentsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/incidents`;
  const claimsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/claims`;
  const humanizeEnum = (value: string) => value.toLowerCase().replace(/_/g, ' ');

  type Section = { id: string; title: string; count: number; items: Array<{ id: string; title: string; description: string | null; meta: string[]; status: string | null; href: string | null; entityType?: string; actions?: ReturnType<typeof claimItemActions> }> };
  const sections: Section[] = [];
  const incidentRow = (incident: (typeof activeIncidents)[number], dateLabel: string, date: Date | null) => ({
    id: incident.id, title: incident.title,
    description: incident.summary ?? humanizeEnum(incident.typeKey),
    meta: [humanizeEnum(incident.status), ...(dateLabel === 'Opened' && incident.severity ? [humanizeEnum(incident.severity)] : []), humanDate(date) ? `${dateLabel} ${humanDate(date)}` : null].filter((value): value is string => Boolean(value)),
    status: incident.status, href: `${incidentsHref}/${encodeURIComponent(incident.id)}`,
  });
  const claimRow = (claim: (typeof activeClaims)[number], dateLabel: string, date: Date | null) => ({
    id: claim.id, title: claim.title,
    description: [claim.providerName, humanizeEnum(claim.type)].filter(Boolean).join(' · ') || humanizeEnum(claim.type),
    meta: [humanizeEnum(claim.status), humanDate(date) ? `${dateLabel} ${humanDate(date)}` : null].filter((value): value is string => Boolean(value)),
    status: claim.status, href: `${claimsHref}/${encodeURIComponent(claim.id)}`, entityType: 'CLAIM', actions: claimActions,
  });
  if (wantIncidents && wantOpen) sections.push({ id: 'active-incidents', title: 'Active incidents', count: activeIncidentTotal, items: activeIncidents.map((incident) => incidentRow(incident, 'Opened', incident.openedAt)) });
  if (wantIncidents && wantClosed && resolvedIncidentTotal > 0) sections.push({ id: 'resolved-incidents', title: 'Resolved incidents', count: resolvedIncidentTotal, items: resolvedIncidents.map((incident) => incidentRow(incident, 'Resolved', incident.resolvedAt)) });
  if (wantClaims && wantOpen) sections.push({ id: 'active-claims', title: 'Open claims', count: openClaimTotal, items: activeClaims.map((claim) => claimRow(claim, 'Opened', claim.openedAt)) });
  if (wantClaims && wantClosed && closedClaimTotal > 0) sections.push({ id: 'closed-claims', title: 'Closed claims', count: closedClaimTotal, items: closedClaims.map((claim) => claimRow(claim, 'Closed', claim.closedAt)) });

  const totalActive = activeIncidentTotal + openClaimTotal;
  const totalRecords = activeIncidentTotal + resolvedIncidentTotal + openClaimTotal + closedClaimTotal;
  const viewState = buildClaimsViewState(priorViewState, scope, state);
  const chips = claimsFilterChips(scope, state);
  const listActions = [
    ...(claimFocus ? [] : [{ id: 'open-incidents-list', label: 'Open incidents', href: incidentsHref, style: 'SECONDARY' as const }]),
    ...(incidentFocus ? [] : [{ id: 'open-claims-list', label: 'Open claims', href: claimsHref, style: 'SECONDARY' as const }]),
  ];

  if (totalRecords === 0 && refinement) {
    // A filter that matches nothing still continues the result and keeps every chip, so it can be widened or cleared.
    return {
      status: 'ANSWERED', reasonCode: 'INCIDENT_CLAIM_FILTER_NO_MATCH', parameters: { viewState },
      blocks: [{
        type: 'SUMMARY', id: 'incident-claim-summary', title: 'No recorded items match these filters', headline: 'Nothing matches these filters.',
        supportLine: 'Widen or clear a filter to see the records on file.', body: 'No incidents or claims match the selected filters.', tone: 'DEFAULT', actions: [],
      }, { type: 'GROUPED_LIST', filters: chips, id: 'incident-claim-list', title: 'Incidents and claims', sections: [], actions: listActions }, CLAIM_STATUS_BOUNDARY],
      suggestions: [],
    };
  }

  if (totalRecords === 0) {
    return {
      status: 'ANSWERED', reasonCode: 'INCIDENT_CLAIM_NONE_RECORDED',
      blocks: [{
        type: 'EMPTY_STATE', id: 'incident-claim-empty',
        title: claimFocus ? 'No claims are recorded for this home' : incidentFocus ? 'No incidents are recorded for this home' : 'No incidents or claims are recorded for this home',
        body: 'This reflects what has been logged in the home record; it is not confirmation that nothing has ever happened at this property.',
        actions: [
          ...(claimFocus ? [] : [{ id: 'open-incidents', label: 'Open incidents', href: incidentsHref, style: 'SECONDARY' as const }]),
          ...(incidentFocus ? [] : [{ id: 'open-claims', label: 'Open claims', href: claimsHref, style: 'SECONDARY' as const }]),
        ],
      }, CLAIM_STATUS_BOUNDARY],
      suggestions: ['What do I need for an insurance claim?'],
    };
  }

  const truncated = activeIncidentTotal > activeIncidents.length || resolvedIncidentTotal > resolvedIncidents.length || openClaimTotal > activeClaims.length || closedClaimTotal > closedClaims.length;
  const totals = { incidents: activeIncidentTotal + resolvedIncidentTotal, claims: openClaimTotal + closedClaimTotal };
  return {
    status: 'ANSWERED', reasonCode: totalActive > 0 ? 'INCIDENT_CLAIM_ACTIVE' : 'INCIDENT_CLAIM_HISTORICAL',
    parameters: { viewState },
    blocks: [
      {
        type: 'SUMMARY', id: 'incident-claim-summary',
        title: totalActive > 0 ? `${totalActive} active ${totalActive === 1 ? 'item needs' : 'items need'} attention` : 'No active incidents or claims right now',
        body: `${totals.incidents} recorded incident${totals.incidents === 1 ? '' : 's'} and ${totals.claims} recorded claim${totals.claims === 1 ? '' : 's'} match this request.`,
        tone: totalActive > 0 ? 'CAUTION' : 'DEFAULT',
        ...claimsCalmCopy({ focus: scope, activeIncidents: activeIncidentTotal, resolvedIncidents: resolvedIncidentTotal, openClaims: openClaimTotal, closedClaims: closedClaimTotal, truncated }),
        actions: [
          ...(claimFocus ? [] : [{ id: 'open-incidents', label: 'Open incidents', href: incidentsHref, style: 'SECONDARY' as const }]),
          ...(incidentFocus ? [] : [{ id: 'open-claims', label: 'Open claims', href: claimsHref, style: 'PRIMARY' as const }]),
        ],
      },
      // The calm answer carries no filled step (filing and status changes stay behind their own confirmation flows); the record pages are
      // quiet links, drawn by the calm answer only so the previous shell still shows each link once.
      { type: 'GROUPED_LIST', filters: chips, id: 'incident-claim-list', title: claimFocus ? 'Claims' : incidentFocus ? 'Incidents' : 'Incidents and claims', sections, actions: listActions },
      {
        type: 'EVIDENCE', id: 'incident-claim-evidence', title: 'Record freshness',
        items: [
          ...activeIncidents.concat(resolvedIncidents).slice(0, 10).map((incident) => ({ label: incident.title, source: 'Canonical Incident record', observedAt: incident.openedAt.toISOString() })),
          ...activeClaims.concat(closedClaims).slice(0, 10).map((claim) => ({ label: claim.title, source: claim.sourceType ? `Canonical Claim record · ${humanizeEnum(claim.sourceType)}` : 'Canonical Claim record', observedAt: (claim.openedAt ?? claim.incidentAt)?.toISOString() ?? new Date(0).toISOString() })),
        ],
      },
      CLAIM_STATUS_BOUNDARY,
    ],
    suggestions: claimFocus ? ['What do I need for an insurance claim?'] : incidentFocus ? ['What should I do next?'] : ['What do I need for an insurance claim?', 'What should I do next?'],
  };
}

registerCapabilityHandler('incident-claim.status', async (envelope) => incidentClaimStatusResult(
  envelope.userId, envelope.propertyId!, envelope.message,
  await loadClaimsViewState(envelope.launchContext?.sourceExecutionId, envelope.userId),
));

registerCapabilityHandler('incident-claim.file', async (envelope) => claimFileResult(envelope.propertyId!, envelope.message));

registerCapabilityHandler('incident-claim.transition', async (envelope) => claimTransitionResult(envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('incident-claim.continuation', async (envelope) => incidentContinuationResult(envelope.propertyId!));
