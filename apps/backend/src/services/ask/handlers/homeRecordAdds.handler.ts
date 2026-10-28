// Two records added inside Ask (FRD v1.251), replacing the desktop pages that were the only way to start them (owner decision 2026-10-10):
//   - MATERIAL_SPEC_ADD  a material, product or finish used in the home (Material Specs);
//   - HOME_PLANT_ADD     an indoor plant in one of the home's rooms (Plant Advisor).
// Each is reached only by its declared action (no message pattern, no fuzzy retrieval), asks for the details in an inline form, shows a review card,
// and writes only after the homeowner confirms, through the same service the desktop page calls, repeating the side effects its controller adds.
import { confirmMaterialSpecState, materialSpecStateResult } from './materialSpecStateCommands.handler';
import { materialSpecStateKindFromMessage } from '../support/materialSpecStateCommand';
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { HomePlantAddInputSchema, MaterialSpecAddInputSchema, MaterialSpecUpdateInputSchema } from '../support/commandInputs';
import { APIError } from '../../../middleware/error.middleware';
import {
  HOME_PLANT_ADD_MESSAGE, HOME_PLANT_ADD_ROOM_ACTION_ID, HOME_PLANT_CAPTURE_KEY, MATERIAL_SPEC_ADD_MESSAGE, MATERIAL_SPEC_CAPTURE_KEY, WHOLE_HOME_VALUE,
} from '../support/homeRecordAddConstants';
import { receiptFollowUpAction } from '../support/receiptFollowUps';
import { MATERIAL_CATEGORY_LABELS } from './materialSpecs.handler';
import { editorToGroupSchema, type RecordEditorField } from '../recordEditor/recordEditor.contract';
import { isMaterialCategory, MATERIAL_EDIT_SELECT, materialEditorChanges, materialEditorFields, materialEditorPayload, materialEditorSections, materialEditorValues, validateMaterialEditorAnswer, type MaterialEditorRow } from '../support/materialSpecEditor';
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
const roomName = (list: Array<{ id: string; name: string }>, id: string | null): string => (id ? list.find((room) => room.id === id)?.name ?? 'A room' : 'Whole home');

// ── Material spec ────────────────────────────────────────────────────────────────────────────────────────────────

export const materialSpecContextVersion = (propertyId: string) => roomsVersion('material-spec-add', propertyId);
type MaterialInput = ReturnType<typeof MaterialSpecAddInputSchema.parse>;

/** The editor descriptor on a capture request: step one asks only the type, step two the category's own fields. */
function materialEditorRequest(
  contextVersion: string, fields: readonly RecordEditorField[], original: Record<string, string>,
  opts: { step: 'type' | 'details'; entered?: Record<string, string>; errors?: Record<string, string> },
): AskCaptureRequest {
  const sections = materialEditorSections(fields);
  const first = opts.step === 'type';
  return {
    requirementId: 'material-spec-inputs', captureKey: MATERIAL_SPEC_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN',
    title: 'Record a material', question: first ? 'What kind of material is it?' : 'What do you know about this material?',
    helpText: first ? 'Pick the type first; the next step asks only what matters for it.' : 'Only the name is required. You will review everything before it is saved.',
    inputSchema: editorToGroupSchema({ fields, sections }), currentAnswer: opts.entered ?? original,
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this record; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: contextVersion, presentation: 'FORM',
    editor: {
      recordLabel: 'Record a material', mode: 'add', saveLabel: first ? 'Continue' : 'Continue to review',
      sections: sections.map((section) => ({ ...section })),
      fields: fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })),
      original: { ...original }, ...(opts.errors && Object.keys(opts.errors).length ? { errors: opts.errors } : {}),
    },
  };
}

/**
 * `submitted` is the editor's answer: undefined opens step one (the type), `{ category }` alone opens step two for that category, and
 * the full answer is validated against that category's server-owned fields before the review.
 */
export async function materialSpecAddResult(userId: string, propertyId: string, submitted: unknown, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked('material-spec-permission', 'A contributor or owner can record a material');
  const roomList = await rooms(propertyId);
  const contextVersion = sha(`material-spec-add:${propertyId}:${roomList.map((room) => room.id).join(',')}`);
  const input = submitted && typeof submitted === 'object' && !Array.isArray(submitted) ? submitted as Record<string, unknown> : null;
  const category = input && isMaterialCategory(input.category) ? input.category : null;
  const intro = { type: 'SUMMARY' as const, id: 'material-spec-input', title: 'Record a material', body: 'Nothing has been recorded yet. Enter what you know, then review it before it is saved.', tone: 'DEFAULT' as const, actions: [] };
  const typeFields = materialEditorFields(null, roomList, { mode: 'type' });
  if (!input || !category) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_INPUT_REQUIRED', contextVersion, parameters: { sourceExecutionId },
      blocks: [intro],
      captureRequests: [materialEditorRequest(contextVersion, typeFields, { category: '' }, { step: 'type', ...(input ? { errors: { category: 'Choose a type.' } } : {}) })], suggestions: [],
    };
  }
  const fields = materialEditorFields(category, roomList, { mode: 'add' });
  const original: Record<string, string> = { ...Object.fromEntries(fields.map((field) => [field.key, ''])), category };
  if (Object.keys(input).length === 1) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_INPUT_REQUIRED', contextVersion, parameters: { sourceExecutionId },
      blocks: [intro], captureRequests: [materialEditorRequest(contextVersion, fields, original, { step: 'details' })], suggestions: [],
    };
  }
  const { values, errors } = validateMaterialEditorAnswer(fields, original, input);
  if (Object.keys(errors).length) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_INVALID', contextVersion, parameters: { sourceExecutionId },
      blocks: [{ ...intro, id: 'material-spec-invalid', title: 'Check the highlighted fields', body: 'Nothing has been recorded. Fix the highlighted fields, then review again.', tone: 'CAUTION' }],
      captureRequests: [materialEditorRequest(contextVersion, fields, original, { step: 'details', entered: values, errors })], suggestions: [],
    };
  }
  const supplied = MaterialSpecAddInputSchema.parse(values);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  const shown = materialEditorChanges(fields, Object.fromEntries(fields.map((field) => [field.key, ''])), values);
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
        ...shown.filter((change) => !['category', 'label', 'roomId'].includes(change.key)).map((change) => ({ label: change.label, value: change.after })),
      ],
      editableFields: [], confirmLabel: 'Record material', consentText: 'I authorize adding this material to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be adjusted and resubmitted before confirming.
    captureRequests: [materialEditorRequest(contextVersion, fields, original, { step: 'details', entered: values })],
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
      sku: input.sku, surface: input.surface, dimensions: input.dimensions, material: input.material, lotBatch: input.lotBatch, quantityPurchased: input.quantityPurchased, purchaseDate: input.purchaseDate,
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

// ── Edit a material (MATERIAL_SPEC_UPDATE, FRD v1.390) ───────────────────────────────────────────────────────────
// ONE multi-field editor for a recorded material, reached from the declared "Edit material" action (contributors and owners). The category
// is fixed; an installed or verified-installed material keeps the identity fields the canonical service locks. The review lists only the
// changed fields; one MaterialSpecService.updateSpec writes the narrowed payload of those keys.
export const MATERIAL_SPEC_UPDATE_CAPTURE_KEY = 'MATERIAL_SPEC_UPDATE_INPUTS';
const materialVersion = (spec: { id: string; updatedAt: Date }) => sha(`${spec.id}:${spec.updatedAt.toISOString()}`);

async function materialEditContext(propertyId: string, spec: MaterialEditorRow) {
  const roomList = await rooms(propertyId);
  const fields = materialEditorFields(spec.category, roomList, { mode: 'edit', lifecycle: spec.lifecycleStatus });
  // Only the keys this category's editor asks for: the rest of the record is not part of this form.
  const all = materialEditorValues(spec);
  return { roomList, fields, original: Object.fromEntries(fields.map((field) => [field.key, all[field.key] ?? ''])) };
}

function materialUpdateRequest(spec: MaterialEditorRow, fields: readonly RecordEditorField[], original: Record<string, string>, entered?: Record<string, string>, errors?: Record<string, string>): AskCaptureRequest {
  const sections = materialEditorSections(fields);
  return {
    requirementId: `material-spec-update-${spec.id}`, captureKey: MATERIAL_SPEC_UPDATE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'KNOWN',
    title: 'Edit material', question: `What should change on "${spec.label}"?`,
    helpText: 'Change anything below. You will review only what changed before it is saved.',
    inputSchema: editorToGroupSchema({ fields, sections }), currentAnswer: entered ?? original,
    allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null,
    expectedContextVersion: materialVersion(spec), presentation: 'FORM',
    editor: {
      recordLabel: spec.label, sections: sections.map((section) => ({ ...section })),
      fields: fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })),
      original: { ...original }, ...(errors && Object.keys(errors).length ? { errors } : {}),
    },
  };
}

export async function materialSpecUpdateResult(
  userId: string, propertyId: string, message: string, launchContext: { entityId?: string | null; sourceExecutionId?: string | null } | undefined,
  submitted?: { specId: string; answer: unknown },
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return permissionBlocked('material-spec-update-permission', 'A contributor or owner can edit a material');
  const specs = await prisma.materialSpec.findMany({ where: { propertyId }, orderBy: [{ category: 'asc' }, { label: 'asc' }], take: 200, select: MATERIAL_EDIT_SELECT });
  const wantedId = submitted?.specId ?? (launchContext?.entityId && specs.some((spec) => spec.id === launchContext.entityId) ? launchContext.entityId : null);
  const selected = wantedId
    ? specs.find((spec) => spec.id === wantedId) ?? null
    : specs.filter((spec) => message.toLowerCase().includes(spec.label.toLowerCase())).length === 1 ? specs.find((spec) => message.toLowerCase().includes(spec.label.toLowerCase())) ?? null : null;
  if (!selected) {
    return notRoutable('material-spec-update-target', 'Open the material first', 'Use Edit material on a material in the Material Specs answer. Nothing has changed.', 'MATERIAL_SPEC_TARGET_REQUIRED');
  }
  const spec = selected as MaterialEditorRow;
  const contextVersion = materialVersion(spec);
  const sourceExecutionId = launchContext?.sourceExecutionId ?? null;
  const { fields, original } = await materialEditContext(propertyId, spec);
  const intro = { type: 'SUMMARY' as const, id: 'material-spec-update-input', title: `Edit "${spec.label}"`, body: 'Nothing has been saved yet. Change what you need, then review only what changed.', tone: 'DEFAULT' as const, actions: [] };
  if (!submitted) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_UPDATE_INPUT_REQUIRED', contextVersion, parameters: { specId: spec.id, sourceExecutionId },
      blocks: [intro], captureRequests: [materialUpdateRequest(spec, fields, original)], suggestions: [],
    };
  }
  const { values, errors } = validateMaterialEditorAnswer(fields, original, submitted.answer);
  if (Object.keys(errors).length) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_UPDATE_INVALID', contextVersion, parameters: { specId: spec.id, sourceExecutionId },
      blocks: [{ ...intro, id: 'material-spec-update-invalid', title: 'Check the highlighted fields', body: 'Nothing has been saved. Fix the highlighted fields, then review again.', tone: 'CAUTION' }],
      captureRequests: [materialUpdateRequest(spec, fields, original, values, errors)], suggestions: [],
    };
  }
  const changes = materialEditorChanges(fields, original, values);
  if (changes.length === 0) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'MATERIAL_SPEC_UPDATE_NO_CHANGES', contextVersion, parameters: { specId: spec.id, sourceExecutionId },
      blocks: [{ ...intro, id: 'material-spec-update-no-changes', title: 'Nothing has changed', body: 'These details match the recorded material. Change a field to review an update.' }],
      captureRequests: [materialUpdateRequest(spec, fields, original, values)], suggestions: [],
    };
  }
  const input = MaterialSpecUpdateInputSchema.parse({ specId: spec.id, changes: Object.fromEntries(changes.map((change) => [change.key, values[change.key]])) });
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'MATERIAL_SPEC_UPDATE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { specId: spec.id, materialSpecUpdate: input, materialSpecUpdateContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'material-spec-update-review', title: `Review ${changes.length === 1 ? 'this change' : `these ${changes.length} changes`}`, body: 'No material has changed yet. Only what you changed is listed.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `material-spec-update-${spec.id}-1`, version: 1, title: `Save ${changes.length === 1 ? '1 change' : `${changes.length} changes`} to "${spec.label}"?`,
      description: 'This updates the material in the home\'s Material Specs, the same record the Material Specs page edits.',
      fields: [{ label: 'Material', value: spec.label }, ...changes.map((change) => ({ label: change.label, value: `${change.before} \u2192 ${change.after}` }))],
      editableFields: [], confirmLabel: 'Save changes', consentText: 'I authorize these changes to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    // Kept so the entry can be adjusted and resubmitted before confirming.
    captureRequests: [materialUpdateRequest(spec, fields, original, values)],
    suggestions: [],
  };
}

registerCapabilityHandler('material-spec.update', async (envelope) => {
  // Stop using, use again, delete and export (FRD v1.465) share this operation, told apart by their declared messages; only the declared action starts them.
  const stateKind = materialSpecStateKindFromMessage(envelope.message);
  if (stateKind) {
    const launch = envelope.launchContext;
    const declared = launch?.operationId === 'MATERIAL_SPEC_UPDATE' && launch.surface !== 'ASK_REFRESH'
      && (stateKind === 'EXPORT' || (launch.entityType === 'MATERIAL_SPEC' && Boolean(launch.entityId)));
    if (!declared) return notRoutable('material-spec-state-target', 'Open the materials first', 'Use the action on a material in the Material Specs answer. Nothing has changed.', 'MATERIAL_SPEC_TARGET_REQUIRED');
    return materialSpecStateResult(envelope.userId, envelope.propertyId!, stateKind, { entityId: launch?.entityId ?? null, sourceExecutionId: launch?.sourceExecutionId ?? null });
  }
  return materialSpecUpdateResult(envelope.userId, envelope.propertyId!, envelope.message, envelope.launchContext);
});

async function confirmMaterialSpecUpdate(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  if (ctx.parameters.materialSpecState) return confirmMaterialSpecState(ctx);
  const { execution, userId, parameters } = ctx;
  const candidate = MaterialSpecUpdateInputSchema.safeParse(parameters.materialSpecUpdate);
  if (!candidate.success) throw Object.assign(new Error('The material update is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const { specId, changes } = candidate.data;
  const propertyId = execution.propertyId!;
  const current = await prisma.materialSpec.findFirst({ where: { id: specId, propertyId }, select: MATERIAL_EDIT_SELECT });
  if (!current) throw Object.assign(new Error('This material is no longer available. It may have been removed.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const spec = current as MaterialEditorRow;
  const { fields, original } = await materialEditContext(propertyId, spec);
  // A recovery retry of this same execution sees the already-saved values.
  const alreadyApplied = Object.entries(changes).every(([key, value]) => original[key] === value);
  if (!alreadyApplied && parameters.materialSpecUpdateContextVersion !== materialVersion(spec)) {
    throw Object.assign(new Error('This material changed while confirmation was open. Review it and try again.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  }
  // Every rule is re-run against live data at confirm: the locked identity fields, the fixed category and the room choices.
  const { values, errors } = validateMaterialEditorAnswer(fields, original, { ...original, ...changes });
  const firstError = Object.values(errors)[0];
  if (firstError) throw Object.assign(new Error(firstError), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
  const changed = materialEditorChanges(fields, original, values);
  if (!alreadyApplied) {
    try {
      const updated = await materialSpecService.updateSpec(propertyId, specId, materialEditorPayload(Object.keys(changes), values) as never);
      void recordToolLifecycleEvents({ userId, propertyId, events: [materialSpecCompletionEvent(updated as never, 'update')] }).catch(() => undefined);
    } catch (error) {
      if (error instanceof APIError && error.code === 'MATERIAL_AS_BUILT_IDENTITY_IMMUTABLE') throw Object.assign(new Error(error.message), { code: 'ASK_INVALID_CONFIRMATION_EDIT' });
      throw error;
    }
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'MATERIAL_SPEC_UPDATED',
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `material-spec-updated-${specId}`, title: 'Material updated', status: 'COMPLETED',
      description: 'The material was updated in this home\'s Material Specs.',
      details: [{ label: 'Material', value: spec.label }, ...(alreadyApplied ? [{ label: 'Changes', value: 'Already saved' }] : changed.map((change) => ({ label: change.label, value: `${change.before} \u2192 ${change.after}` })))],
      actions: [receiptFollowUpAction('MATERIAL_SPECS')],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) result.blocks.push(refreshFailed(`material-spec-update-refresh-failed-${specId}`, 'The change'));
  return { result, artifactType: 'MATERIAL_SPEC', artifactId: specId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('material-spec.update', confirmMaterialSpecUpdate);

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
