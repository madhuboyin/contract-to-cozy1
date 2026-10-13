// Adjust the Capital Timeline inside Ask (register P1 "Capital Timeline"; FRD v1.318): add and remove an item's adjustment (planned date or window, cost
// range, remaining life, leave it off the timeline, or a note). Each goes through HomeCapitalTimelineService.createOverride / deleteOverride after the
// same assertFinancialContextApplicable('CAPITAL_TIMELINE') the routes run (their controllers add nothing else), behind a review card and a confirmation.
// Saving an adjustment marks the latest timeline out of date; the timeline itself is rebuilt when it is next run, and the receipt says so.
//
// Not here: editing an adjustment in place (remove and add again), and running the timeline.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { HomeCapitalTimelineService } from '../../homeCapitalTimeline.service';
import { assertFinancialContextApplicable } from '../../financialContext/context';
import { visibleInventoryItemWhere } from '../../riskAssetApplicability';
import {
  CAPITAL_ADJUST_CAPTURE_KEY, CAPITAL_COMMAND_ACTION_IDS, CAPITAL_COMMAND_MESSAGES, CAPITAL_OVERRIDE_ENTITY_TYPE, CAPITAL_OVERRIDE_SHORT_LABELS,
  CAPITAL_OVERRIDE_TYPES, CAPITAL_OVERRIDE_TYPE_LABELS, CAPITAL_PROPERTY_ENTITY_TYPE, capitalAdjustFormAnswer, capitalCommandKindFromMessage, parseCapitalAdjustAnswer,
  type CapitalAdjustInput, type CapitalCommandKind,
} from '../support/capitalTimelineCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;
const service = new HomeCapitalTimelineService();
const ITEM_OPTION_LIMIT = 100;

export interface CapitalCommandLaunch { kind: CapitalCommandKind; entityId: string; sourceExecutionId: string | null }

const backToPlan = { id: 'capital-timeline-back', label: 'Back to the capital plan', interactionType: 'START_WORKFLOW' as const, message: 'How is my reserve fund doing?', operationId: 'CAPITAL_RESERVE_PLAN' as const, style: 'SECONDARY' as const };

const permissionBlocked = (): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id: 'capital-command-permission', title: 'A contributor or owner can adjust the capital timeline', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode: 'ASK_CAPITAL_COMMAND_NOT_DIRECTLY_ROUTABLE',
  blocks: [{ type: 'SUMMARY', id: 'capital-command-not-routable', title: 'Open the capital plan first', body: 'An adjustment is made from your capital plan. Nothing has changed.', tone: 'DEFAULT', actions: [backToPlan] }],
  suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'capital-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToPlan] }], suggestions: [],
});

async function loadItems(propertyId: string): Promise<Array<{ id: string; name: string | null; category: string | null }>> {
  return database.inventoryItem.findMany({
    where: { propertyId, ...visibleInventoryItemWhere() }, select: { id: true, name: true, category: true }, orderBy: { name: 'asc' }, take: ITEM_OPTION_LIMIT,
  });
}
const itemLabel = (item: { name: string | null; category: string | null }) => item.name || String(item.category ?? 'Item').toLowerCase().replace(/_/g, ' ');

/** Bound to the household's items and its current adjustments, so a form opened before either changed is refused as out of date. */
async function addContextVersion(propertyId: string, items: Array<{ id: string }>) {
  const overrides = await service.listOverrides(propertyId);
  return sha(`capital-adjust:${propertyId}:${items.map((item) => item.id).join(',')}:${overrides.map((o: any) => String(o.id)).sort().join(',')}`);
}

function formCapture(items: Array<{ id: string; name: string | null; category: string | null }>, contextVersion: string, entered?: Record<string, unknown>): AskCaptureRequest {
  const clean = (value?: Record<string, unknown>) => Object.fromEntries(Object.entries(value ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  const date = (key: string, label: string) => ({ key, label, required: false, inputSchema: { type: 'APPROXIMATE_DATE' as const, allowedPrecisions: ['EXACT_DATE'], allowFuture: true } });
  return {
    requirementId: 'capital-timeline-adjust-inputs', captureKey: CAPITAL_ADJUST_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'Adjust the capital timeline',
    question: 'Which item, and what should the timeline assume?',
    helpText: 'Pick the item and what you know. Only the fields for your choice are used. The timeline is rebuilt the next time it is run; nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'inventoryItemId', label: 'Item', required: false, inputSchema: { type: 'SINGLE_SELECT', options: items.map((item) => ({ label: itemLabel(item), value: item.id })) } },
      { key: 'type', label: 'What to adjust', required: true, inputSchema: { type: 'SINGLE_SELECT', options: CAPITAL_OVERRIDE_TYPES.map((value) => ({ label: CAPITAL_OVERRIDE_TYPE_LABELS[value], value })) } },
      date('plannedDate', 'Planned date'), date('windowStart', 'Window starts'), date('windowEnd', 'Window ends'),
      { key: 'minCost', label: 'Lowest cost ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'maxCost', label: 'Highest cost ($)', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 100_000_000 } },
      { key: 'remainingYears', label: 'Years left', required: false, inputSchema: { type: 'NUMBER', min: 0, max: 100 } },
      { key: 'note', label: 'Note', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 500 } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: clean(entered), allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: 'Saves the adjustment after confirmation', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

function describe(input: CapitalAdjustInput): Array<{ label: string; value: string }> {
  const p = input.payload as { date?: string; start?: string; end?: string; minCents?: number; maxCents?: number; remainingYears?: number };
  const day = (value?: string) => (value ? humanDate(new Date(`${value}T12:00:00.000Z`)) ?? value : null);
  const rows: Array<{ label: string; value: string | null }> = [
    { label: 'Adjustment', value: CAPITAL_OVERRIDE_SHORT_LABELS[input.type] ?? input.type },
    { label: 'Date', value: day(p.date) }, { label: 'Window', value: p.start && p.end ? `${day(p.start)} to ${day(p.end)}` : null },
    { label: 'Cost range', value: p.minCents !== undefined || p.maxCents !== undefined ? `${p.minCents !== undefined ? money(p.minCents / 100) : 'any'} to ${p.maxCents !== undefined ? money(p.maxCents / 100) : 'any'}` : null },
    { label: 'Years left', value: p.remainingYears !== undefined ? String(p.remainingYears) : null }, { label: 'Note', value: input.note },
  ];
  return rows.filter((row): row is { label: string; value: string } => Boolean(row.value));
}

export async function capitalCommandResult(userId: string, propertyId: string, launch: CapitalCommandLaunch, supplied?: CapitalAdjustInput): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked();
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const kind = launch.kind;

  if (kind === 'REMOVE') {
    const override = await database.homeCapitalTimelineOverride.findFirst({ where: { id: launch.entityId, propertyId }, select: { id: true, type: true, inventoryItemId: true, note: true, createdAt: true } });
    if (!override) return unavailable('CAPITAL_ADJUSTMENT_NOT_FOUND', 'That adjustment is no longer available', 'Ask could not find that adjustment. Nothing has changed.');
    const contextVersion = sha(`capital-remove:${override.id}`);
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'CAPITAL_REMOVE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { capitalCommand: { kind, entityId: override.id }, capitalContextVersion: contextVersion, ...base },
      blocks: [{ type: 'SUMMARY', id: 'capital-remove-review', title: 'Remove this adjustment?', body: 'The timeline goes back to its own estimate for this item the next time it is run.', tone: 'DEFAULT', actions: [] }],
      confirmation: {
        confirmationId: `capital-remove-${sha(`${propertyId}:${override.id}`).slice(0, 12)}-1`, version: 1, title: `Remove the "${CAPITAL_OVERRIDE_SHORT_LABELS[String(override.type)] ?? override.type}" adjustment?`,
        description: 'The timeline goes back to its own estimate for this item the next time it is run. Nothing else is changed.',
        fields: [{ label: 'Adjustment', value: CAPITAL_OVERRIDE_SHORT_LABELS[String(override.type)] ?? String(override.type) }, ...(override.note ? [{ label: 'Note', value: String(override.note) }] : [])],
        editableFields: [], confirmLabel: 'Remove adjustment', consentText: 'I authorize removing this adjustment from the shared capital timeline.', expiresAt: expiresAt.toISOString(),
      },
      suggestions: [],
    };
  }

  const items = await loadItems(propertyId);
  const contextVersion = await addContextVersion(propertyId, items);
  const launchParameters = { capitalCommandLaunch: { kind, entityId: propertyId, sourceExecutionId: launch.sourceExecutionId } };
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'CAPITAL_ADJUST_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'capital-adjust-input', title: 'Adjust the capital timeline', body: 'Choose the item and what you know. Nothing has been saved yet.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture(items, contextVersion)], suggestions: [],
    };
  }
  const item = supplied.inventoryItemId ? items.find((entry) => entry.id === supplied.inventoryItemId) : null;
  if (supplied.inventoryItemId && !item) return unavailable('CAPITAL_ITEM_NOT_FOUND', 'That item is not on the timeline', 'Choose one of your recorded items. Nothing has changed.');
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'CAPITAL_ADJUST_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { capitalAdjust: capitalAdjustFormAnswer(supplied), capitalCommand: { kind, entityId: propertyId }, capitalContextVersion: contextVersion, ...base },
    blocks: [{ type: 'SUMMARY', id: 'capital-adjust-review', title: 'Review this adjustment', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `capital-adjust-${sha(`${propertyId}:${JSON.stringify(supplied)}`).slice(0, 12)}-1`, version: 1,
      title: `Adjust ${item ? itemLabel(item) : 'the capital timeline'}?`,
      description: 'This saves your correction. The timeline marks itself out of date and uses it the next time it is run; no contractor is contacted and nothing is bought.',
      fields: [...(item ? [{ label: 'Item', value: itemLabel(item) }] : []), ...describe(supplied)],
      editableFields: [], confirmLabel: 'Save adjustment', consentText: 'I authorize adding this adjustment to the shared capital timeline.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [formCapture(items, contextVersion, capitalAdjustFormAnswer(supplied))], suggestions: [],
  };
}

registerCapabilityHandler('capital-timeline.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = capitalCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'CAPITAL_TIMELINE_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId) return notRoutable();
  const entityType = kind === 'ADD' ? CAPITAL_PROPERTY_ENTITY_TYPE : CAPITAL_OVERRIDE_ENTITY_TYPE;
  if (launch.entityType !== entityType) return notRoutable();
  return capitalCommandResult(envelope.userId, envelope.propertyId!, { kind, entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmCapitalCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.capitalCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as CapitalCommandKind | undefined;
  if (!kind || !(kind in CAPITAL_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  try {
    // The same applicability gate the routes run before every change.
    await assertFinancialContextApplicable(propertyId, userId, 'CAPITAL_TIMELINE', 'capitalPlanning');
    let title: string; let description: string; let artifactId = command.entityId;
    if (kind === 'ADD') {
      const items = await loadItems(propertyId);
      if (parameters.capitalContextVersion !== await addContextVersion(propertyId, items)) {
        throw stale('Your items or adjustments changed while the form was open. Start the adjustment again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      }
      const checked = parseCapitalAdjustAnswer(parameters.capitalAdjust);
      if (!checked.success) throw stale('The adjustment to save is invalid.');
      if (checked.data.inventoryItemId && !items.some((item) => item.id === checked.data.inventoryItemId)) throw stale('That item is no longer on the timeline.');
      const created = await service.createOverride(propertyId, { inventoryItemId: checked.data.inventoryItemId, type: checked.data.type as never, payload: checked.data.payload, note: checked.data.note });
      artifactId = String((created as { id?: unknown }).id ?? artifactId);
      title = 'Adjustment saved'; description = 'The timeline is marked out of date and uses this the next time it is run. No contractor was contacted.';
    } else {
      const override = await database.homeCapitalTimelineOverride.findFirst({ where: { id: command.entityId, propertyId }, select: { id: true } });
      if (!override) throw stale('That adjustment is no longer available.');
      await service.deleteOverride(propertyId, override.id);
      title = 'Adjustment removed'; description = 'The timeline goes back to its own estimate for this item the next time it is run.';
    }
    const result: AskOperationResult = {
      status: 'COMPLETED', reasonCode: `CAPITAL_COMMAND_${kind}_COMPLETED`,
      blocks: [{ type: 'WORKFLOW_PROGRESS', id: `capital-command-${kind.toLowerCase()}-${artifactId}`, title, status: 'COMPLETED', description, details: [], actions: [{ ...backToPlan, label: 'See the capital plan', style: 'PRIMARY' as const }] }],
      suggestions: [],
    };
    const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
    if (refresh.attemptedAndFailed) {
      result.blocks.push({
        type: 'LIMITATION', id: `capital-command-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
        body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
      });
    }
    return { result, artifactType: 'CAPITAL_TIMELINE_OVERRIDE', artifactId, refreshedExecutions: refresh.refreshedExecutions };
  } catch (error) {
    if (error instanceof APIError) throw Object.assign(new Error(error.message), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    throw error;
  }
}
registerConfirmCapabilityHandler('capital-timeline.command', confirmCapitalCommand);
