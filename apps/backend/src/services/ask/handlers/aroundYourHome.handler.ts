// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { getAroundYourHome } from '../../../propertyIntelligence/aroundYourHome.service';
import { humanDate, readableCode } from '../askFormatting';
import { ensurePropertyAccess } from '../askHandlerSupport';
import {
  NEIGHBORHOOD_COMMAND_ACTION_IDS, NEIGHBORHOOD_COMMAND_MESSAGES, NEIGHBORHOOD_KIND_LABELS, NEIGHBORHOOD_RECORD_ENTITY_TYPE, neighborhoodKindsFor,
} from '../support/neighborhoodInteractionCommand';
import { collectionDescriptor } from '../support/collectionDescriptor';

// Around Your Home capability-card slice (FRD v1.49): the second new operation for a capability with none. Reads
// getAroundYourHome, the same call the page's route makes, in the server's environment as that route does. Read-only.
type AroundYourHomeView = Awaited<ReturnType<typeof getAroundYourHome>>;
const NEIGHBORHOOD_FAMILY_LABELS: Record<string, string> = {
  PLANNING: 'Planning and development', INFRASTRUCTURE: 'Infrastructure', LAND_USE: 'Land use', FLOOD_MAP: 'Flood maps', SCHOOL: 'Schools',
};

export function neighborhoodChangeFeedFromView(view: AroundYourHomeView, propertyId: string, canChange = false): AskOperationResult {
  // The page ranks dismissed and not-relevant items last; Ask counts them rather than listing them.
  const set = (item: AroundYourHomeView['items'][number]) => item.interaction.disposition === 'DISMISSED' || item.interaction.disposition === 'NOT_RELEVANT';
  const active = view.items.filter((item) => !set(item));
  const setAside = view.items.length - active.length;
  const coverageCurrent = view.coverage.state === 'CURRENT' && view.coverage.sources.length > 0;
  const sourceCount = view.coverage.sources.length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'neighborhood-change-summary',
    title: active.length
      ? `${active.length} reviewed local change${active.length === 1 ? '' : 's'} matched this home`
      : sourceCount ? 'The reviewed local-change sources show nothing new matched to this home' : 'Local-change coverage is not available for this location yet',
    body: sourceCount
      ? `From ${sourceCount} reviewed source${sourceCount === 1 ? '' : 's'} (coverage ${readableCode(view.coverage.state)}).${setAside ? ` ${setAside} item${setAside === 1 ? '' : 's'} you dismissed or marked not relevant ${setAside === 1 ? 'is' : 'are'} not listed.` : ''} These are source facts matched to the home's geography, not a judgment of their effect.`
      : 'Around Your Home only reports changes from reviewed local sources. Cozy has not approved a source that covers this location yet; there is nothing you need to configure.',
    tone: 'DEFAULT',
    // Source activation requires provider-contract and geography review by an administrator. Do not imply that a homeowner can configure it.
    actions: [],
  }];
  if (!coverageCurrent) {
    blocks.push({ type: 'LIMITATION', id: 'neighborhood-change-coverage', title: 'Coverage is limited', body: view.coverage.limitations.join(' '), severity: 'CAUTION' });
  }
  if (active.length) {
    const families = [...new Set(active.map((item) => item.source.family))];
    const sections = families.map((family) => {
      const items = active.filter((item) => item.source.family === family);
      return {
        id: `neighborhood-${String(family).toLowerCase()}`, title: NEIGHBORHOOD_FAMILY_LABELS[family] ?? readableCode(family), count: items.length,
        items: items.slice(0, 25).map((item) => ({
          id: item.propertyMatchId,
          title: item.observation.facts.title ?? readableCode(item.observation.observationType),
          description: (item.observation.facts.summary ?? item.observation.facts.description ?? null)?.slice(0, 300) ?? null,
          meta: [
            `Possible relevance: ${readableCode(item.possibleRelevance.relevance)}`,
            item.geography.distanceMiles != null ? `${Number(item.geography.distanceMiles).toFixed(1)} mi away` : `Matched by ${readableCode(item.geography.precision) || 'area'}`,
            item.source.provider,
            ...(humanDate(item.observation.observedAt) ? [`Observed ${humanDate(item.observation.observedAt)}`] : []),
            ...(item.interaction.hasMaterialUpdate ? ['Updated since you last looked'] : []),
            ...(item.interaction.disposition === 'FOLLOWING' ? ['Following'] : []),
          ],
          status: String(item.observation.lifecycleStatus), href: null, entityType: NEIGHBORHOOD_RECORD_ENTITY_TYPE,
          actions: (canChange ? neighborhoodKindsFor(String(item.interaction.disposition)) : []).map((kind) => ({
            id: NEIGHBORHOOD_COMMAND_ACTION_IDS[kind], label: kind === 'FOLLOW' ? 'Follow' : kind === 'DISMISS' ? 'Dismiss' : 'Not relevant', message: NEIGHBORHOOD_COMMAND_MESSAGES[kind],
            operationId: 'NEIGHBORHOOD_INTERACTION_COMMAND' as const, interactionType: 'MUTATE_RECORD' as const, style: kind === 'FOLLOW' ? 'SECONDARY' as const : 'QUIET' as const,
          })),
        })),
      };
    });
    blocks.push({
      type: 'GROUPED_LIST', filters: [], id: 'neighborhood-changes', title: 'Local changes',
      description: 'Grouped by source. Each shows its possible relevance and the geography it matched.',
      sections,
      collection: collectionDescriptor({ sourceTotal: active.length, fetchedCount: active.length, sections, nextPageAvailable: false }),
      actions: [],
    });
  }
  if (sourceCount) {
    blocks.push({
      type: 'EVIDENCE', id: 'neighborhood-change-evidence', title: 'Reviewed sources',
      items: view.coverage.sources.map((entry) => ({
        label: `${NEIGHBORHOOD_FAMILY_LABELS[entry.source.family] ?? readableCode(entry.source.family)} · ${entry.source.provider}`,
        source: `${entry.source.key} (${readableCode(entry.state)})`,
        observedAt: entry.checkedThrough ? new Date(entry.checkedThrough).toISOString() : null,
      })),
    });
  }
  blocks.push({ type: 'BOUNDARY', id: 'neighborhood-change-boundary', title: 'Source facts, not a judgment of effect', body: view.interpretationBoundary, severity: 'INFO', suggestions: [] });
  return {
    status: coverageCurrent ? 'ANSWERED' : 'READY_WITH_LIMITATIONS',
    reasonCode: active.length ? 'NEIGHBORHOOD_CHANGES_FOUND' : sourceCount ? 'NEIGHBORHOOD_NO_NEW_CHANGES' : 'NEIGHBORHOOD_COVERAGE_NOT_CONFIGURED',
    blocks,
    suggestions: [],
  };
}

async function neighborhoodChangeFeedResult(userId: string, propertyId: string, canChange: boolean): Promise<AskOperationResult> {
  return neighborhoodChangeFeedFromView(await getAroundYourHome(propertyId, userId, process.env.NODE_ENV ?? 'development'), propertyId, canChange);
}

registerCapabilityHandler('neighborhood-change.feed', async (envelope, deps) => {
  // CALLER_SCOPED (FRD v1.329): a reading of a change is stored per user, so any member may set their own.
  await (deps.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  return neighborhoodChangeFeedResult(envelope.userId, envelope.propertyId!, true);
});
