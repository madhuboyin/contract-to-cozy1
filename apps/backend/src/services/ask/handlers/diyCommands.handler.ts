// DIY skill profile and project notes inside Ask (register P2 "DIY"; FRD v1.344). Two commands, both declared-action only.
//   DIY_SKILL_PROFILE_COMMAND  the caller's own skill levels (caller-scoped: one profile per user), through DiyService.upsertSkillProfile.
//   DIY_PROJECT_NOTE_COMMAND   a note on a project in planning or in progress (contributor), through DiyService.updateProject.
// Each is behind a review and a confirmation bound to the record it changes.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { diyService } from '../../diy.service';
import {
  DIY_NOTES_MAX, DIY_NOTE_CAPTURE_KEY, DIY_NOTE_MESSAGE, DIY_PROFILE_CAPTURE_KEY, DIY_PROFILE_MESSAGE, DIY_PROJECT_ENTITY_TYPE, DIY_SKILL_AREAS, DIY_SKILL_LEVELS,
  diyLevelLabel, diyProjectTakesNote, parseDiyNoteAnswer, parseDiySkillProfileAnswer,
} from '../support/diyCommand';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToDiy = { id: 'diy-projects-back', label: 'Back to my DIY projects', interactionType: 'START_WORKFLOW' as const, message: 'Show my DIY projects', operationId: 'DIY_PROJECTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'diy-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToDiy] }], suggestions: [],
});
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const consent = 'I authorize this change.';

// ── skill profile ───────────────────────────────────────────────────────────────────────────────────────────────
type Profile = Record<string, unknown> & { assessedAt?: Date | null };
const profileVersion = (userId: string, profile: Profile | null) => sha(`diy-skill-profile:${userId}:${profile?.assessedAt ? new Date(profile.assessedAt).toISOString() : 'none'}`);

function profileCapture(contextVersion: string, profile: Profile | null, entered?: Record<string, unknown>): AskCaptureRequest {
  const seed = Object.fromEntries(DIY_SKILL_AREAS.map(({ key }) => [key, String(entered?.[key] ?? profile?.[key] ?? 'BEGINNER')]));
  return {
    requirementId: 'diy-skill-profile-inputs', captureKey: DIY_PROFILE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: 'How comfortable are you with each kind of project?',
    question: 'Choose a level for every area.', helpText: 'Used when judging whether a project suits you. It is your own profile; nothing is saved until you confirm.',
    inputSchema: {
      type: 'GROUP',
      fields: DIY_SKILL_AREAS.map(({ key, label }) => ({ key, label, required: true, inputSchema: { type: 'SINGLE_SELECT' as const, options: DIY_SKILL_LEVELS.map((l) => ({ label: l.label, value: l.value })) } })),
    } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: seed, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function diySkillProfileResult(userId: string, propertyId: string, launch: { sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const profile = await diyService.getSkillProfile(userId) as Profile | null;
  const contextVersion = profileVersion(userId, profile);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'DIY_SKILL_PROFILE_INPUT_REQUIRED', contextVersion, parameters: { diyProfileLaunch: { sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'diy-skill-profile-input', title: 'Your DIY skill levels', body: profile ? 'These are your levels now. Change any, then review.' : 'You have not set your levels yet. Nothing has been saved.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [profileCapture(contextVersion, profile)], suggestions: [],
    };
  }
  const parsed = parseDiySkillProfileAnswer(supplied);
  if (!parsed.success) return unavailable('DIY_SKILL_PROFILE_INPUT_INVALID', 'Check the levels', 'Choose beginner, intermediate or advanced for every area. Nothing has changed.');
  const changes = DIY_SKILL_AREAS.filter(({ key }) => (profile?.[key] ?? null) !== parsed.data[key]);
  if (profile && changes.length === 0) return unavailable('DIY_SKILL_PROFILE_NO_CHANGE', 'Nothing to change', 'Those are the levels you already have. Nothing has changed.');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_SKILL_PROFILE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { diyProfile: parsed.data, diyProfileContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'diy-skill-profile-review', title: 'Review your skill levels', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `diy-skill-profile-${sha(JSON.stringify(parsed.data)).slice(0, 12)}-1`, version: 1, title: 'Save these skill levels?',
      description: 'This is your own DIY profile. It is used when judging whether a project suits you and changes nothing else.',
      fields: changes.map(({ key, label }) => ({ label, value: `${diyLevelLabel(profile?.[key] as string | undefined)} → ${diyLevelLabel(parsed.data[key])}` })),
      editableFields: [], confirmLabel: 'Save my levels', consentText: consent, expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [profileCapture(contextVersion, profile, parsed.data)], suggestions: [],
  };
}

registerCapabilityHandler('diy-skill-profile.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== DIY_PROFILE_MESSAGE || launch?.operationId !== 'DIY_SKILL_PROFILE_COMMAND' || launch.surface === 'ASK_REFRESH') {
    return unavailable('ASK_DIY_SKILL_PROFILE_NOT_DIRECTLY_ROUTABLE', 'Open your DIY projects first', 'Your skill levels are set from your DIY projects. Nothing has changed.');
  }
  return diySkillProfileResult(envelope.userId, envelope.propertyId!, { sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmDiySkillProfile(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const parsed = parseDiySkillProfileAnswer(parameters.diyProfile);
  if (!parsed.success) throw stale('The levels to save are invalid.');
  const profile = await diyService.getSkillProfile(userId) as Profile | null;
  if (parameters.diyProfileContextVersion !== profileVersion(userId, profile)) throw stale('Your skill levels changed while the confirmation was open. Review them again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  await diyService.upsertSkillProfile(userId, parsed.data);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'DIY_SKILL_PROFILE_SAVED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: 'diy-skill-profile-saved', title: 'Skill levels saved', status: 'COMPLETED', description: 'They are on your own DIY profile.', details: [], actions: [{ ...backToDiy, label: 'See my DIY projects', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  return { result, artifactType: 'DIY_SKILL_PROFILE', artifactId: userId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('diy-skill-profile.command', confirmDiySkillProfile);

// ── project note ────────────────────────────────────────────────────────────────────────────────────────────────
interface ProjectRow { id: string; title: string; status: string; updatedAt: Date; notesJson: unknown }
async function loadProject(propertyId: string, id: string) {
  return (prisma as any).diyProject.findFirst({ where: { id, propertyId }, select: { id: true, title: true, status: true, updatedAt: true, notesJson: true } }) as Promise<ProjectRow | null>;
}
const notesOf = (row: ProjectRow): Array<{ text: string; createdAt: string }> => (Array.isArray(row.notesJson) ? row.notesJson as Array<{ text: string; createdAt: string }> : []);
const noteVersion = (row: ProjectRow) => sha(`diy-note:${row.id}:${row.status}:${row.updatedAt.toISOString()}:${notesOf(row).length}`);

function noteCapture(contextVersion: string, title: string, entered?: Record<string, unknown>): AskCaptureRequest {
  return {
    requirementId: 'diy-project-note-inputs', captureKey: DIY_NOTE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', title: `Add a note to ${title}`, question: 'What do you want to remember?',
    helpText: 'It is added to the project for the household. Nothing is saved until you confirm.',
    inputSchema: { type: 'GROUP', fields: [{ key: 'note', label: 'Note', required: true, inputSchema: { type: 'LONG_TEXT' as const, maxLength: 1000 } }] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: entered ?? {}, allowNotSure: false, sensitivity: 'STANDARD', destinationLabel: 'Used to prepare this note; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function diyProjectNoteResult(userId: string, propertyId: string, launch: { entityId: string; sourceExecutionId: string | null }, supplied?: Record<string, unknown>): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'diy-note-permission', title: 'A contributor or owner can add a note', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [] }], suggestions: [] };
  }
  const project = await loadProject(propertyId, launch.entityId);
  if (!project) return unavailable('DIY_PROJECT_NOT_FOUND', 'That project is no longer available', 'Ask could not find that DIY project. Nothing has changed.');
  if (!diyProjectTakesNote(project.status)) return unavailable('DIY_PROJECT_NOT_OPEN', 'That project is finished', 'Notes are added to projects in planning or in progress. Nothing has changed.');
  if (notesOf(project).length >= DIY_NOTES_MAX) return unavailable('DIY_PROJECT_NOTES_FULL', 'This project has the most notes it can hold', 'Nothing has changed.');
  const contextVersion = noteVersion(project);
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'DIY_PROJECT_NOTE_INPUT_REQUIRED', contextVersion, parameters: { diyNoteLaunch: { entityId: project.id, sourceExecutionId: launch.sourceExecutionId } },
      blocks: [{ type: 'SUMMARY', id: 'diy-note-input', title: project.title, body: 'Nothing has been saved yet; you will review the note first.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [noteCapture(contextVersion, project.title)], suggestions: [],
    };
  }
  const parsed = parseDiyNoteAnswer(supplied);
  if (!parsed.success) return unavailable('DIY_PROJECT_NOTE_INVALID', 'Check the note', 'Write a note of at least three characters. Nothing has changed.');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'DIY_PROJECT_NOTE_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { diyNote: parsed.data, diyNoteCommand: { entityId: project.id }, diyNoteContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'diy-note-review', title: 'Review the note', body: 'Nothing is saved until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `diy-note-${sha(`${project.id}:${parsed.data.note}`).slice(0, 12)}-1`, version: 1, title: `Add this note to ${project.title}?`,
      description: 'It is added to the project’s notes for the household, after the notes already there.',
      fields: [{ label: 'Project', value: project.title }, { label: 'Note', value: parsed.data.note }], editableFields: [], confirmLabel: 'Add note', consentText: consent, expiresAt: expiresAt.toISOString(),
    },
    captureRequests: [noteCapture(contextVersion, project.title, parsed.data)], suggestions: [],
  };
}

registerCapabilityHandler('diy-project-note.command', async (envelope) => {
  const launch = envelope.launchContext;
  if (envelope.message !== DIY_NOTE_MESSAGE || launch?.operationId !== 'DIY_PROJECT_NOTE_COMMAND' || launch.surface === 'ASK_REFRESH'
    || launch.entityType !== DIY_PROJECT_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_DIY_PROJECT_NOTE_NOT_DIRECTLY_ROUTABLE', 'Open your DIY projects first', 'A note is added from a project in your DIY projects. Nothing has changed.');
  }
  return diyProjectNoteResult(envelope.userId, envelope.propertyId!, { entityId: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

async function confirmDiyProjectNote(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.diyNoteCommand as { entityId?: unknown } | undefined;
  const parsed = parseDiyNoteAnswer(parameters.diyNote);
  if (!parsed.success || typeof command?.entityId !== 'string') throw stale('The note to add is invalid.');
  const propertyId = execution.propertyId;
  try {
    const project = await loadProject(propertyId, command.entityId);
    if (!project) throw stale('That project is no longer available.');
    if (parameters.diyNoteContextVersion !== noteVersion(project)) throw stale('This project changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
    if (!diyProjectTakesNote(project.status) || notesOf(project).length >= DIY_NOTES_MAX) throw stale('A note can no longer be added to this project.');
    await diyService.updateProject(project.id, propertyId, { notesJson: [...notesOf(project), { text: parsed.data.note, createdAt: new Date().toISOString() }] });
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'DIY_PROJECT_NOTE_ADDED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `diy-note-added-${command.entityId}`, title: 'Note added', status: 'COMPLETED', description: 'It is on the project’s notes.', details: [], actions: [{ ...backToDiy, label: 'See my DIY projects', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `diy-note-refresh-failed-${command.entityId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The note was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'DIY_PROJECT', artifactId: command.entityId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('diy-project-note.command', confirmDiyProjectNote);
