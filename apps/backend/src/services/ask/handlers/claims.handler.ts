// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { ClaimType as PrismaClaimType, HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { humanDate, readableCode } from '../askFormatting';
import { ensurePropertyAccess, exactEntityMatch } from '../askHandlerSupport';
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

async function incidentClaimStatusResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const claimActions = claimItemActions(access.role);
  const claimFocus = /\bclaims?\b/i.test(message) && !/\bincidents?\b/i.test(message);
  const incidentFocus = /\bincidents?\b/i.test(message) && !/\bclaims?\b/i.test(message);
  const [incidents, claims] = await Promise.all([
    claimFocus ? Promise.resolve([]) : prisma.incident.findMany({
      where: { propertyId, isSuppressed: false },
      orderBy: [{ openedAt: 'desc' }],
      take: 20,
      select: { id: true, title: true, summary: true, status: true, severity: true, openedAt: true, resolvedAt: true, typeKey: true },
    }),
    incidentFocus ? Promise.resolve([]) : prisma.claim.findMany({
      where: { propertyId },
      orderBy: [{ updatedAt: 'desc' }],
      take: 20,
      select: { id: true, title: true, status: true, type: true, sourceType: true, providerName: true, incidentAt: true, openedAt: true, closedAt: true },
    }),
  ]);

  const incidentsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/incidents`;
  const claimsHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/claims`;
  const humanizeEnum = (value: string) => value.toLowerCase().replace(/_/g, ' ');

  const openIncidentStatuses: string[] = ['DETECTED', 'EVALUATED', 'ACTIVE', 'ACTIONED'];
  const activeIncidents = incidents.filter((incident) => openIncidentStatuses.includes(incident.status));
  const resolvedIncidents = incidents.filter((incident) => !openIncidentStatuses.includes(incident.status));

  const openClaimStatuses: string[] = ['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW'];
  const activeClaims = claims.filter((claim) => openClaimStatuses.includes(claim.status));
  const closedClaims = claims.filter((claim) => !openClaimStatuses.includes(claim.status));

  type Section = { id: string; title: string; count: number; items: Array<{ id: string; title: string; description: string | null; meta: string[]; status: string | null; href: string | null; entityType?: string; actions?: ReturnType<typeof claimItemActions> }> };
  const sections: Section[] = [];
  if (!claimFocus) {
    sections.push({
      id: 'active-incidents', title: 'Active incidents', count: activeIncidents.length,
      items: activeIncidents.slice(0, 12).map((incident) => ({
        id: incident.id, title: incident.title,
        description: incident.summary ?? humanizeEnum(incident.typeKey),
        meta: [humanizeEnum(incident.status), incident.severity ? humanizeEnum(incident.severity) : null, humanDate(incident.openedAt) ? `Opened ${humanDate(incident.openedAt)}` : null].filter((value): value is string => Boolean(value)),
        status: incident.status, href: `${incidentsHref}/${encodeURIComponent(incident.id)}`,
      })),
    });
    if (resolvedIncidents.length) sections.push({
      id: 'resolved-incidents', title: 'Resolved incidents', count: resolvedIncidents.length,
      items: resolvedIncidents.slice(0, 8).map((incident) => ({
        id: incident.id, title: incident.title,
        description: incident.summary ?? humanizeEnum(incident.typeKey),
        meta: [humanizeEnum(incident.status), humanDate(incident.resolvedAt) ? `Resolved ${humanDate(incident.resolvedAt)}` : null].filter((value): value is string => Boolean(value)),
        status: incident.status, href: `${incidentsHref}/${encodeURIComponent(incident.id)}`,
      })),
    });
  }
  if (!incidentFocus) {
    sections.push({
      id: 'active-claims', title: 'Open claims', count: activeClaims.length,
      items: activeClaims.slice(0, 12).map((claim) => ({
        id: claim.id, title: claim.title,
        description: [claim.providerName, humanizeEnum(claim.type)].filter(Boolean).join(' · ') || humanizeEnum(claim.type),
        meta: [humanizeEnum(claim.status), humanDate(claim.openedAt) ? `Opened ${humanDate(claim.openedAt)}` : null].filter((value): value is string => Boolean(value)),
        status: claim.status, href: `${claimsHref}/${encodeURIComponent(claim.id)}`,
        entityType: 'CLAIM', actions: claimActions,
      })),
    });
    if (closedClaims.length) sections.push({
      id: 'closed-claims', title: 'Closed claims', count: closedClaims.length,
      items: closedClaims.slice(0, 8).map((claim) => ({
        id: claim.id, title: claim.title,
        description: [claim.providerName, humanizeEnum(claim.type)].filter(Boolean).join(' · ') || humanizeEnum(claim.type),
        meta: [humanizeEnum(claim.status), humanDate(claim.closedAt) ? `Closed ${humanDate(claim.closedAt)}` : null].filter((value): value is string => Boolean(value)),
        status: claim.status, href: `${claimsHref}/${encodeURIComponent(claim.id)}`,
        entityType: 'CLAIM', actions: claimActions,
      })),
    });
  }

  const totalActive = activeIncidents.length + activeClaims.length;
  const nothingRecorded = incidents.length === 0 && claims.length === 0;

  if (nothingRecorded) {
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
      }],
      suggestions: ['What do I need for an insurance claim?'],
    };
  }

  return {
    status: 'ANSWERED', reasonCode: totalActive > 0 ? 'INCIDENT_CLAIM_ACTIVE' : 'INCIDENT_CLAIM_HISTORICAL',
    blocks: [
      {
        type: 'SUMMARY', id: 'incident-claim-summary',
        title: totalActive > 0 ? `${totalActive} active ${totalActive === 1 ? 'item needs' : 'items need'} attention` : 'No active incidents or claims right now',
        body: `${incidents.length} recorded incident${incidents.length === 1 ? '' : 's'} and ${claims.length} recorded claim${claims.length === 1 ? '' : 's'} are on file for this home.`,
        tone: totalActive > 0 ? 'CAUTION' : 'DEFAULT',
        actions: [
          ...(claimFocus ? [] : [{ id: 'open-incidents', label: 'Open incidents', href: incidentsHref, style: 'SECONDARY' as const }]),
          ...(incidentFocus ? [] : [{ id: 'open-claims', label: 'Open claims', href: claimsHref, style: 'PRIMARY' as const }]),
        ],
      },
      { type: 'GROUPED_LIST', filters: [], id: 'incident-claim-list', title: claimFocus ? 'Claims' : incidentFocus ? 'Incidents' : 'Incidents and claims', sections, actions: [] },
      {
        type: 'EVIDENCE', id: 'incident-claim-evidence', title: 'Record freshness',
        items: [
          ...incidents.slice(0, 10).map((incident) => ({ label: incident.title, source: 'Canonical Incident record', observedAt: incident.openedAt.toISOString() })),
          ...claims.slice(0, 10).map((claim) => ({ label: claim.title, source: claim.sourceType ? `Canonical Claim record · ${humanizeEnum(claim.sourceType)}` : 'Canonical Claim record', observedAt: (claim.openedAt ?? claim.incidentAt)?.toISOString() ?? null })),
        ],
      },
    ],
    suggestions: claimFocus ? ['What do I need for an insurance claim?'] : incidentFocus ? ['What should I do next?'] : ['What do I need for an insurance claim?', 'What should I do next?'],
  };
}

registerCapabilityHandler('incident-claim.status', async (envelope) => incidentClaimStatusResult(envelope.userId, envelope.propertyId!, envelope.message));

registerCapabilityHandler('incident-claim.file', async (envelope) => claimFileResult(envelope.propertyId!, envelope.message));

registerCapabilityHandler('incident-claim.transition', async (envelope) => claimTransitionResult(envelope.propertyId!, envelope.message, envelope.launchContext));

registerCapabilityHandler('incident-claim.continuation', async (envelope) => incidentContinuationResult(envelope.propertyId!));
