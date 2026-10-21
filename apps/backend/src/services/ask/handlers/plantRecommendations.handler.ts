import { createHash } from 'node:crypto';
import { HouseholdRole, PlantGoalType, PlantLightLevel, PlantMaintenanceLevel } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { AskCaptureRequest, AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import type { AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { RoomPlantRecommendationInputSchema } from '../support/commandInputs';
import { PLANT_RECOMMENDATION_ACTIONS, PLANT_RECOMMENDATIONS_CAPTURE_KEY, PLANT_RECOMMENDATIONS_MESSAGE } from '../support/plantRecommendationConstants';
import { RoomPlantAdvisorService } from '../../roomPlantAdvisor.service';

const advisor = new RoomPlantAdvisorService();
const CONFIRMATION_MINUTES = 30;
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const labels = (value: string) => value.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export async function plantRecommendationContextVersion(propertyId: string): Promise<string> {
  const [rooms, profiles] = await Promise.all([
    prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true } }),
    prisma.roomPlantProfile.findMany({ where: { propertyId }, orderBy: { updatedAt: 'asc' }, select: { id: true, roomId: true, updatedAt: true } }),
  ]);
  return sha(JSON.stringify({ rooms: rooms.map((room) => room.id), profiles: profiles.map((profile) => [profile.id, profile.roomId, profile.updatedAt.toISOString()]) }));
}

async function roomChoices(propertyId: string) {
  return prisma.inventoryRoom.findMany({ where: { propertyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } });
}

function captureRequest(contextVersion: string, rooms: Array<{ id: string; name: string }>, entered?: ReturnType<typeof RoomPlantRecommendationInputSchema.parse>): AskCaptureRequest {
  return {
    requirementId: 'room-plant-recommendation-inputs', captureKey: PLANT_RECOMMENDATIONS_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', presentation: 'FORM',
    title: 'Find plants for a room', question: 'Choose the room and the growing conditions you want recommendations for.',
    helpText: 'Light level is required because Plant Advisor does not guess it. Care effort, pets and goals refine the fit.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'roomId', label: 'Room', required: true, inputSchema: { type: 'SINGLE_SELECT', options: rooms.map((room) => ({ label: room.name, value: room.id })) } },
      { key: 'lightLevel', label: 'Light level', required: true, inputSchema: { type: 'SINGLE_SELECT', options: Object.values(PlantLightLevel).map((value) => ({ label: labels(value), value })) } },
      { key: 'maintenancePreference', label: 'Care effort (optional)', required: false, inputSchema: { type: 'SINGLE_SELECT', options: Object.values(PlantMaintenanceLevel).map((value) => ({ label: labels(value), value })) } },
      { key: 'hasPets', label: 'Can pets access this room?', helpText: 'Choose Unsure if you cannot confidently rule out pet access.', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No', unknownLabel: 'Unsure' } },
      { key: 'goals', label: 'Goals (optional)', helpText: 'Choose any that matter to you.', required: false, inputSchema: { type: 'MULTI_SELECT', options: Object.values(PlantGoalType).map((value) => ({ label: labels(value), value })), maxItems: 5 } },
      { key: 'notes', label: 'Placement notes (optional)', helpText: 'For example, an AC vent, a narrow shelf or limited floor space.', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 1000 } },
    ] },
    currentAnswer: entered ?? { goals: [] }, allowNotSure: false, sensitivity: 'STANDARD',
    destinationLabel: 'You’ll review these preferences before Cozy updates this room’s recommendations', confirmationText: null,
    expectedContextVersion: contextVersion,
  };
}

function recommendationActions(status: string) {
  const make = (key: keyof typeof PLANT_RECOMMENDATION_ACTIONS, style: 'PRIMARY' | 'SECONDARY' = 'SECONDARY') => {
    const action = PLANT_RECOMMENDATION_ACTIONS[key];
    return { ...action, style, interactionType: 'MUTATE_RECORD' as const, operationId: 'ROOM_PLANT_RECOMMENDATIONS' };
  };
  return [make('ADD_TO_HOME', 'PRIMARY'), ...(status === 'SAVED' ? [] : [make('SAVE')]), ...(status === 'DISMISSED' ? [] : [make('DISMISS')])];
}

type PlantRecommendation = Awaited<ReturnType<RoomPlantAdvisorService['getRoomAdvisorState']>>['recommendations'][number];
type PlantProfile = Awaited<ReturnType<RoomPlantAdvisorService['getRoomAdvisorState']>>['profile'];

function fitPresentation(confidence: number) {
  if (confidence >= 0.8) return { label: 'Best match', tone: 'POSITIVE' as const, primary: true };
  if (confidence >= 0.6) return { label: 'Good match', tone: 'POSITIVE' as const, primary: true };
  if (confidence >= 0.4) return { label: 'Possible with tradeoffs', tone: 'CAUTION' as const, primary: false };
  return { label: 'Weak match', tone: 'CAUTION' as const, primary: false };
}

function petSafety(rec: PlantRecommendation) {
  if (rec.isPetSafe || rec.toxicityLevel === 'PET_SAFE') return { value: 'Pet-safe', tone: 'POSITIVE' as const };
  if (rec.toxicityLevel === 'MILDLY_TOXIC') return { value: 'Mild toxicity risk', tone: 'CAUTION' as const };
  if (rec.toxicityLevel === 'TOXIC') return { value: 'Not pet-safe', tone: 'CRITICAL' as const };
  return { value: 'Pet safety unverified', tone: 'CAUTION' as const };
}

function recommendationItem(rec: PlantRecommendation, canChange: boolean) {
  const fit = fitPresentation(rec.confidence);
  const safety = petSafety(rec);
  const genericNearFitWarning = 'Works, but not ideal under current room inputs.';
  const warnings = rec.warningFlags
    .filter((warning) => warning !== genericNearFitWarning || rec.warningFlags.length === 1)
    .slice(0, 4);
  return {
    id: rec.id, entityType: 'PLANT_RECOMMENDATION', title: `${rec.rank}. ${rec.plantName}`,
    description: rec.shortDescription,
    condition: rec.scientificName,
    status: rec.status,
    badgeLabel: fit.label,
    tone: fit.tone,
    meta: [`${Math.round(rec.confidence * 100)}% fit`, `${labels(rec.confidenceBand)} confidence`],
    attributes: [
      { label: 'Light', value: labels(rec.lightLevel) },
      { label: 'Care', value: labels(rec.maintenanceLevel) },
      { label: 'Pet safety', value: safety.value, tone: safety.tone },
    ],
    highlights: rec.reason.fitSignals.slice(0, 3),
    warnings,
    guidance: [
      ...(rec.careSummary ? [{ label: 'Care', value: rec.careSummary, kind: 'CARE' as const }] : []),
      ...(rec.placementTip ? [{ label: 'Best placement', value: rec.placementTip, kind: 'PLACEMENT' as const }] : []),
    ],
    actions: canChange ? recommendationActions(rec.status) : undefined,
  };
}

export function recommendationResult(room: { roomId: string; name: string }, recommendations: Awaited<ReturnType<RoomPlantAdvisorService['getRoomAdvisorState']>>['recommendations'], canChange: boolean, profile: PlantProfile = null): AskOperationResult {
  const primary = recommendations.filter((rec) => fitPresentation(rec.confidence).primary);
  const alternatives = recommendations.filter((rec) => !fitPresentation(rec.confidence).primary);
  const profileSummary = profile
    ? [room.name, profile.lightLevel ? `${labels(profile.lightLevel)} light` : null, profile.maintenancePreference ? `${labels(profile.maintenancePreference)} care` : 'Any care effort', profile.hasPets === true ? 'Pets have access' : profile.hasPets === false ? 'No pet access' : 'Pet access unsure', ...(profile.goals.length ? [profile.goals.map(labels).join(', ')] : [])].filter(Boolean).join(' · ')
    : null;
  const sections: Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>['sections'] = [
    ...(primary.length ? [{ id: 'best-matches', title: 'Best matches', count: primary.length, initialVisibleCount: Math.min(3, primary.length), items: primary.map((rec) => recommendationItem(rec, canChange)) }] : []),
    ...(alternatives.length ? [{ id: 'other-possibilities', title: 'Other possibilities', caption: 'These options have meaningful tradeoffs. Review the warnings before choosing one.', count: alternatives.length, items: alternatives.map((rec) => recommendationItem(rec, canChange)) }] : []),
  ];
  return {
    status: 'ANSWERED', reasonCode: recommendations.length ? 'ROOM_PLANT_RECOMMENDATIONS_READY' : 'ROOM_PLANT_RECOMMENDATIONS_EMPTY',
    blocks: [
      { type: 'SUMMARY', id: 'plant-recommendation-summary', title: recommendations.length ? `${recommendations.length} plants recommended for ${room.name}` : `No plant matches for ${room.name}`, body: recommendations.length ? 'Recommendations use this room’s recorded light, care preference, pet setting and goals.' : 'The current room preferences did not produce a safe fit. Change the preferences and try again.', tone: recommendations.length ? 'POSITIVE' : 'CAUTION', actions: [] },
      ...(recommendations.length ? [{ type: 'GROUPED_LIST' as const, filters: [], id: 'room-plant-recommendations', title: `Recommendations for ${room.name}`, description: profileSummary ?? 'Ranked from the room preferences you reviewed.', sections, actions: [{ id: 'find-plants-again', label: 'Change preferences', interactionType: 'START_WORKFLOW' as const, message: PLANT_RECOMMENDATIONS_MESSAGE, operationId: 'ROOM_PLANT_RECOMMENDATIONS', style: 'SECONDARY' as const }] }] : []),
      { type: 'BOUNDARY', id: 'plant-recommendation-boundary', title: 'Room-fit guidance, not a guarantee', body: 'Confirm the plant’s current toxicity and care information before buying, and keep plants away from children and pets when appropriate.', severity: 'INFO', suggestions: [] },
    ], suggestions: [],
  };
}

export async function roomPlantRecommendationResult(userId: string, propertyId: string, supplied?: ReturnType<typeof RoomPlantRecommendationInputSchema.parse>, sourceExecutionId: string | null = null): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'plant-recommendation-permission', title: 'A contributor or owner can generate plant recommendations', body: 'Your role can view existing home information but cannot replace the room’s generated recommendation set.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const rooms = await roomChoices(propertyId);
  if (!rooms.length) return { status: 'NOT_APPLICABLE', reasonCode: 'PLANT_RECOMMENDATION_ROOM_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'plant-recommendation-no-room', title: 'Add a room first', body: 'Plant Advisor needs a recorded room before it can make room-specific recommendations.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const contextVersion = await plantRecommendationContextVersion(propertyId);
  if (!supplied) return { status: 'NEEDS_CONTEXT', reasonCode: 'ROOM_PLANT_RECOMMENDATION_INPUT_REQUIRED', contextVersion, parameters: { sourceExecutionId }, blocks: [{ type: 'SUMMARY', id: 'plant-recommendation-input', title: 'Find plants that fit a room', body: 'Choose a room and its light conditions. Nothing changes until you review and confirm.', tone: 'DEFAULT', actions: [] }], captureRequests: [captureRequest(contextVersion, rooms)], suggestions: [] };
  const room = rooms.find((candidate) => candidate.id === supplied.roomId);
  if (!room) return { status: 'NEEDS_CONTEXT', reasonCode: 'PLANT_RECOMMENDATION_ROOM_CHANGED', contextVersion, parameters: { sourceExecutionId }, blocks: [{ type: 'SUMMARY', id: 'plant-recommendation-room-missing', title: 'That room is no longer available', body: 'Choose another recorded room. Nothing has changed.', tone: 'CAUTION', actions: [] }], captureRequests: [captureRequest(contextVersion, rooms)], suggestions: [] };
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'ROOM_PLANT_RECOMMENDATION_CONFIRMATION_REQUIRED', contextVersion, parameters: { roomPlantRecommendation: supplied, plantRecommendationContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'plant-recommendation-review', title: `Review ${room.name} preferences`, body: 'Generating will replace the current generated recommendation set for this room profile.', tone: 'CAUTION', actions: [] }], confirmation: { confirmationId: `plant-recommendation-${sha(`${propertyId}:${room.id}:${contextVersion}`).slice(0, 12)}-1`, version: 1, title: `Generate new plant recommendations for ${room.name}?`, description: 'Plant Advisor will save these room preferences and replace the current generated set with newly ranked recommendations.', fields: [{ label: 'Room', value: room.name }, { label: 'Light', value: labels(supplied.lightLevel) }, { label: 'Care effort', value: supplied.maintenancePreference ? labels(supplied.maintenancePreference) : 'No preference' }, { label: 'Pet access', value: supplied.hasPets === true ? 'Yes' : supplied.hasPets === false ? 'No' : 'Unsure' }, { label: 'Goals', value: supplied.goals.length ? supplied.goals.map(labels).join(', ') : 'No preference' }], editableFields: [], confirmLabel: 'Generate recommendations', consentText: 'I authorize saving these room preferences and replacing the generated recommendation set.', expiresAt }, captureRequests: [captureRequest(contextVersion, rooms, supplied)], suggestions: [] };
}

async function actionProposal(userId: string, propertyId: string, recommendationId: string, actionId: string): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'plant-action-permission', title: 'A contributor or owner is required', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const row = await prisma.roomPlantRecommendation.findFirst({ where: { id: recommendationId, propertyId }, include: { plantCatalog: { select: { commonName: true } }, room: { select: { id: true, name: true } } } });
  if (!row) return { status: 'NOT_APPLICABLE', reasonCode: 'PLANT_RECOMMENDATION_NOT_FOUND', blocks: [{ type: 'SUMMARY', id: 'plant-recommendation-missing', title: 'That recommendation is no longer available', body: 'Nothing changed. Generate recommendations again to use the current room profile.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const action = Object.entries(PLANT_RECOMMENDATION_ACTIONS).find(([, value]) => value.id === actionId);
  if (!action) return { status: 'NOT_APPLICABLE', reasonCode: 'PLANT_RECOMMENDATION_ACTION_INVALID', blocks: [{ type: 'SUMMARY', id: 'plant-action-invalid', title: 'That action is not available', body: 'Nothing changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  const [kind, config] = action;
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000).toISOString();
  return { status: 'NEEDS_CONFIRMATION', reasonCode: 'PLANT_RECOMMENDATION_ACTION_CONFIRMATION_REQUIRED', parameters: { plantRecommendationAction: { recommendationId: row.id, roomId: row.room.id, action: kind }, confirmationVersion: 1, confirmationExpiresAt: expiresAt }, blocks: [{ type: 'SUMMARY', id: 'plant-action-review', title: `Review: ${config.label}`, body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }], confirmation: { confirmationId: `plant-action-${sha(`${row.id}:${kind}`).slice(0, 12)}-1`, version: 1, title: `${config.label} ${row.plantCatalog.commonName}?`, description: kind === 'ADD_TO_HOME' ? `This adds the recommended plant to ${row.room.name} and keeps its recommendation lineage.` : `This changes the recommendation’s status for ${row.room.name}.`, fields: [{ label: 'Plant', value: row.plantCatalog.commonName }, { label: 'Room', value: row.room.name }], editableFields: [], confirmLabel: config.label, consentText: `I authorize this change to the shared Plant Advisor record.`, expiresAt }, suggestions: [] };
}

export function resolveRecommendationActionId(message: string, actionId?: string | null): string | null {
  const matchedByMessage = Object.values(PLANT_RECOMMENDATION_ACTIONS).find((action) => action.message === message.trim())?.id ?? null;
  if (actionId && matchedByMessage && actionId !== matchedByMessage) return null;
  return actionId || matchedByMessage;
}

registerCapabilityHandler('plant-advisor.room-recommendations', async (envelope) => {
  const launch = envelope.launchContext;
  if (launch?.entityType === 'PLANT_RECOMMENDATION' && launch.entityId && launch.surface !== 'ASK_REFRESH') {
    const actionId = resolveRecommendationActionId(envelope.message, launch.actionId);
    return actionProposal(envelope.userId, envelope.propertyId!, launch.entityId, actionId ?? '');
  }
  return roomPlantRecommendationResult(envelope.userId, envelope.propertyId!, undefined, launch?.sourceExecutionId ?? null);
});

async function confirmPlantRecommendation(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, parameters, userId } = ctx;
  const action = parameters.plantRecommendationAction as { recommendationId?: string; roomId?: string; action?: string } | undefined;
  if (action?.recommendationId && action.roomId && action.action) {
    let artifactId = action.recommendationId;
    if (action.action === 'SAVE') await advisor.saveRecommendation(execution.propertyId, action.roomId, action.recommendationId);
    else if (action.action === 'DISMISS') await advisor.dismissRecommendation(execution.propertyId, action.roomId, action.recommendationId);
    else if (action.action === 'ADD_TO_HOME') { const added = await advisor.addRecommendationToHome(execution.propertyId, action.roomId, action.recommendationId, userId, {}); artifactId = added.homePlantId; }
    else throw Object.assign(new Error('That recommendation action is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
    const state = await advisor.getRoomAdvisorState(execution.propertyId, action.roomId);
    return { result: { ...recommendationResult({ roomId: state.room.roomId, name: state.room.name }, state.recommendations, true, state.profile), status: 'COMPLETED', reasonCode: 'PLANT_RECOMMENDATION_ACTION_COMPLETED' }, artifactType: action.action === 'ADD_TO_HOME' ? 'HOME_PLANT' : 'ROOM_PLANT_RECOMMENDATION', artifactId };
  }
  const parsed = RoomPlantRecommendationInputSchema.safeParse(parameters.roomPlantRecommendation);
  if (!parsed.success) throw Object.assign(new Error('The room recommendation request is invalid.'), { code: 'ASK_CONFIRMATION_NOT_ACTIVE' });
  const room = await prisma.inventoryRoom.findFirst({ where: { id: parsed.data.roomId, propertyId: execution.propertyId }, select: { id: true, name: true } });
  if (!room) throw Object.assign(new Error('That room is no longer in this home.'), { code: 'ASK_CONTEXT_VERSION_CONFLICT' });
  const generated = await advisor.generateRecommendations(execution.propertyId, room.id, { limit: 8, profile: { detectedRoomType: undefined, lightLevel: parsed.data.lightLevel, maintenancePreference: parsed.data.maintenancePreference, hasPets: parsed.data.hasPets, goals: parsed.data.goals, notes: parsed.data.notes } });
  return { result: { ...recommendationResult({ roomId: room.id, name: room.name }, generated.recommendations, true, generated.profile), status: 'COMPLETED' }, artifactType: 'ROOM_PLANT_RECOMMENDATION_SET', artifactId: room.id };
}
registerConfirmCapabilityHandler('plant-advisor.room-recommendations', confirmPlantRecommendation);
