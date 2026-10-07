// Moved out of askOrchestrator.service.ts unchanged (decomposition, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { getCaptureDefinition } from '../../../modules/propertyContext/catalog/captureRegistry';
import { PROPERTY_AREA_CAPTURE_FEATURE, PROPERTY_AREA_CAPTURE_OPERATION, PROPERTY_AREA_CAPTURE_SCOPES, type PropertyAreaCaptureScope } from '../../../modules/propertyContext/catalog/featureRequirementRegistry';
import { getFactDefinition, PROPERTY_FACT_CATALOG } from '../../../modules/propertyContext/catalog/factCatalog';
import { getContextCompleteness } from '../../../modules/propertyContext/application/getContextCompleteness';
import { HouseholdRole } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest, type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { isPropertyCompletenessRequest, type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { evaluateFeatureContext } from '../../../modules/propertyContext/application/evaluateFeatureContext';
import { normalizeAnswers } from '../../../modules/propertyContext/application/captureFeatureContext';
import { getPropertyContext } from '../../../modules/propertyContext/application/getPropertyContext';
import { getPropertyRecordOverview } from '../../propertyRecordOverview.service';
import { humanDate } from '../askFormatting';
import { AREA_CAPTURE_ANCHORS, AREA_CAPTURE_MESSAGES, areaCaptureFallbackHref, areaCaptureProgress, areaFallbackAnchor, areaLabel, areaProgressBlock, ensurePropertyAccess, isAreaCaptureScope, PROPERTY_SCOPE_LABELS, readablePropertyValue } from '../askHandlerSupport';
import { ROOM_ADD_MESSAGE, roomRenameItemActions } from '../handlers/homeRecordWrites.handler';
import { INVENTORY_ADD_MESSAGE } from '../handlers/inventory.handler';
import { roomMapFacts } from '../support/roomMap';


// IW-PRES-020 (FRD v1.91): the Property Context's own completeness as a ring. The percent is the domain's
// (`completenessPercent`, known facts of all applicable facts across the areas); the basis says exactly that. The tiles are
// the domain's own counts of missing, conflicted and stale facts, and the next steps are the three least complete areas
// with the capture actions the list below already declares. Nothing is recomputed here beyond the sums of what the
// domain reports; with no applicable facts there is no ring.
export function propertyCompletenessProgress(
  completeness: { completenessPercent: number; scopes: Array<{ scope: string; totalFacts: number; knownFacts: number; completenessPercent: number; missingFactKeys: string[]; conflictedFactKeys: string[]; staleFactKeys: string[] }> },
  incompleteScopes: ReadonlyArray<{ scope: string; totalFacts: number; knownFacts: number; completenessPercent: number; missingFactKeys: string[]; conflictedFactKeys: string[]; staleFactKeys: string[] }>,
  propertyId: string,
  canManage: boolean,
): Extract<AskPresentationBlock, { type: 'PROGRESS' }> | null {
  const total = completeness.scopes.reduce((sum, scope) => sum + scope.totalFacts, 0);
  if (total === 0) return null;
  const known = completeness.scopes.reduce((sum, scope) => sum + scope.knownFacts, 0);
  const sum = (pick: (scope: typeof completeness.scopes[number]) => number) => completeness.scopes.reduce((count, scope) => count + pick(scope), 0);
  const metric = (label: string, value: number) => ({ label, value: String(value), tone: value ? 'CAUTION' as const : 'DEFAULT' as const });
  return {
    type: 'PROGRESS', id: 'property-completeness-progress', title: 'Property record completeness',
    description: 'Counts the governed property facts that apply to this home and are known. Facts that are missing, conflicted or out of date are not counted as known.',
    percent: completeness.completenessPercent,
    basis: `${known} of ${total} applicable facts known across ${completeness.scopes.length} area${completeness.scopes.length === 1 ? '' : 's'}`,
    metrics: [
      metric('Missing', sum((scope) => scope.missingFactKeys.length)),
      metric('Conflicted', sum((scope) => scope.conflictedFactKeys.length)),
      metric('Stale', sum((scope) => scope.staleFactKeys.length)),
    ],
    nextSteps: incompleteScopes.slice(0, 3).map((scope) => ({
      id: scope.scope, title: PROPERTY_SCOPE_LABELS[scope.scope] ?? readablePropertyValue(scope.scope),
      description: `${scope.knownFacts} of ${scope.totalFacts} facts known`,
      meta: [], status: `${scope.completenessPercent}% COMPLETE`, href: areaCaptureFallbackHref(propertyId, scope.scope),
      entityType: 'PROPERTY_CONTEXT_AREA',
      actions: areaCaptureRowActions(scope.scope, canManage, scope.missingFactKeys.length + scope.conflictedFactKeys.length + scope.staleFactKeys.length),
    })),
    actions: [],
  };
}

// Property Summary P-2 (ASK_COZY_CONVERSATIONAL_UI_GAP_AUDIT.md §16, FRD v1.154): PROPERTY_SUMMARY is a conversational synthesis operation,
// not an aggregate rendering of every property-record collection. A vague overview question ("Tell me about my home") gets a short,
// grounded prose synthesis -- never a serialization of every table the backend happens to expose. Inventory, warranties and documents
// already have their own dedicated, filterable, calm-certified answers (INVENTORY_LOOKUP/WARRANTY_LOOKUP/DOCUMENT_LOOKUP); embedding
// uncertified copies of them here would only duplicate worse versions of already-shipped work. Household has no dedicated read operation
// yet, so it is dropped without a redirect invented for it. Timeline is not reproduced either (HOME_TIMELINE_EVENTS/HOME_CHANGE_SUMMARY
// own that); "a recent material change" is deliberately deferred here (it would need HOME_CHANGE_SUMMARY's own live-action reconciliation,
// not just its materiality filter, to avoid mentioning a change that reconciliation would have dropped as stale) -- "What changed
// recently?" is offered as a standing follow-up regardless, which answers it properly through that operation.

/** One or two grounded prose sentences from recorded values only; an unrecorded field is omitted, never printed as "Not recorded". */
export function propertyOverviewFactsSentence(property: {
  dwellingType: string | null; yearBuilt: number | null; propertySize: number | null; bedrooms: number | null; bathrooms: number | null;
}): string | null {
  const hasDwelling = Boolean(property.dwellingType) && property.dwellingType !== 'UNKNOWN';
  const noun = hasDwelling ? readablePropertyValue(property.dwellingType).toLowerCase() : 'home';
  const bedsBaths = property.bedrooms != null && property.bathrooms != null ? `${property.bedrooms}-bedroom, ${property.bathrooms}-bath ` : '';
  const built = property.yearBuilt != null ? ` built in ${property.yearBuilt}` : '';
  const size = property.propertySize != null ? `, with ${new Intl.NumberFormat('en-US').format(property.propertySize)} sq ft of living space` : '';
  if (!bedsBaths && !hasDwelling && !built && !size) return null;
  return `This is a ${bedsBaths}${noun}${built}${size}.`;
}

type OverviewFactProperty = {
  dwellingType: string | null; yearBuilt: number | null; propertySize: number | null; bedrooms: number | null; bathrooms: number | null;
  occupancyStatus?: string | null; occupantsCount?: number | null; heatingType?: string | null; coolingType?: string | null; roofType?: string | null;
};

// "Hvac" and "Central Ac" are what the generic title-casing would print for these two enums.
const OVERVIEW_FACT_LABELS: Record<string, string> = { HVAC: 'HVAC', CENTRAL_AC: 'Central AC', WINDOW_AC: 'Window AC' };
const overviewEnumValue = (value: string | null | undefined): string | null =>
  value && value !== 'UNKNOWN' ? (OVERVIEW_FACT_LABELS[value] ?? readablePropertyValue(value)) : null;

/**
 * Compact overview facts for the fact grid (FRD Appendix C.10). Only canonical recorded values are included, so an unrecorded field is
 * simply absent. Occupant count is household-private: it is shown to an owner only (`includeOccupantCount`).
 */
export function propertyOverviewFactRows(property: OverviewFactProperty, options: { includeOccupantCount?: boolean } = {}) {
  const fact = (id: string, detail: string, recordedValue: string | null) => (recordedValue === null ? null : { id, values: { detail, recordedValue } });
  return [
    fact('home-type', 'Home type', overviewEnumValue(property.dwellingType)),
    fact('year-built', 'Year built', property.yearBuilt != null ? String(property.yearBuilt) : null),
    fact('living-area', 'Living area', property.propertySize != null ? `${new Intl.NumberFormat('en-US').format(property.propertySize)} sq ft` : null),
    fact('bedrooms', 'Bedrooms', property.bedrooms != null ? String(property.bedrooms) : null),
    fact('bathrooms', 'Bathrooms', property.bathrooms != null ? readablePropertyValue(property.bathrooms) : null),
    fact('occupancy', 'Occupancy', overviewEnumValue(property.occupancyStatus)),
    options.includeOccupantCount ? fact('occupants', 'Occupants', property.occupantsCount != null ? String(property.occupantsCount) : null) : null,
    fact('heating', 'Heating', overviewEnumValue(property.heatingType)),
    fact('cooling', 'Cooling', overviewEnumValue(property.coolingType)),
    fact('roof', 'Roof', overviewEnumValue(property.roofType)),
  ].filter((row): row is NonNullable<typeof row> => row !== null);
}

/** One plain line naming the headline facts that are not recorded, so the grid's gaps are explained without printing empty tiles. */
export function propertyOverviewMissingLine(property: OverviewFactProperty): string | null {
  const missing = [
    property.bedrooms == null ? 'bedrooms' : null,
    property.bathrooms == null ? 'bathrooms' : null,
    !overviewEnumValue(property.occupancyStatus) ? 'occupancy' : null,
  ].filter((name): name is string => name !== null);
  return missing.length ? `Not recorded yet: ${missing.join(', ')}.` : null;
}

/**
 * At most one status observation, in priority order: an actionable completeness issue (only when something is genuinely missing,
 * conflicted or stale -- never automatic), otherwise a plain reassurance. A recent material change would sit between these (see the
 * header note above for why it is not implemented yet).
 */
export function propertyOverviewStatusObservation(pendingDetailCount: number): string {
  if (pendingDetailCount > 0) {
    return `${pendingDetailCount} home detail${pendingDetailCount === 1 ? '' : 's'} still need${pendingDetailCount === 1 ? 's' : ''} review, but nothing in the current record suggests an urgent issue.`;
  }
  return 'Nothing in the current record suggests an urgent issue.';
}

async function propertySummaryResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const propertyHref = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  const completenessFocus = isPropertyCompletenessRequest(message);
  const roomFocus = /\b(?:show|list|view|see|review)\b.{0,35}\b(?:my|our|the|this)?\s*(?:home|house|property)?\b.{0,20}\brooms?\b|\b(?:show|list|view|see|review)\b.{0,35}\brooms?\b|\b(?:home|house|property)\b.{0,20}\bby room\b/i.test(message);
  const [access, overview, evaluation, property] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    getPropertyRecordOverview(propertyId, userId, 'ASK'),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'PROPERTY_RECORD_SUMMARY', operationKey: 'VIEW_SUMMARY' }),
    prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true, name: true, address: true, city: true, state: true, zipCode: true, dwellingType: true,
        propertyUse: true, occupancyStatus: true, propertySize: true, yearBuilt: true, bedrooms: true,
        bathrooms: true, occupantsCount: true, heatingType: true, coolingType: true, roofType: true, updatedAt: true,
      },
    }),
  ]);
  if (!property) throw new Error('Property not found.');

  const activeRequirement = evaluation.requirements[0];
  const canImproveContext = access.role !== HouseholdRole.VIEWER;
  const captureSupported = activeRequirement
    && canImproveContext
    && activeRequirement.capture.actionKey !== 'PERMISSION_REQUIRED'
    && activeRequirement.capture.inputSchema.type !== 'RELATIONAL_SELECT_CREATE';
  const captureRequests: AskCaptureRequest[] = captureSupported ? [{
    requirementId: activeRequirement.requirementId,
    captureKey: activeRequirement.capture.captureKey,
    classification: activeRequirement.classification,
    state: activeRequirement.state,
    title: activeRequirement.capture.title,
    question: activeRequirement.capture.question,
    helpText: activeRequirement.capture.helpText ?? null,
    inputSchema: activeRequirement.capture.inputSchema,
    ...(activeRequirement.currentAnswer === undefined ? {} : { currentAnswer: activeRequirement.currentAnswer }),
    allowNotSure: activeRequirement.capture.allowNotSure,
    sensitivity: activeRequirement.capture.sensitivity,
    destinationLabel: 'Saved to this home’s Property Context',
    confirmationText: null,
    expectedContextVersion: evaluation.contextVersion,
  }] : [];

  const context = overview.context.status === 'AVAILABLE' ? overview.context : null;
  const completeness = context?.completeness;
  const percent = completeness?.completenessPercent ?? null;
  const rooms = overview.sections.rooms.status === 'AVAILABLE' ? overview.sections.rooms.data : null;
  const inventory = overview.sections.inventory.status === 'AVAILABLE' ? overview.sections.inventory.data : null;
  const documents = overview.sections.documents.status === 'AVAILABLE' ? overview.sections.documents.data : null;
  const household = overview.sections.household.status === 'AVAILABLE' ? overview.sections.household.data : null;
  const incompleteScopes = (completeness?.scopes ?? [])
    .filter((scope) => scope.completenessPercent < 100
      || scope.missingFactKeys.length > 0
      || scope.conflictedFactKeys.length > 0
      || scope.staleFactKeys.length > 0)
    .sort((left, right) => left.completenessPercent - right.completenessPercent || left.scope.localeCompare(right.scope));
  const completenessCounts = (completeness?.scopes ?? []).reduce((counts, scope) => ({
    missing: counts.missing + scope.missingFactKeys.length,
    conflicted: counts.conflicted + scope.conflictedFactKeys.length,
    stale: counts.stale + scope.staleFactKeys.length,
  }), { missing: 0, conflicted: 0, stale: 0 });
  const pendingDetailCount = completenessCounts.missing + completenessCounts.conflicted + completenessCounts.stale;
  const degradedSections = [
    rooms ? null : 'Rooms', inventory ? null : 'Inventory', documents ? null : 'Documents', household ? null : 'Household', context ? null : 'Property Context',
  ].filter((value): value is string => Boolean(value));
  const propertyName = property.name?.trim() || `${property.address}, ${property.city}`;

  const completenessBody = context
    ? percent === 100 && pendingDetailCount === 0
      ? 'No pending governed property details were identified. The available Property Context is complete and current.'
      : `${completenessCounts.missing} missing, ${completenessCounts.conflicted} conflicted, and ${completenessCounts.stale} stale detail${pendingDetailCount === 1 ? '' : 's'} were found across ${incompleteScopes.length} area${incompleteScopes.length === 1 ? '' : 's'}. ${captureRequests.length ? 'The highest-priority detail is ready to answer below.' : 'Open the property record to review the affected areas.'}`
    : 'Property Context details are temporarily unavailable, so Ask cannot reliably determine which details are pending.';
  const vagueOverview = !roomFocus && !completenessFocus;
  const factRows = vagueOverview ? propertyOverviewFactRows(property, { includeOccupantCount: access.role === HouseholdRole.OWNER }) : [];
  const missingLine = vagueOverview ? propertyOverviewMissingLine(property) : null;
  const statusObservation = vagueOverview ? propertyOverviewStatusObservation(pendingDetailCount) : null;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'property-summary',
    title: roomFocus
      ? rooms
        ? `${rooms.count} room${rooms.count === 1 ? '' : 's'} recorded`
        : `Rooms for ${propertyName}`
      : completenessFocus
      ? percent != null
        ? `${propertyName}’s Property Context is ${percent}% complete`
        : `Here is the current Living Home Record for ${propertyName}`
      : `Here's the short version of ${propertyName}`,
    body: roomFocus
      ? rooms
        ? 'Select a room to see the items recorded there.'
        : 'Room details are temporarily unavailable for this home.'
      : completenessFocus
      ? completenessBody
      : statusObservation ?? '',
    tone: roomFocus ? (rooms ? 'DEFAULT' : 'CAUTION') : completenessFocus && (degradedSections.length || pendingDetailCount > 0 || (percent != null && percent < 100)) ? 'CAUTION' : 'DEFAULT',
    actions: roomFocus || vagueOverview
      ? []
      : [{ id: 'open-property-record', label: pendingDetailCount > 0 ? 'Review missing details' : 'Review home details', href: propertyHref, style: 'PRIMARY' }],
  }];

  if (vagueOverview && factRows.length > 0) {
    blocks.push({
      type: 'TABLE', id: 'property-summary-facts', title: 'Home record summary',
      description: ['Recorded facts from this home’s current canonical record.', missingLine].filter(Boolean).join(' '),
      preferredPresentation: 'TABLE',
      columns: [{ key: 'detail', label: 'Detail' }, { key: 'recordedValue', label: 'Recorded value' }],
      rows: factRows,
      actions: [],
    });
  }

  if (roomFocus && rooms) {
      // IW-PRES-019 (FRD v1.79): the rooms render as a room map by stored floor level, even when no floor is recorded
      // (then with a hint); each room carries its recorded item count and open maintenance tasks.
      const anyFloor = rooms.items.slice(0, 50).some((room) => typeof room.floorLevel === 'number');
      const canManageRooms = access.role !== HouseholdRole.VIEWER;
      blocks.push({
        type: 'GROUPED_LIST', filters: [], id: 'property-rooms', title: 'Rooms',
        description: [
          rooms.count > 50
            ? 'Showing the first 50 canonical room records. Open Rooms for the full collection.'
            : 'Select a room to inspect its current canonical details without leaving Ask Cozy.',
          rooms.items.length && !anyFloor ? `Floors aren't recorded yet${canManageRooms ? '; open a room to set its floor' : ''}.` : null,
        ].filter(Boolean).join(' '),
        // Rooms are reachable only through an explicit focused question now (P-2 dropped the vague-overview dump this used to be embedded in), so this is always the focused presentation.
        presentation: { pattern: 'ROOM_MAP', focused: true },
        sections: [{
          id: 'rooms', title: 'Recorded rooms', count: rooms.count,
          items: rooms.items.slice(0, 50).map((room) => {
            const facts = roomMapFacts(room._count);
            return {
              id: room.id, title: room.name, description: null, entityType: 'INVENTORY_ROOM', href: null, status: null, actions: roomRenameItemActions(access.role !== HouseholdRole.VIEWER),
              floorLevel: typeof room.floorLevel === 'number' ? room.floorLevel : null,
              countLabel: facts.countLabel,
              ...(facts.badgeLabel ? { badgeLabel: facts.badgeLabel, tone: 'CAUTION' as const } : {}),
              meta: [readablePropertyValue(room.type), facts.countLabel, ...(facts.badgeLabel ? [facts.badgeLabel] : []), `Updated ${humanDate(room.updatedAt) ?? 'date unavailable'}`],
            };
          }),
        }],
        // No "Open Rooms" link: this is only ever reached through an explicit focused room question now, never embedded in a larger answer.
        actions: access.role !== HouseholdRole.VIEWER
          ? [{ id: 'add-room', label: 'Add a room', interactionType: 'START_WORKFLOW' as const, message: ROOM_ADD_MESSAGE, operationId: 'ROOM_CREATE', style: 'PRIMARY' as const }]
          : [],
      });
  }

  if (completenessFocus && incompleteScopes.length) {
    // IW-PRES-020 (FRD v1.91): the ring leads the list of areas that can improve.
    const ring = completeness ? propertyCompletenessProgress(completeness, incompleteScopes, propertyId, canImproveContext) : null;
    if (ring) blocks.push(ring);
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'property-completeness', title: 'Areas that can improve',
      description: 'Internal fact keys are intentionally hidden. Open the property record or answer the inline prompt to add canonical information.',
      sections: [{
        id: 'incomplete-scopes', title: 'Property Context completeness', count: incompleteScopes.length,
        items: incompleteScopes.map((scope) => ({
          id: scope.scope, title: PROPERTY_SCOPE_LABELS[scope.scope] ?? readablePropertyValue(scope.scope),
          description: `${scope.knownFacts} of ${scope.totalFacts} facts known`,
          meta: [`${scope.missingFactKeys.length} missing`, `${scope.conflictedFactKeys.length} conflicted`, `${scope.staleFactKeys.length} stale`],
          status: `${scope.completenessPercent}% COMPLETE`, href: areaCaptureFallbackHref(propertyId, scope.scope),
          entityType: 'PROPERTY_CONTEXT_AREA',
          actions: areaCaptureRowActions(scope.scope, canImproveContext, scope.missingFactKeys.length + scope.conflictedFactKeys.length + scope.staleFactKeys.length),
        })),
      }],
      actions: [],
    });
  }

  const freshness = [
    { label: 'Core property record', source: 'Property', observedAt: property.updatedAt.toISOString() },
    ...(documents?.latest ? [{ label: 'Latest document', source: `Documents · ${documents.latest.title}`, observedAt: documents.latest.addedAt.toISOString() }] : []),
    ...(overview.tools.statusBoard.status === 'AVAILABLE' && overview.tools.statusBoard.data.updatedAt
      ? [{ label: 'Systems and inventory', source: 'Home Inventory', observedAt: overview.tools.statusBoard.data.updatedAt.toISOString() }]
      : []),
  ];
  if (!roomFocus) blocks.push({ type: 'EVIDENCE', id: 'property-summary-evidence', title: 'Record freshness', items: freshness });

  const permissionLimited = Boolean(activeRequirement && !canImproveContext);
  const limited = captureRequests.length > 0 || degradedSections.length > 0 || permissionLimited || pendingDetailCount > 0 || (percent != null && percent < 100);
  return {
    status: limited ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: captureRequests.length
      ? 'PROPERTY_SUMMARY_CONTEXT_OPTIONAL'
      : permissionLimited
        ? 'PROPERTY_SUMMARY_CONTEXT_WRITE_PERMISSION_REQUIRED'
        : degradedSections.length
          ? 'PROPERTY_SUMMARY_PARTIAL'
          : pendingDetailCount > 0 || (percent != null && percent < 100)
            ? 'PROPERTY_SUMMARY_INCOMPLETE'
            : undefined,
    contextVersion: evaluation.contextVersion,
    // Never offer the generic maintenance follow-up: it is unrelated to completing the property record
    // and duplicates the capture card in completeness mode (handoff audit, FRD v1.167).
    followUp: null,
    captureRequests: completenessFocus ? captureRequests : [],
    blocks,
    suggestions: [],
  };
}

registerCapabilityHandler('property.summary', async (envelope) => propertySummaryResult(envelope.userId, envelope.propertyId!, envelope.message));



const AREA_SKIP_MARKER = '$skip';

const AREA_CAPTURE_MAX_SKIPPED = 200;




// Row actions: the eligible areas open the inline flow; the rooms and inventory rows reuse the existing Add actions.
export function areaCaptureRowActions(scope: string, canManage: boolean, unmetCount: number) {
  if (!canManage || unmetCount === 0) return undefined;
  const action = (id: string, label: string, message: string, operationId: string) => ({ id, label, message, style: 'PRIMARY' as const, interactionType: 'MUTATE_RECORD' as const, operationId });
  if (isAreaCaptureScope(scope)) return [action(`fill-area-${scope.toLowerCase()}`, 'Fill in missing details', AREA_CAPTURE_MESSAGES[scope], 'PROPERTY_CONTEXT_AREA_CAPTURE')];
  if (scope === 'ROOMS') return [action('add-room-from-completeness', 'Add a room', ROOM_ADD_MESSAGE, 'ROOM_CREATE')];
  if (scope === 'INVENTORY') return [action('add-item-from-completeness', 'Add an item', INVENTORY_ADD_MESSAGE, 'INVENTORY_ITEM_CREATE')];
  return undefined;
}

const AreaCaptureStateSchema = z.object({
  areaScope: z.enum(PROPERTY_AREA_CAPTURE_SCOPES),
  skipFactKeys: z.array(z.string().max(120)).max(AREA_CAPTURE_MAX_SKIPPED).default([]),
  // Server-computed allowlist exclusions for a typed launch (packet D3): facts the flow must not ask. Never client-supplied and never
  // displayed as skipped; empty for the legacy message-routed launch, which keeps its previous behavior.
  excludedFactKeys: z.array(z.string().max(120)).max(AREA_CAPTURE_MAX_SKIPPED).default([]),
  sourceExecutionId: z.string().nullable().default(null),
});

export function areaCaptureStateFrom(parametersJson: unknown): { scope: PropertyAreaCaptureScope; skipFactKeys: string[]; excludedFactKeys: string[]; sourceExecutionId: string | null } | null {
  const parsed = AreaCaptureStateSchema.safeParse(parametersJson);
  return parsed.success ? { scope: parsed.data.areaScope, skipFactKeys: parsed.data.skipFactKeys, excludedFactKeys: parsed.data.excludedFactKeys, sourceExecutionId: parsed.data.sourceExecutionId } : null;
}

/** The facts the question-choosing evaluator must leave out: the user's skips plus the server-owned exclusions. Every site that reproduces the question must use this. */
export const areaEffectiveSkip = (skip: ReadonlySet<string>, excluded: ReadonlySet<string>): string[] => [...new Set([...skip, ...excluded])];

export const AreaCaptureAnswerSchema = z.object({
  scope: z.enum(PROPERTY_AREA_CAPTURE_SCOPES),
  requirementId: z.string().min(1).max(100),
  captureKey: z.string().min(1).max(100),
  answer: z.record(z.string(), z.unknown()),
  expectedContextVersion: z.string().min(1).max(128),
  rows: z.array(z.object({ label: z.string(), value: z.string() })).max(40).default([]),
  areas: z.array(z.string()).max(10).default([]),
}).strict();

export function areaCaptureError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function areaValueDisplay(schema: { type: string; [key: string]: unknown }, value: unknown): string {
  if (value === null || value === undefined || value === 'UNKNOWN') return 'Not sure';
  if (schema.type === 'BOOLEAN') return value === true ? String(schema.trueLabel ?? 'Yes') : String(schema.falseLabel ?? 'No');
  const options = Array.isArray(schema.options) ? schema.options as Array<{ label: string; value: string }> : [];
  if (schema.type === 'SINGLE_SELECT') return options.find((option) => option.value === value)?.label ?? String(value);
  if (schema.type === 'MULTI_SELECT') {
    const values = Array.isArray(value) ? value : [];
    return values.length ? values.map((entry) => options.find((option) => option.value === entry)?.label ?? String(entry)).join(', ') : 'None';
  }
  if ((schema.type === 'INTEGER' || schema.type === 'DECIMAL') && typeof schema.unit === 'string' && schema.unit) return `${value} ${schema.unit}`;
  return String(value);
}


export async function areaCapturePrompt(
  userId: string, propertyId: string, scope: PropertyAreaCaptureScope, skip: Set<string>, sourceExecutionId: string | null, notice?: string,
  excluded: ReadonlySet<string> = new Set(),
): Promise<AskOperationResult> {
  const [evaluation, progress] = await Promise.all([
    evaluateFeatureContext(propertyId, userId, { featureKey: PROPERTY_AREA_CAPTURE_FEATURE, operationKey: PROPERTY_AREA_CAPTURE_OPERATION, operationInput: { scope, skipFactKeys: areaEffectiveSkip(skip, excluded) } }),
    areaCaptureProgress(userId, propertyId, scope, skip, excluded),
  ]);
  const parameters = { areaScope: scope, skipFactKeys: [...skip], ...(excluded.size ? { excludedFactKeys: [...excluded] } : {}), sourceExecutionId };
  const noticeBlock: AskPresentationBlock[] = notice ? [{ type: 'SUMMARY', id: 'area-capture-notice', title: notice, body: 'Nothing was saved. You can come back to it any time.', tone: 'DEFAULT', actions: [] }] : [];
  const requirement = evaluation.requirements[0];
  if (!requirement || requirement.capture.inputSchema.type === 'RELATIONAL_SELECT_CREATE' || requirement.capture.inputSchema.type === 'RELATIONAL_UPDATE') {
    return {
      status: 'ANSWERED', reasonCode: 'AREA_CAPTURE_NO_MORE_QUESTIONS', contextVersion: evaluation.contextVersion, parameters,
      blocks: [...noticeBlock, areaProgressBlock(propertyId, scope, progress, true, false)], suggestions: [],
    };
  }
  const capture = requirement.capture;
  const areas = [...new Set(capture.factKeys.map((key) => areaLabel(getFactDefinition(key).scope)))];
  const alsoUpdates = areas.length > 1 ? ` This answer updates: ${areas.join(', ')}.` : '';
  const request: AskCaptureRequest = {
    requirementId: requirement.requirementId, captureKey: capture.captureKey, classification: 'WORKFLOW_INPUT', state: requirement.state,
    title: capture.title, question: capture.question,
    helpText: `${capture.helpText ? `${capture.helpText} ` : ''}You will review it before anything is saved.${alsoUpdates}`.trim(),
    inputSchema: capture.inputSchema, ...(requirement.currentAnswer === undefined ? {} : { currentAnswer: requirement.currentAnswer }),
    allowNotSure: capture.allowNotSure, sensitivity: capture.sensitivity,
    destinationLabel: 'Used to prepare this answer; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: evaluation.contextVersion, skippable: true,
  };
  return {
    status: 'NEEDS_CONTEXT', reasonCode: 'AREA_CAPTURE_INPUT_REQUIRED', contextVersion: evaluation.contextVersion, parameters,
    blocks: [...noticeBlock, areaProgressBlock(propertyId, scope, progress, false, false)], captureRequests: [request], suggestions: [],
  };
}

export async function areaCaptureSubmitResult(
  userId: string, propertyId: string, scope: PropertyAreaCaptureScope, skip: Set<string>, sourceExecutionId: string | null,
  submitted: { requirementId: string; captureKey: string; answer: Record<string, unknown>; expectedContextVersion: string; sensitiveDataConfirmed: boolean },
  excluded: ReadonlySet<string> = new Set(),
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) throw areaCaptureError('ASK_PERMISSION_REQUIRED', 'A contributor or owner is required to add home details.');
  const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: PROPERTY_AREA_CAPTURE_FEATURE, operationKey: PROPERTY_AREA_CAPTURE_OPERATION, operationInput: { scope, skipFactKeys: areaEffectiveSkip(skip, excluded) } });
  const active = evaluation.requirements[0];
  if (!active || active.requirementId !== submitted.requirementId || active.capture.captureKey !== submitted.captureKey) {
    throw areaCaptureError('ASK_CAPTURE_NOT_ACTIVE', 'This question is no longer the current one. Start again from the area.');
  }
  if (evaluation.contextVersion !== submitted.expectedContextVersion) {
    throw areaCaptureError('ASK_CONTEXT_VERSION_CONFLICT', 'The home record changed while this question was open. Start again from the area.');
  }
  const withSkipped = (): Set<string> => {
    if (skip.size + active.capture.factKeys.length > AREA_CAPTURE_MAX_SKIPPED) throw areaCaptureError('ASK_CAPTURE_VALIDATION_ERROR', 'Too many details were skipped in this session. Start again from the area.');
    return new Set([...skip, ...active.capture.factKeys]);
  };
  if (Object.keys(submitted.answer).length === 1 && submitted.answer[AREA_SKIP_MARKER] === true) {
    return areaCapturePrompt(userId, propertyId, scope, withSkipped(), sourceExecutionId, 'Skipped for now', excluded);
  }
  const definition = getCaptureDefinition(submitted.captureKey);
  if (definition.mode === 'RELATIONAL') throw areaCaptureError('ASK_CAPTURE_NOT_ACTIVE', 'This question cannot be answered here.');
  if (definition.sensitivity !== 'STANDARD' && !submitted.sensitiveDataConfirmed) {
    throw areaCaptureError('ASK_CAPTURE_CONFIRMATION_REQUIRED', 'Confirm that you want to save this sensitive home information.');
  }
  let answers: Array<{ factKey: string; value: unknown }>;
  try {
    answers = normalizeAnswers(definition, submitted.answer, active.capture.allowNotSure);
  } catch (error) {
    throw areaCaptureError('ASK_CAPTURE_VALIDATION_ERROR', error instanceof Error ? error.message : 'Check the answer and try again.');
  }
  if (!answers.length) throw areaCaptureError('ASK_CAPTURE_VALIDATION_ERROR', 'Answer at least one question, or skip it.');
  // "Not sure" for everything saves nothing: it is treated as a skip so the same question does not come straight back.
  if (answers.every(({ value }) => value === null || value === 'UNKNOWN')) {
    return areaCapturePrompt(userId, propertyId, scope, withSkipped(), sourceExecutionId, 'Marked not sure for this session', excluded);
  }
  const fieldSchemas: Array<{ factKey: string; label: string; schema: { type: string; [key: string]: unknown } }> = definition.mode === 'SCALAR'
    ? [{ factKey: definition.factKeys[0], label: definition.title, schema: definition.inputSchema as { type: string } }]
    : (definition.inputSchema.type === 'GROUP' ? definition.inputSchema.fields : []).map((field) => ({
      factKey: definition.answerBindings?.[field.key] ?? '', label: field.label, schema: field.inputSchema as { type: string },
    }));
  const rows = answers.map(({ factKey, value }) => {
    const field = fieldSchemas.find((candidate) => candidate.factKey === factKey);
    return { label: field?.label ?? definition.title, value: field ? areaValueDisplay(field.schema, value) : String(value) };
  });
  const areas = [...new Set(answers.map(({ factKey }) => areaLabel(getFactDefinition(factKey).scope)))];
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { name: true, address: true, city: true } });
  const propertyName = property?.name?.trim() || (property ? `${property.address}, ${property.city}` : 'This property');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const contextVersion = evaluation.contextVersion;
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'AREA_CAPTURE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: {
      areaScope: scope, skipFactKeys: [...skip], ...(excluded.size ? { excludedFactKeys: [...excluded] } : {}), sourceExecutionId,
      areaCapture: { scope, requirementId: active.requirementId, captureKey: submitted.captureKey, answer: submitted.answer, expectedContextVersion: contextVersion, rows, areas },
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [areaProgressBlock(propertyId, scope, await areaCaptureProgress(userId, propertyId, scope, skip, excluded), false, false)],
    confirmation: {
      confirmationId: `area-capture-${createHash('sha256').update(`${propertyId}:${scope}:${active.requirementId}`).digest('hex').slice(0, 12)}-1`, version: 1,
      title: `Save "${definition.title}" to your home record?`,
      description: 'This saves the answer to the shared home record through Property Context, the same record the property page and recommendations read. Nothing is saved until you confirm.',
      fields: [{ label: 'Property', value: propertyName }, ...rows, { label: 'Areas updated', value: areas.join(', ') }],
      editableFields: [], confirmLabel: 'Save details', consentText: 'I authorize saving these details to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the answer can be changed and resubmitted before confirming.
    captureRequests: [{
      requirementId: active.requirementId, captureKey: submitted.captureKey, classification: 'WORKFLOW_INPUT', state: active.state,
      title: active.capture.title, question: active.capture.question, helpText: null, inputSchema: active.capture.inputSchema,
      currentAnswer: definition.mode === 'SCALAR' ? { value: answers[0]?.value ?? null } : Object.fromEntries(Object.entries(definition.answerBindings ?? {}).map(([key, factKey]) => [key, answers.find((answer) => answer.factKey === factKey)?.value ?? null])),
      allowNotSure: active.capture.allowNotSure, sensitivity: active.capture.sensitivity,
      destinationLabel: 'Used to prepare this answer; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion, skippable: true,
    }],
    suggestions: [],
  };
}
