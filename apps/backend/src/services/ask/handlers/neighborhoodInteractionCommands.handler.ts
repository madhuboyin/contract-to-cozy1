// Following, dismissing or setting aside a local change inside Ask (register P1 "Neighborhood Change Radar"; FRD v1.326). Reached only by the declared row
// actions on the local-change answer. The write goes through setAroundYourHomeInteraction, the same function the route calls, behind a review card and a
// confirmation. The reading is the caller's own (stored per user and match), so a viewer may set it; it changes nothing for anyone else.
import { createHash } from 'node:crypto';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { registerConfirmCapabilityHandler, type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { getAroundYourHome, setAroundYourHomeInteraction } from '../../../propertyIntelligence/aroundYourHome.service';
import {
  NEIGHBORHOOD_COMMAND_MESSAGES, NEIGHBORHOOD_KIND_LABELS, NEIGHBORHOOD_RECORD_ENTITY_TYPE, neighborhoodCommandKindFromMessage, neighborhoodKindsFor,
  type NeighborhoodCommandKind,
} from '../support/neighborhoodInteractionCommand';

const CONFIRMATION_MINUTES = 30;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const environment = () => process.env.NODE_ENV ?? 'development';

const backToChanges = { id: 'neighborhood-back', label: 'Back to local changes', interactionType: 'START_WORKFLOW' as const, message: 'Show what is changing around my home', operationId: 'NEIGHBORHOOD_CHANGE_FEED' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'neighborhood-command-unavailable', title, body, tone: 'DEFAULT', actions: [backToChanges] }], suggestions: [],
});

type View = Awaited<ReturnType<typeof getAroundYourHome>>;
async function findItem(userId: string, propertyId: string, matchId: string): Promise<View['items'][number] | null> {
  const view = await getAroundYourHome(propertyId, userId, environment());
  return view.items.find((item) => item.propertyMatchId === matchId) ?? null;
}
const itemVersion = (kind: NeighborhoodCommandKind, item: View['items'][number]) =>
  sha(`neighborhood:${kind}:${item.propertyMatchId}:${item.interaction.disposition}:${item.observation.revision ?? ''}`);
const itemTitle = (item: View['items'][number]) => String((item.observation.facts as { title?: unknown }).title ?? item.observation.observationType ?? 'This local change');

export async function neighborhoodCommandResult(userId: string, propertyId: string, kind: NeighborhoodCommandKind, matchId: string, sourceExecutionId: string | null): Promise<AskOperationResult> {
  const item = await findItem(userId, propertyId, matchId);
  if (!item) return unavailable('NEIGHBORHOOD_CHANGE_NOT_FOUND', 'That local change is no longer listed', 'Ask could not find that record for this home. Nothing has changed.');
  if (!neighborhoodKindsFor(String(item.interaction.disposition)).includes(kind)) {
    return unavailable('NEIGHBORHOOD_STEP_NOT_AVAILABLE', 'That is already how it is set', 'Nothing has changed.');
  }
  const label = NEIGHBORHOOD_KIND_LABELS[kind];
  const contextVersion = itemVersion(kind, item);
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: `NEIGHBORHOOD_${kind}_CONFIRMATION_REQUIRED`, contextVersion,
    parameters: { neighborhoodCommand: { kind, entityId: item.propertyMatchId }, neighborhoodContextVersion: contextVersion, sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'neighborhood-command-review', title: itemTitle(item), body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `neighborhood-${kind.toLowerCase()}-${sha(`${propertyId}:${item.propertyMatchId}`).slice(0, 12)}-1`, version: 1, title: label.title, description: label.description,
      fields: [{ label: 'Local change', value: itemTitle(item) }], editableFields: [], confirmLabel: label.confirm,
      consentText: 'I authorize this change to my own view of this record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

registerCapabilityHandler('neighborhood-interaction.command', async (envelope) => {
  const launch = envelope.launchContext;
  const kind = neighborhoodCommandKindFromMessage(envelope.message);
  if (!kind || launch?.operationId !== 'NEIGHBORHOOD_INTERACTION_COMMAND' || launch.surface === 'ASK_REFRESH' || !launch.entityId || launch.entityType !== NEIGHBORHOOD_RECORD_ENTITY_TYPE) {
    return unavailable('ASK_NEIGHBORHOOD_COMMAND_NOT_DIRECTLY_ROUTABLE', 'Open your local changes first', 'A change is followed or set aside from your list. Nothing has changed.');
  }
  return neighborhoodCommandResult(envelope.userId, envelope.propertyId!, kind, launch.entityId, launch.sourceExecutionId ?? null);
});

const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

async function confirmNeighborhoodCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const command = parameters.neighborhoodCommand as { kind?: unknown; entityId?: unknown } | undefined;
  const kind = command?.kind as NeighborhoodCommandKind | undefined;
  if (!kind || !(kind in NEIGHBORHOOD_COMMAND_MESSAGES) || typeof command?.entityId !== 'string') throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const item = await findItem(userId, propertyId, command.entityId);
  if (!item) throw stale('That local change is no longer listed.');
  if (parameters.neighborhoodContextVersion !== itemVersion(kind, item)) throw stale('This change was updated while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  try {
    await setAroundYourHomeInteraction({ propertyId, propertyMatchId: item.propertyMatchId, userId, action: kind });
  } catch (error) {
    if (error instanceof Error && (!(error as { code?: unknown }).code || (error as { statusCode?: unknown }).statusCode)) throw stale(error.message);
    throw error;
  }
  const label = NEIGHBORHOOD_KIND_LABELS[kind];
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `NEIGHBORHOOD_${kind}_COMPLETED`,
    blocks: [{
      type: 'WORKFLOW_PROGRESS', id: `neighborhood-command-${kind.toLowerCase()}-${item.propertyMatchId}`, title: kind === 'FOLLOW' ? 'Following' : 'Set aside', status: 'COMPLETED',
      description: label.receipt, details: [], actions: [{ ...backToChanges, label: 'See local changes', style: 'PRIMARY' as const }],
    }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({
      type: 'LIMITATION', id: `neighborhood-refresh-failed-${item.propertyMatchId}`, severity: 'CAUTION', title: 'Saved; view could not refresh',
      body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.',
    });
  }
  return { result, artifactType: 'PROPERTY_LOCAL_OBSERVATION_STATE', artifactId: item.propertyMatchId, refreshedExecutions: refresh.refreshedExecutions };
}
registerConfirmCapabilityHandler('neighborhood-interaction.command', confirmNeighborhoodCommand);
