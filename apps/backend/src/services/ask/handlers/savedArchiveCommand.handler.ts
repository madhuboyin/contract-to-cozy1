// Archive or restore a saved result in the caller's own Saved list (FRD v1.3). Reached only by the declared row actions. This changes only
// the caller's own list (the artifact stays where its owner keeps it), so the floor is the caller's own account. The write is the Saved
// service's own (setAskSavedArchive), which reauthorizes and rereads the artifact first.
import { createHash } from 'node:crypto';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { resolveAskSavedArtifactForUser, setAskSavedArchive } from '../askSaved.service';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { SAVED_ARCHIVE_ACTION_IDS, SAVED_ARTIFACT_ENTITY_TYPE, savedArchiveKindFromMessage, type SavedArchiveCommandKind } from '../support/workSavedCommands';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const backToSaved = { id: 'saved-back', label: 'Back to my saved results', interactionType: 'START_WORKFLOW' as const, message: 'Show my saved results', operationId: 'SAVED_RESULTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'saved-archive-unavailable', title, body, tone: 'DEFAULT', actions: [backToSaved] }], suggestions: [],
});
const versionOf = (kind: SavedArchiveCommandKind, artifact: { artifactKey: string; archived: { byOwner: boolean; byYou: boolean }; updatedAt: string }) =>
  sha(`saved-archive:${kind}:${artifact.artifactKey}:${artifact.archived.byOwner}:${artifact.archived.byYou}:${artifact.updatedAt}`);

export async function savedArchiveProposal(userId: string, propertyId: string, launch: { kind: SavedArchiveCommandKind; artifactKey: string; sourceExecutionId: string | null }): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  const resolution = await resolveAskSavedArtifactForUser(userId, propertyId, launch.artifactKey);
  if (resolution.outcome !== 'AVAILABLE' || !resolution.artifact) return unavailable('SAVED_ARCHIVE_NOT_AVAILABLE', 'That saved result is no longer available', `${resolution.message} Nothing has changed.`);
  const artifact = resolution.artifact;
  if (artifact.archived.byOwner && !artifact.archived.byYou) return unavailable('SAVED_ARCHIVE_OWNER_ARCHIVED', 'It is archived where it is kept', 'It was archived by its owner, so it cannot be restored from here. Nothing has changed.');
  const archiving = launch.kind === 'ARCHIVE';
  if (archiving === artifact.archived.byYou) {
    return unavailable('SAVED_ARCHIVE_ALREADY', archiving ? 'It is already archived' : 'It is not archived', 'It is already the way you asked for. Nothing has changed.');
  }
  const contextVersion = versionOf(launch.kind, artifact);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `SAVED_${launch.kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { savedArchiveCommand: { kind: launch.kind, artifactKey: artifact.artifactKey }, savedArchiveContextVersion: contextVersion, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'saved-archive-review', title: archiving ? 'Archive this saved result?' : 'Restore this saved result?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `saved-${launch.kind.toLowerCase()}-${sha(contextVersion).slice(0, 12)}-1`, version: 1, title: archiving ? 'Archive this saved result?' : 'Restore this saved result?',
      description: archiving ? 'It moves to your archived list. It stays where it is kept and can be restored at any time; nobody else’s list changes.' : 'It returns to your saved results. Nobody else’s list changes.',
      fields: [{ label: 'Saved result', value: artifact.title.slice(0, 200) }], editableFields: [], confirmLabel: archiving ? 'Archive it' : 'Restore it',
      consentText: 'I authorize this change to my own saved list.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('saved-archive.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = savedArchiveKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'SAVED_ARCHIVE_COMMAND' || launch.surface === 'ASK_REFRESH' || launch.entityType !== SAVED_ARTIFACT_ENTITY_TYPE || !launch.entityId) {
    return unavailable('ASK_SAVED_ARCHIVE_NOT_DIRECTLY_ROUTABLE', 'Open your saved results first', 'A saved result is archived or restored from its row. Nothing has changed.');
  }
  return savedArchiveProposal(envelope.userId, envelope.propertyId!, { kind, artifactKey: launch.entityId, sourceExecutionId: launch.sourceExecutionId ?? null });
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmSavedArchive(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.savedArchiveCommand as { kind?: unknown; artifactKey?: unknown } | undefined;
  const kind = command?.kind;
  if ((kind !== 'ARCHIVE' && kind !== 'RESTORE') || typeof command?.artifactKey !== 'string') throw stale('The change to make is invalid.');
  const resolution = await resolveAskSavedArtifactForUser(userId, execution.propertyId, command.artifactKey);
  if (resolution.outcome !== 'AVAILABLE' || !resolution.artifact) throw stale(resolution.message || 'That saved result is no longer available.');
  if (parameters.savedArchiveContextVersion !== versionOf(kind, resolution.artifact)) throw stale('This saved result changed while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  const done = await setAskSavedArchive(userId, execution.propertyId, command.artifactKey, kind === 'ARCHIVE');
  if (done.outcome !== 'AVAILABLE') throw stale(done.message);
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `SAVED_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `saved-${kind.toLowerCase()}-${command.artifactKey}`, title: kind === 'ARCHIVE' ? 'Archived' : 'Restored', status: 'COMPLETED',
      description: kind === 'ARCHIVE' ? 'It moved to your archived list. It stays where it is kept.' : 'It is back in your saved results.',
      details: [{ label: 'Saved result', value: resolution.artifact.title.slice(0, 200) }], actions: [backToSaved],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: 'saved-archive-refresh-failed', severity: 'CAUTION', title: 'Done; view could not refresh', body: 'The change was made. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'SAVED_ARTIFACT_PREFERENCE', artifactId: command.artifactKey, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('saved-archive.command', confirmSavedArchive);
