// Two records added inside Ask (FRD v1.251), replacing the desktop pages that were the only way to start them (owner decision 2026-10-10):
//   - MATERIAL_SPEC_ADD  a material, product or finish used in the home (Material Specs);
//   - HOME_PLANT_ADD     an indoor plant in one of the home's rooms (Plant Advisor).
// Each is reached only by its declared action (no message pattern, no fuzzy retrieval), asks for the details in an inline form, shows a review card,
// and writes only after the homeowner confirms, through the same service the desktop page calls, repeating the side effects its controller adds.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { HomePlantAddInputSchema, MaterialSpecAddInputSchema } from '../support/commandInputs';
import {
  HOME_PLANT_ADD_MESSAGE, HOME_PLANT_ADD_ROOM_ACTION_ID, HOME_PLANT_CAPTURE_KEY, MATERIAL_SPEC_ADD_MESSAGE, MATERIAL_SPEC_CAPTURE_KEY, WHOLE_HOME_VALUE,
} from '../support/homeRecordAddConstants';
import { receiptFollowUpAction } from '../support/receiptFollowUps';
import { MATERIAL_CATEGORY_LABELS } from './materialSpecs.handler';
import { ROOM_ADD_MESSAGE } from './homeRecordWrites.handler';
import { MaterialSpecService } from '../../materialSpec.service';
import { PlantCarePlannerService } from '../../plantCarePlanner.service';
import { assertProjectComplianceApplicable } from '../../projectCompliance/context';
import { analyticsEmitter, AnalyticsEvent, AnalyticsFeature, AnalyticsModule } from '../../analytics';
import { recordToolLifecycleEvents } from '../../analytics/toolLifecycle';
import { materialSpecCompletionEvent } from '../../analytics/materialSpecLifecycle';

const CONFIRMATION_MINUTES = 30;
const materialSpecService = new MaterialSpecService();
const plantPlanner = new PlantCarePlannerService();

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const permissionBlocked = (id: string, title: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED',
  blocks: [{ type: 'SUMMARY', id, title, body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  suggestions: [],
});
const notRoutable = (id: string, title: string, body: string, reasonCode: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id, title, body, tone: 'DEFAULT', actions: [] }], suggestions: [],
});
const refreshFailed = (id: string, what: string) => ({
  type: 'LIMITATION' as const, id, severity: 'CAUTION' as const, title: 'Saved; view could not refresh',
  body: `${what} was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.`,
});

async function rooms(propertyId: string): Promise<Array<{ id: string; name: string }>> {
  return prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
}
/** The version a form is bound to: the property and its rooms (the room choices the form offers), so a form opened before a room changed is out of date. */
async function roomsVersion(prefix: string, propertyId: string): Promise<string> {
  return sha(`${prefix}:${propertyId}:${(await rooms(propertyId)).map((room) => room.id).join(',')}`);
}
const CATEGORY_OPTIONS = Object.entries(MATERIAL_CATEGORY_LABELS).map(([value, label]) => ({ label, value }));
const roomName = (list: Array<{ id: string; name: string }>, id: string | null): string => (id ? list.find((room) => room.id === id)?.name ?? 'A room' : 'Whole home');

// ── Material spec ────────────────────────────────────────────────────────────────────────────────────────────────

export const materialSpecContextVersion = (propertyId: string) => roomsVersion('material-spec-add', propertyId);
type MaterialInput = ReturnType<typeof MaterialSpecAddInputSchema.parse>;

function materialCaptureRequest(contextVersion: string, roomList: Array<{ id: string; name: string }>, entered?: Partial<MaterialInput>): AskCaptureRequest {
  const text = (key: string, label: string, max: number, helpText?: string) => ({ key, label, ...(helpText ? { helpText } : {}), required: false, inputSchema: { type: 'SHORT_TEXT' as const, maxLength: max } });
  return {
    requirementId: 'material-spec-inputs', captureKey: MATERIAL_SPEC_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Record a material', question: 'What material would you like to record for this home?',
    helpText: 'Only the type and a name are required. A colour code, finish or supplier makes it easy to match later. You will review everything before it is saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'category', label: 'Type', required: true, inputSchema: { type: 'SINGLE_SELECT', options: CATEGORY_OPTIONS } },
      { key: 'label', label: 'Name', helpText: 'For example: Kitchen wall paint', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      { key: 'roomId', label: 'Where', helpText: 'Optional: choose a room, or leave it for the whole home.', required: false,
        inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Whole home', value: WHOLE_HOME_VALUE }, ...roomList.map((room) => ({ label: room.name, value: room.id }))] } },
      text('manufacturer', 'Brand', 120), text('productName', 'Product', 120), text('colorCode', 'Colour code', 60), text('finish', 'Finish', 60), text('supplier', 'Supplier', 120),
      text('notes', 'Notes', 1000),
    ] },
    currentAnswer: Object.fromEntries(Object.entries({ category: entered?.category, label: entered?.label, roomId: entered ? entered.roomId ?? WHOLE_HOME_VALUE : undefined,
      manufacturer: entered?.manufacturer, productName: entered?.productName, colorCode: entered?.colorCode, finish: entered?.finish, supplier: entered?.supplier, notes: entered?.notes })
      .filter(([, value]) => value !== undefined && value !== null)),
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this record; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function materialSpecAddResult(userId: string, propertyId: string, supplied: MaterialInput | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked('material-spec-permission', 'A contributor or owner can record a material');
  const roomList = await rooms(propertyId);
  const contextVersion = sha(`material-spec-add:${propertyId}:${roomList.map((room) => room.id).join(',')}`);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_INPUT_REQUIRED', contextVersion, parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'material-spec-input', title: 'Record a material', body: 'Nothing has been recorded yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [materialCaptureRequest(contextVersion, roomList)], suggestions: [],
    };
  }
  if (supplied.roomId && !roomList.some((room) => room.id === supplied.roomId)) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_ROOM_UNAVAILABLE', contextVersion, parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'material-spec-room-missing', title: 'That room is no longer in this home', body: 'Choose another room or the whole home. Nothing has been recorded.', tone: 'CAUTION', actions: [] }],
      captureRequests: [materialCaptureRequest(contextVersion, roomList, { ...supplied, roomId: null })], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const detail = (label: string, value: string | null) => (value ? [{ label, value }] : []);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MATERIAL_SPEC_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { materialSpecAdd: supplied, materialSpecContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'material-spec-review', title: 'Review this material', body: 'You entered these details. Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `material-spec-${sha(`${propertyId}:${supplied.category}:${supplied.label}`).slice(0, 12)}-1`, version: 1,
      title: `Record "${supplied.label}"?`,
      description: 'This adds the material to the home\'s Material Specs, the same record the Material Specs page edits, so you can match it later.',
      fields: [
        { label: 'Name', value: supplied.label }, { label: 'Type', value: MATERIAL_CATEGORY_LABELS[supplied.category] ?? supplied.category }, { label: 'Where', value: roomName(roomList, supplied.roomId) },
        ...detail('Brand', supplied.manufacturer), ...detail('Product', supplied.productName), ...detail('Colour code', supplied.colorCode), ...detail('Finish', supplied.finish),
        ...detail('Supplier', supplied.supplier), ...detail('Notes', supplied.notes),
      ],
      editableFields: [], confirmLabel: 'Record material', consentText: 'I authorize adding this material to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [materialCaptureRequest(contextVersion, roomList, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('material-spec.add', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'MATERIAL_SPEC_ADD' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === MATERIAL_SPEC_ADD_MESSAGE;
  if (declared) return materialSpecAddResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  return notRoutable('material-spec-not-routable', 'Use the Add a material button', 'A material is recorded from the Add a material button on the Material Specs answer. Nothing has changed.', 'ASK_MATERIAL_SPEC_NOT_DIRECTLY_ROUTABLE');
});

async function confirmMaterialSpecAdd(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = MaterialSpecAddInputSchema.safeParse(parameters.materialSpecAdd);
  if (!candidate.success) throw Object.assign(new Error('The material to record is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId;
  // createSpec has no idempotency key: a same-named material created since this execution began is this execution's own earlier write (a lease-reclaim retry).
  const earlier = await prisma.materialSpec.findFirst({ where: { propertyId, label: input.label, category: input.category, createdAt: { gte: execution.createdAt } }, select: { id: true, label: true } });
  let specId: string;
  let alreadyRecorded = false;
  if (earlier) {
    specId = earlier.id; alreadyRecorded = true;
  } else {
    // The same checks and effects the traditional POST controller adds around the service call.
    await assertProjectComplianceApplicable(propertyId, userId, 'MATERIAL_SPECS', {}, 'materialSpecifications');
    const { spec } = await materialSpecService.createSpec(propertyId, {
      scopeLevel: input.roomId ? 'ROOM' : 'PROPERTY', category: input.category, label: input.label, roomId: input.roomId,
      manufacturer: input.manufacturer, productName: input.productName, colorCode: input.colorCode, finish: input.finish, supplier: input.supplier, notes: input.notes,
    }, userId);
    specId = (spec as { id: string }).id;
    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED, userId, propertyId, moduleKey: AnalyticsModule.PROJECT_MGMT, featureKey: AnalyticsFeature.MATERIAL_SPEC,
      metadataJson: { actionType: 'create_spec', specId, category: input.category, via: 'ask' },
    });
    void recordToolLifecycleEvents({ userId, propertyId, events: [materialSpecCompletionEvent(spec as never, 'create')] }).catch(() => undefined);
  }
  const roomList = await rooms(propertyId);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'MATERIAL_SPEC_RECORDED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `material-spec-recorded-${specId}`, title: alreadyRecorded ? 'Material already recorded' : 'Material recorded', status: 'COMPLETED',
      description: 'The material is now part of this home\'s Material Specs.',
      details: [{ label: 'Name', value: input.label }, { label: 'Type', value: MATERIAL_CATEGORY_LABELS[input.category] ?? input.category }, { label: 'Where', value: roomName(roomList, input.roomId) }],
      actions: [receiptFollowUpAction('MATERIAL_SPECS')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailed(`material-spec-refresh-failed-${specId}`, 'The material'));
  return { result, artifactType: 'MATERIAL_SPEC', artifactId: specId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('material-spec.add', confirmMaterialSpecAdd);

// ── Indoor plant ─────────────────────────────────────────────────────────────────────────────────────────────────

export const homePlantContextVersion = (propertyId: string) => roomsVersion('home-plant-add', propertyId);
type PlantInput = ReturnType<typeof HomePlantAddInputSchema.parse>;

function plantCaptureRequest(contextVersion: string, roomList: Array<{ id: string; name: string }>, entered?: Partial<PlantInput>): AskCaptureRequest {
  return {
    requirementId: 'home-plant-inputs', captureKey: HOME_PLANT_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Add a plant', question: 'Which plant would you like to add, and where does it live?',
    helpText: 'Indoor plants only for now. The name and the room are required. You will review everything before it is added.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'name', label: 'Plant', helpText: 'For example: Monstera', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      { key: 'roomId', label: 'Room', required: true, inputSchema: { type: 'SINGLE_SELECT', options: roomList.map((room) => ({ label: room.name, value: room.id })) } },
      { key: 'nickname', label: 'Nickname', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
      { key: 'notes', label: 'Notes', required: false, inputSchema: { type: 'SHORT_TEXT', maxLength: 1000 } },
    ] },
    currentAnswer: Object.fromEntries(Object.entries({ name: entered?.name, roomId: entered?.roomId, nickname: entered?.nickname, notes: entered?.notes }).filter(([, value]) => value !== undefined && value !== null)),
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this plant; nothing is added until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

export async function homePlantAddResult(userId: string, propertyId: string, supplied: PlantInput | undefined, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked('home-plant-permission', 'A contributor or owner can add a plant');
  const roomList = await rooms(propertyId);
  if (!roomList.length) {
    return {
      status: 'NOT_APPLICABLE', reasonCode: 'HOME_PLANT_NEEDS_A_ROOM',
      blocks: [{
        type: 'SUMMARY', id: 'home-plant-needs-room', title: 'Add a room first', body: 'An indoor plant lives in a room, and this home has none recorded yet. Add one, then add the plant. Nothing has been added.', tone: 'CAUTION',
        actions: [{ id: HOME_PLANT_ADD_ROOM_ACTION_ID, label: 'Add a room', interactionType: 'START_WORKFLOW' as const, message: ROOM_ADD_MESSAGE, operationId: 'ROOM_CREATE', style: 'PRIMARY' as const }],
      }],
      suggestions: [],
    };
  }
  const contextVersion = sha(`home-plant-add:${propertyId}:${roomList.map((room) => room.id).join(',')}`);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOME_PLANT_INPUT_REQUIRED', contextVersion, parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'home-plant-input', title: 'Add a plant', body: 'Nothing has been added yet. Enter the plant and its room, then review it before it is added.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [plantCaptureRequest(contextVersion, roomList)], suggestions: [],
    };
  }
  if (!roomList.some((room) => room.id === supplied.roomId)) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'HOME_PLANT_ROOM_UNAVAILABLE', contextVersion, parameters: { sourceExecutionId },
      blocks: [{ type: 'SUMMARY', id: 'home-plant-room-missing', title: 'That room is no longer in this home', body: 'Choose another room. Nothing has been added.', tone: 'CAUTION', actions: [] }],
      captureRequests: [plantCaptureRequest(contextVersion, roomList, { ...supplied, roomId: undefined })], suggestions: [],
    };
  }
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'HOME_PLANT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { homePlantAdd: supplied, homePlantContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'home-plant-review', title: 'Review this plant', body: 'You entered these details. Nothing is added until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `home-plant-${sha(`${propertyId}:${supplied.roomId}:${supplied.name}`).slice(0, 12)}-1`, version: 1,
      title: `Add "${supplied.name}" to ${roomName(roomList, supplied.roomId)}?`,
      description: 'This adds an indoor plant to the home, the same record Plant Advisor keeps, so its care can follow the forecast.',
      fields: [
        { label: 'Plant', value: supplied.name }, { label: 'Room', value: roomName(roomList, supplied.roomId) },
        ...(supplied.nickname ? [{ label: 'Nickname', value: supplied.nickname }] : []), ...(supplied.notes ? [{ label: 'Notes', value: supplied.notes }] : []),
      ],
      editableFields: [], confirmLabel: 'Add plant', consentText: 'I authorize adding this plant to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [plantCaptureRequest(contextVersion, roomList, supplied)],
    suggestions: [],
  };
}

registerCapabilityHandler('home-plant.add', async (envelope) => {
  const declared = envelope.launchContext?.operationId === 'HOME_PLANT_ADD' && envelope.launchContext.surface !== 'ASK_REFRESH' && envelope.message === HOME_PLANT_ADD_MESSAGE;
  if (declared) return homePlantAddResult(envelope.userId, envelope.propertyId!, undefined, envelope.launchContext?.sourceExecutionId ?? null);
  return notRoutable('home-plant-not-routable', 'Use the Add a plant button', 'A plant is added from the Add a plant button on the plant care answer. Nothing has changed.', 'ASK_HOME_PLANT_NOT_DIRECTLY_ROUTABLE');
});

async function confirmHomePlantAdd(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const candidate = HomePlantAddInputSchema.safeParse(parameters.homePlantAdd);
  if (!candidate.success) throw Object.assign(new Error('The plant to add is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const input = candidate.data;
  const propertyId = execution.propertyId;
  const room = await prisma.inventoryRoom.findFirst({ where: { id: input.roomId, propertyId }, select: { id: true, name: true } });
  if (!room) throw Object.assign(new Error('That room is no longer in this home. Nothing was added.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  // createPlant has no idempotency key: a same-named plant in this room created since this execution began is this execution's own earlier write.
  const earlier = await prisma.homePlant.findFirst({ where: { propertyId, roomId: room.id, name: input.name, createdAt: { gte: execution.createdAt } }, select: { id: true } });
  const plant = earlier ?? await plantPlanner.createPlant(propertyId, userId, { name: input.name, nickname: input.nickname, locationType: 'INDOOR', roomId: room.id, notes: input.notes });
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'HOME_PLANT_ADDED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `home-plant-added-${plant.id}`, title: earlier ? 'Plant already added' : 'Plant added', status: 'COMPLETED',
      description: 'The plant is now part of this home, and its care follows the forecast.',
      details: [{ label: 'Plant', value: input.name }, { label: 'Room', value: room.name }],
      actions: [receiptFollowUpAction('PLANT_CARE')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailed(`home-plant-refresh-failed-${plant.id}`, 'The plant'));
  return { result, artifactType: 'HOME_PLANT', artifactId: plant.id, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('home-plant.add', confirmHomePlantAdd);
