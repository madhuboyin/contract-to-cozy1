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
import { AREA_CAPTURE_ANCHORS, AREA_CAPTURE_MESSAGES, areaCaptureFallbackHref, areaCaptureProgress, areaFallbackAnchor, areaLabel, areaProgressBlock, ensurePropertyAccess, homeEventCorrectionItemActions, isAreaCaptureScope, PROPERTY_SCOPE_LABELS, readablePropertyValue } from '../askHandlerSupport';
import { EVENT_ADD_MESSAGE, ROOM_ADD_MESSAGE, roomRenameItemActions, WARRANTY_ADD_MESSAGE, warrantyCorrectionItemActions } from '../handlers/homeRecordWrites.handler';
import { INVENTORY_ADD_MESSAGE, inventoryAddItemAction, inventoryCorrectionItemActions } from '../handlers/inventory.handler';
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

async function propertySummaryResult(userId: string, propertyId: string, message: string): Promise<AskOperationResult> {
  const propertyHref = `/dashboard/properties/${encodeURIComponent(propertyId)}`;
  const completenessFocus = isPropertyCompletenessRequest(message);
  const [access, overview, evaluation, property] = await Promise.all([
    ensurePropertyAccess(userId, propertyId),
    getPropertyRecordOverview(propertyId, userId, 'ASK'),
    evaluateFeatureContext(propertyId, userId, { featureKey: 'PROPERTY_RECORD_SUMMARY', operationKey: 'VIEW_SUMMARY' }),
    prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true, name: true, address: true, city: true, state: true, zipCode: true, dwellingType: true,
        propertyUse: true, occupancyStatus: true, propertySize: true, yearBuilt: true, bedrooms: true,
        bathrooms: true, heatingType: true, coolingType: true, roofType: true, updatedAt: true,
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
  const warranties = overview.sections.warranties.status === 'AVAILABLE' ? overview.sections.warranties.data : null;
  const timeline = overview.tools.homeTimeline.status === 'AVAILABLE' ? overview.tools.homeTimeline.data : null;
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
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'property-summary',
    title: completenessFocus && percent != null
      ? `${propertyName}’s Property Context is ${percent}% complete`
      : `Here is the current Living Home Record for ${propertyName}`,
    body: completenessFocus
      ? completenessBody
      : `${context ? `${context.knownFactCount} governed property facts are currently known.` : 'Property Context details are temporarily unavailable.'} The record contains ${rooms?.count ?? 'an unknown number of'} room${rooms?.count === 1 ? '' : 's'}, ${inventory?.totalCount ?? 'an unknown number of'} inventory item${inventory?.totalCount === 1 ? '' : 's'}, and ${documents?.totalCount ?? 'an unknown number of'} document${documents?.totalCount === 1 ? '' : 's'}. ${degradedSections.length ? `${degradedSections.join(', ')} could not be fully loaded, so this is a partial summary.` : 'All summary sections loaded successfully.'}`,
    tone: degradedSections.length || pendingDetailCount > 0 || (percent != null && percent < 100) ? 'CAUTION' : 'DEFAULT',
    actions: [{ id: 'open-property-record', label: completenessFocus && pendingDetailCount > 0 ? 'Review missing details' : completenessFocus ? 'Review home details' : 'Open property record', href: propertyHref, style: 'PRIMARY' }],
  }];

  if (!completenessFocus) {
    blocks.push({
      type: 'TABLE', id: 'property-core-facts', title: 'Core property facts',
      description: 'Values come from the canonical property record. “Not recorded” is not inferred from other fields.',
      columns: [{ key: 'fact', label: 'Fact' }, { key: 'value', label: 'Recorded value' }],
      rows: [
        { id: 'address', values: { fact: 'Address', value: `${property.address}, ${property.city}, ${property.state} ${property.zipCode}` } },
        { id: 'dwelling', values: { fact: 'Dwelling type', value: readablePropertyValue(property.dwellingType) } },
        { id: 'use', values: { fact: 'Property use', value: readablePropertyValue(property.propertyUse) } },
        { id: 'occupancy', values: { fact: 'Occupancy', value: readablePropertyValue(property.occupancyStatus) } },
        { id: 'year-built', values: { fact: 'Year built', value: readablePropertyValue(property.yearBuilt) } },
        { id: 'size', values: { fact: 'Living area', value: property.propertySize == null ? 'Not recorded' : `${new Intl.NumberFormat('en-US').format(property.propertySize)} sq ft` } },
        { id: 'beds-baths', values: { fact: 'Bedrooms / bathrooms', value: `${property.bedrooms == null ? 'Not recorded' : property.bedrooms} / ${property.bathrooms == null ? 'Not recorded' : property.bathrooms}` } },
        { id: 'heating-cooling', values: { fact: 'Heating / cooling', value: `${readablePropertyValue(property.heatingType)} / ${readablePropertyValue(property.coolingType)}` } },
        { id: 'roof', values: { fact: 'Roof type', value: readablePropertyValue(property.roofType) } },
      ],
      actions: [],
    });
    if (inventory) {
      blocks.push({
        type: 'GROUPED_LIST', filters: [], id: 'property-inventory', title: 'Systems and inventory',
        description: inventory.totalCount > 50
          ? 'Showing the first 50 canonical inventory records. Open home inventory for the full collection.'
          : 'Select an item to inspect its current canonical details without leaving Ask Cozy.',
        sections: [{
          id: 'inventory', title: 'Recorded items', count: inventory.totalCount,
          items: inventory.items.slice(0, 50).map((item) => ({
            id: item.id, title: item.name, description: null, entityType: 'INVENTORY_ITEM', href: null, actions: inventoryCorrectionItemActions(access.role !== HouseholdRole.VIEWER),
            status: item.isVerified ? 'VERIFIED' : null,
            meta: [readablePropertyValue(item.category), readablePropertyValue(item.condition), `Updated ${humanDate(item.updatedAt) ?? 'date unavailable'}`],
          })),
        }],
        actions: [
          ...(access.role !== HouseholdRole.VIEWER ? [inventoryAddItemAction()] : []),
          { id: 'open-inventory', label: 'Open home inventory', href: `${propertyHref}/inventory`, style: 'SECONDARY' as const },
        ],
      });
    }
    if (household) {
      blocks.push({
        type: 'GROUPED_LIST', filters: [], id: 'property-household', title: 'Household access',
        description: household.totalCount > 50
          ? 'Showing the first 50 canonical household members. Open household access for the full collection.'
          : 'Select a household member to inspect their current canonical role without leaving Ask Cozy.',
        sections: [{
          id: 'household', title: 'Household members', count: household.totalCount,
          items: household.items.slice(0, 50).map((member) => ({
            id: member.id, title: member.displayName?.trim() || `${member.user.firstName} ${member.user.lastName}`.trim() || member.user.email,
            description: null, entityType: 'HOUSEHOLD_MEMBER', href: null,
            status: member.isPrimaryOwner ? 'PRIMARY OWNER' : null,
            meta: [readablePropertyValue(member.role), `Joined ${humanDate(member.joinedAt) ?? 'date unavailable'}`],
          })),
        }],
        actions: [{ id: 'open-household', label: 'Open household access', href: `${propertyHref}/household`, style: 'SECONDARY' }],
      });
    }
    if (warranties) {
      // Owner-only corrections: actions only on warranties the requester's own
      // homeownerProfile added (see WARRANTY_CORRECTION_FIELDS).
      const ownedWarrantyIds = access.role !== HouseholdRole.VIEWER
        ? new Set((await prisma.warranty.findMany({ where: { propertyId, homeownerProfile: { userId } }, select: { id: true } })).map((row) => row.id))
        : new Set<string>();
      blocks.push({
        type: 'GROUPED_LIST', filters: [], id: 'property-warranties', title: 'Warranties',
        description: warranties.totalCount > 50
          ? 'Showing the first 50 canonical warranty records. Open Warranties for the full collection.'
          : 'Select a warranty to inspect its current canonical details without leaving Ask Cozy.',
        sections: [{
          id: 'warranties', title: 'Recorded warranties', count: warranties.totalCount,
          items: warranties.items.slice(0, 50).map((warranty) => ({
            id: warranty.id, title: warranty.providerName, description: null, entityType: 'WARRANTY', href: null, actions: warrantyCorrectionItemActions(access.role !== HouseholdRole.VIEWER, ownedWarrantyIds.has(warranty.id)),
            status: warranty.expiryDate > new Date() ? 'ACTIVE' : 'EXPIRED',
            meta: [readablePropertyValue(warranty.category), `Expires ${humanDate(warranty.expiryDate) ?? 'date unavailable'}`],
          })),
        }],
        actions: [
          ...(access.role !== HouseholdRole.VIEWER ? [{ id: 'add-warranty', label: 'Add a warranty', interactionType: 'START_WORKFLOW' as const, message: WARRANTY_ADD_MESSAGE, operationId: 'CAPTURE_WARRANTY_CONFIRM', style: 'PRIMARY' as const }] : []),
          { id: 'open-warranties', label: 'Open Warranties', href: '/dashboard/warranties', style: 'SECONDARY' as const },
        ],
      });
    }
    if (rooms) {
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
        presentation: { pattern: 'ROOM_MAP' },
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
        actions: [
          ...(access.role !== HouseholdRole.VIEWER ? [{ id: 'add-room', label: 'Add a room', interactionType: 'START_WORKFLOW' as const, message: ROOM_ADD_MESSAGE, operationId: 'ROOM_CREATE', style: 'PRIMARY' as const }] : []),
          { id: 'open-rooms', label: 'Open Rooms', href: `${propertyHref}/rooms`, style: 'SECONDARY' as const },
        ],
      });
    }
    if (documents) {
      const documentsHref = `/dashboard/documents?propertyId=${encodeURIComponent(propertyId)}`;
      blocks.push({
        type: 'GROUPED_LIST', filters: [], id: 'property-documents', title: 'Documents',
        description: documents.totalCount > 50
          ? 'Showing the 50 most recent canonical document records. Open Documents for the full collection.'
          : 'Select a document to inspect its current canonical details without leaving Ask Cozy.',
        sections: [{
          id: 'documents', title: 'Recorded documents', count: documents.totalCount,
          items: documents.items.slice(0, 50).map((document) => ({
            id: document.id, title: document.name, description: null, entityType: 'DOCUMENT', href: null,
            status: document.verificationStatus,
            meta: [readablePropertyValue(document.type), `Uploaded ${humanDate(document.createdAt) ?? 'date unavailable'}`],
          })),
        }],
        actions: [{ id: 'open-documents', label: 'Open Documents', href: documentsHref, style: 'SECONDARY' }],
      });
    }
  }

  if (incompleteScopes.length) {
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

  const recentEvents = timeline?.recent ?? [];
  const canAddEvent = access.role !== HouseholdRole.VIEWER;
  // The block also appears on a home with no confirmed events yet, so a contributor still has the Add entry point.
  if (!completenessFocus && timeline && (recentEvents.length > 0 || canAddEvent)) {
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'property-recent-events', title: 'Recent verified home activity',
      description: recentEvents.length
        ? `${timeline.confirmedCount} current confirmed or evidence-verified event${timeline.confirmedCount === 1 ? '' : 's'} are visible to you. Showing the most recent records.`
        : 'No confirmed or evidence-verified events are recorded for this home yet.',
      sections: [{
        id: 'recent-events', title: 'Home Timeline', count: recentEvents.length,
        items: recentEvents.map((event) => ({
          id: event.id, title: event.title, description: null,
          meta: [humanDate(event.occurredAt) ?? 'Date unavailable', event.type.toLowerCase().replace(/_/g, ' '), event.verificationStatus.toLowerCase().replace(/_/g, ' '), event.sourceBadge.toLowerCase().replace(/_/g, ' ')],
          status: event.verificationStatus, href: null, entityType: 'HOME_EVENT', actions: homeEventCorrectionItemActions(access.role !== HouseholdRole.VIEWER),
        })),
      }],
      actions: [
        ...(canAddEvent ? [{ id: 'add-timeline-event', label: 'Add a timeline event', interactionType: 'START_WORKFLOW' as const, message: EVENT_ADD_MESSAGE, operationId: 'CAPTURE_EVENT_CONFIRM', style: 'PRIMARY' as const }] : []),
        { id: 'open-home-timeline', label: 'Open home timeline', href: `${propertyHref}/timeline`, style: 'SECONDARY' as const },
      ],
    });
  }

  const freshness = [
    { label: 'Core property record', source: 'Property', observedAt: property.updatedAt.toISOString() },
    ...(documents?.latest ? [{ label: 'Latest document', source: `Documents · ${documents.latest.name}`, observedAt: documents.latest.createdAt.toISOString() }] : []),
    ...(overview.tools.statusBoard.status === 'AVAILABLE' && overview.tools.statusBoard.data.updatedAt
      ? [{ label: 'Systems and inventory', source: 'Home Inventory', observedAt: overview.tools.statusBoard.data.updatedAt.toISOString() }]
      : []),
  ];
  blocks.push({ type: 'EVIDENCE', id: 'property-summary-evidence', title: 'Record freshness', items: freshness });

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
    captureRequests,
    blocks,
    suggestions: completenessFocus
      ? ['Summarize my home record', 'Show incomplete inventory records', 'List pending maintenance tasks']
      : ['How complete is my property profile?', 'Show incomplete inventory records', 'What maintenance is pending?'],
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
  sourceExecutionId: z.string().nullable().default(null),
});

export function areaCaptureStateFrom(parametersJson: unknown): { scope: PropertyAreaCaptureScope; skipFactKeys: string[]; sourceExecutionId: string | null } | null {
  const parsed = AreaCaptureStateSchema.safeParse(parametersJson);
  return parsed.success ? { scope: parsed.data.areaScope, skipFactKeys: parsed.data.skipFactKeys, sourceExecutionId: parsed.data.sourceExecutionId } : null;
}

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
): Promise<AskOperationResult> {
  const [evaluation, progress] = await Promise.all([
    evaluateFeatureContext(propertyId, userId, { featureKey: PROPERTY_AREA_CAPTURE_FEATURE, operationKey: PROPERTY_AREA_CAPTURE_OPERATION, operationInput: { scope, skipFactKeys: [...skip] } }),
    areaCaptureProgress(userId, propertyId, scope, skip),
  ]);
  const parameters = { areaScope: scope, skipFactKeys: [...skip], sourceExecutionId };
  const noticeBlock: AskPresentationBlock[] = notice ? [{ type: 'SUMMARY', id: 'area-capture-notice', title: notice, body: 'Nothing was saved. You can come back to it any time.', tone: 'DEFAULT', actions: [] }] : [];
  const requirement = evaluation.requirements[0];
  if (!requirement || requirement.capture.inputSchema.type === 'RELATIONAL_SELECT_CREATE' || requirement.capture.inputSchema.type === 'RELATIONAL_UPDATE') {
    return {
      status: 'ANSWERED', reasonCode: 'AREA_CAPTURE_NO_MORE_QUESTIONS', contextVersion: evaluation.contextVersion, parameters,
      blocks: [...noticeBlock, areaProgressBlock(propertyId, scope, progress, true, false)], suggestions: ['How complete is my home record?'],
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
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) throw areaCaptureError('ASK_PERMISSION_REQUIRED', 'A contributor or owner is required to add home details.');
  const evaluation = await evaluateFeatureContext(propertyId, userId, { featureKey: PROPERTY_AREA_CAPTURE_FEATURE, operationKey: PROPERTY_AREA_CAPTURE_OPERATION, operationInput: { scope, skipFactKeys: [...skip] } });
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
    return areaCapturePrompt(userId, propertyId, scope, withSkipped(), sourceExecutionId, 'Skipped for now');
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
    return areaCapturePrompt(userId, propertyId, scope, withSkipped(), sourceExecutionId, 'Marked not sure for this session');
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
      areaScope: scope, skipFactKeys: [...skip], sourceExecutionId,
      areaCapture: { scope, requirementId: active.requirementId, captureKey: submitted.captureKey, answer: submitted.answer, expectedContextVersion: contextVersion, rows, areas },
      confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString(),
    },
    blocks: [areaProgressBlock(propertyId, scope, await areaCaptureProgress(userId, propertyId, scope, skip), false, false)],
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
