// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';
import { PlantCarePlannerService } from '../../plantCarePlanner.service';

// Plant Advisor capability-card slice (FRD v1.55): the seventh new operation for a capability with none. Reads
// PlantCarePlannerService.getOutlook, the same call GET /properties/:id/plant-advisor/care-outlook (the page's Care
// tab) makes, so the weather, air-quality, drought and hardiness lookups are the page's own. Care changes are
// derived from forecast signals, so when a signal source did not answer the answer says so instead of reading an
// empty list as an all-clear. Plant notes are not included. Read-only; the page's room recommendations (generate,
// save, add to home) are separate writes.
type PlantCareOutlookView = Awaited<ReturnType<PlantCarePlannerService['getOutlook']>>;
const PLANT_CARE_PRIORITY_LABELS: Record<string, string> = { NOW: 'Do now', SOON: 'Do soon', ROUTINE: 'Routine', SEASONAL: 'Seasonal' };
const PLANT_SOURCE_LABELS: Record<string, string> = { weather: 'weather forecast', airQuality: 'air quality', drought: 'drought monitor', hardiness: 'hardiness zone' };
const PLANT_OUTDOOR_REASON_LABELS: Record<string, string> = {
  NO_PRIVATE_OUTDOOR_SPACE: 'this home is recorded as having no private outdoor space',
  ASSOCIATION_RESPONSIBLE: 'the association is recorded as responsible for landscaping',
  LANDLORD_RESPONSIBLE: 'the landlord is recorded as responsible for landscaping',
  OUTDOOR_SPACE_UNKNOWN: 'the home does not yet say whether it has private outdoor space',
  OUTDOOR_SPACE_CONFLICT: 'the home\'s records disagree about private outdoor space',
  LANDSCAPING_RESPONSIBILITY_UNKNOWN: 'the home does not yet say who is responsible for landscaping',
  LANDSCAPING_RESPONSIBILITY_CONFLICT: 'the home\'s records disagree about who is responsible for landscaping',
};

export function plantCareOutlookFromView(view: PlantCareOutlookView, propertyId: string): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/plant-advisor`;
  const openAction = { id: 'open-plant-advisor', label: 'Open Plant Advisor', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'plant-care-boundary', title: 'General care guidance, not a plant diagnosis',
    body: 'Care changes come from the forecast and each plant\'s recorded needs. Check the soil and the plant before acting, and follow local watering restrictions.',
    severity: 'INFO', suggestions: [],
  };
  const blocks: AskPresentationBlock[] = [];
  const unavailable = Object.entries(view.sourceStatus)
    .filter(([source, status]) => source !== 'hardiness' && status !== 'OK')
    .map(([source, status]) => ({ source, status }));
  const weatherChecked = view.sourceStatus.weather === 'OK';
  const urgent = view.careRecommendations.filter((rec) => rec.priority === 'NOW' || rec.priority === 'SOON').length
    + view.gardenRecommendations.filter((rec) => rec.priority === 'NOW' || rec.priority === 'SOON').length;

  if (!view.plants.length && !view.zones.length) {
    blocks.push({
      type: 'SUMMARY', id: 'plant-care-summary', title: 'No plants or garden zones tracked yet',
      body: 'Plant Advisor adapts care to the forecast for plants and garden zones you add. Open it to add them or get room plant ideas.',
      tone: 'DEFAULT', actions: [openAction],
    });
  } else {
    const counts = [
      `${view.plants.length} plant${view.plants.length === 1 ? '' : 's'}`,
      ...(view.zones.length ? [`${view.zones.length} garden zone${view.zones.length === 1 ? '' : 's'}`] : []),
    ].join(' and ');
    blocks.push({
      type: 'SUMMARY', id: 'plant-care-summary',
      title: urgent ? `${urgent} plant care change${urgent === 1 ? '' : 's'} to make now or soon` : 'No urgent plant care changes',
      body: [
        `Tracking ${counts}.`,
        view.hardinessZone ? `USDA hardiness zone ${view.hardinessZone}.` : null,
        !view.careRecommendations.length && view.plants.length
          ? (weatherChecked ? 'No weather-driven care changes are recommended for your plants right now.' : 'Weather-driven care changes could not be checked.')
          : null,
      ].filter(Boolean).join(' '),
      tone: urgent || !weatherChecked ? 'CAUTION' : 'DEFAULT',
      actions: [openAction],
    });
  }
  if (unavailable.length) {
    blocks.push({
      type: 'LIMITATION', id: 'plant-care-sources', title: 'Some conditions could not be checked',
      body: `${unavailable.map(({ source, status }) => `${PLANT_SOURCE_LABELS[source] ?? source}${status === 'NO_LOCATION' ? ' (no map location for this home)' : ''}`).join(', ').replace(/^./, (c) => c.toUpperCase())} ${unavailable.length === 1 ? 'was' : 'were'} unavailable, so care changes that depend on ${unavailable.length === 1 ? 'it' : 'them'} are not shown. That does not mean none are needed.`,
      severity: 'CAUTION',
    });
  }
  if (view.applicability.outdoor.status !== 'APPLICABLE') {
    const reason = view.applicability.outdoor.reasonCodes.map((code) => PLANT_OUTDOOR_REASON_LABELS[code] ?? readableCode(code)).join('; ');
    blocks.push({
      type: 'LIMITATION', id: 'plant-care-outdoor', title: 'Outdoor plants and garden zones are not included',
      body: `Only indoor plants are covered because ${reason}.`,
      severity: view.applicability.outdoor.status === 'NOT_APPLICABLE' ? 'INFO' : 'CAUTION',
    });
  }
  const order = ['NOW', 'SOON', 'ROUTINE'];
  const sections = [
    ...order.map((priority) => view.careRecommendations.filter((rec) => rec.priority === priority)).filter((recs) => recs.length).map((recs) => ({
      id: `plant-care-${recs[0].priority.toLowerCase()}`, title: PLANT_CARE_PRIORITY_LABELS[recs[0].priority], count: recs.length,
      items: recs.map((rec) => ({
        id: rec.id,
        title: `${rec.plantName}: ${rec.title}`,
        description: [rec.guidance, rec.placementWarning].filter(Boolean).join(' '),
        meta: [
          rec.locationName,
          ...rec.triggers.map((trigger) => readableCode(trigger)),
          ...(rec.adjustedCheckCadenceDays ? [`check every ${rec.adjustedCheckCadenceDays} days`] : []),
        ],
        status: rec.priority,
        href: pageHref,
      })),
    })),
    ...(view.gardenRecommendations.length ? [{
      id: 'plant-care-garden', title: 'Garden zones', count: view.gardenRecommendations.length,
      items: view.gardenRecommendations.map((rec) => ({
        id: rec.id,
        title: rec.title,
        description: rec.actions.join(' '),
        meta: [PLANT_CARE_PRIORITY_LABELS[rec.priority] ?? readableCode(rec.priority), readableCode(rec.season)],
        status: rec.priority,
        href: pageHref,
      })),
    }] : []),
  ];
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'plant-care-items', title: 'Plant care outlook', description: 'Care changes for your plants and plans for your garden zones, from the current forecast.', sections, actions: [] });
  }
  blocks.push(boundary);
  return {
    status: 'ANSWERED',
    reasonCode: !view.plants.length && !view.zones.length ? 'PLANT_CARE_NOTHING_TRACKED' : unavailable.length ? 'PLANT_CARE_PARTIAL_CONDITIONS' : 'PLANT_CARE_OUTLOOK_READY',
    blocks,
    suggestions: ['What maintenance is due?'],
  };
}

async function plantCareOutlookResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  return plantCareOutlookFromView(await new PlantCarePlannerService().getOutlook(propertyId, userId), propertyId);
}

registerCapabilityHandler('plant-advisor.care-outlook', async (envelope) => plantCareOutlookResult(envelope.propertyId!, envelope.userId));
