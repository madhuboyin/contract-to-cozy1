// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { DoNothingSimulatorService } from '../../doNothingSimulator.service';
import { humanDate } from '../askFormatting';

// Do-Nothing Simulator capability-card slice (FRD v1.68): the nineteenth new operation for a capability with none (the
// v1.47 "needs a product decision" label did not hold: runs and scenarios are stored and no model is called). Reads
// DoNothingSimulatorService.getLatestRun and listScenarios with no filter, the two GETs the page makes on load (the
// latest-run route also builds a financial-context envelope and emits TOOL_USED analytics; Ask does neither). OWNER
// floor: the routes admit any member, but assertPropertyForUser only admits the primary homeowner profile and throws a
// plain Error, which the page turns into a 500; Ask says who can see it. getLatestRun refuses while coverage records
// conflict (also a 500 on the page); Ask says to resolve them first. A stale, failed or low-confidence run is disclosed,
// not presented as current. Reading never runs a simulation: running, saving and editing scenarios stay on the page.
type DoNothingRunView = Extract<Awaited<ReturnType<DoNothingSimulatorService['getLatestRun']>>, { exists: true }>['run'];
type DoNothingScenarioView = Awaited<ReturnType<DoNothingSimulatorService['listScenarios']>>['scenarios'][number];
const doNothingMoney = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
const DO_NOTHING_SEVERITY_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };

export function doNothingSimulationFromView(
  view: { run: DoNothingRunView | null; scenarios: readonly DoNothingScenarioView[] } | 'PRIMARY_OWNER_ONLY' | 'COVERAGE_CONFLICT',
  propertyId: string,
): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/do-nothing`;
  const openAction = { id: 'open-do-nothing-simulator', label: 'Open Do-Nothing Simulator', href: pageHref, style: 'PRIMARY' as const };
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'do-nothing-boundary', title: 'An estimate, not a prediction',
    body: 'The simulation models likely costs and risks from what is recorded for this home. Actual outcomes depend on weather, wear and prices, so treat the ranges as a guide to what to act on first.',
    severity: 'INFO', suggestions: [],
  };
  if (view === 'PRIMARY_OWNER_ONLY') {
    return {
      status: 'BLOCKED', reasonCode: 'DO_NOTHING_PRIMARY_OWNER_ONLY',
      blocks: [{
        type: 'SUMMARY', id: 'do-nothing-summary', title: 'Only the home\'s primary owner can see do-nothing simulations',
        body: 'Do-Nothing Simulator runs and scenarios are kept for the home\'s primary account holder, so they can\'t be shown here.',
        tone: 'CAUTION', actions: [],
      }],
      suggestions: [],
    };
  }
  if (view === 'COVERAGE_CONFLICT') {
    return {
      status: 'BLOCKED', reasonCode: 'DO_NOTHING_COVERAGE_CONFLICT',
      blocks: [{
        type: 'SUMMARY', id: 'do-nothing-summary', title: 'Resolve conflicting coverage records first',
        body: 'Some insurance records for this home disagree with each other, and the simulation depends on them. Once the conflicting coverage is resolved, the latest simulation can be shown.',
        tone: 'CAUTION', actions: [openAction],
      }, boundary],
      suggestions: ['What coverage gaps does my home have?'],
    };
  }
  const { run, scenarios } = view;
  const scenarioItems = scenarios.map((scenario) => ({
    id: scenario.id,
    title: scenario.name,
    description: `${scenario.horizonMonths} months`,
    meta: [
      scenario.inputOverrides.skipMaintenance ? 'Skips maintenance' : null,
      scenario.inputOverrides.skipWarranty ? 'Skips warranty' : null,
      scenario.inputOverrides.riskTolerance ? `${DO_NOTHING_SEVERITY_LABELS[scenario.inputOverrides.riskTolerance] ?? scenario.inputOverrides.riskTolerance} risk tolerance` : null,
    ].filter((value): value is string => Boolean(value)),
    status: 'Saved',
  }));
  if (!run) {
    const blocks: AskPresentationBlock[] = [{
      type: 'SUMMARY', id: 'do-nothing-summary', title: 'No do-nothing simulation run yet',
      body: `The Do-Nothing Simulator estimates what putting off home upkeep could cost over 6 to 36 months.${scenarios.length ? ` ${scenarios.length} saved scenario${scenarios.length === 1 ? ' is' : 's are'} ready to run.` : ''} Open it to run one.`,
      tone: 'DEFAULT', actions: [openAction],
    }];
    if (scenarioItems.length) {
      blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'do-nothing-items', title: 'Saved scenarios', description: 'Open the simulator to run one.', sections: [{ id: 'do-nothing-scenarios', title: 'Saved scenarios', count: scenarioItems.length, items: scenarioItems }], actions: [] });
    }
    blocks.push(boundary);
    return { status: 'ANSWERED', reasonCode: 'DO_NOTHING_NO_RUN', blocks, suggestions: ['What are my monthly ownership costs?'] };
  }
  const scenarioName = run.scenarioId ? scenarios.find((scenario) => scenario.id === run.scenarioId)?.name ?? null : null;
  const low = doNothingMoney(run.expectedCostDeltaCentsMin);
  const high = doNothingMoney(run.expectedCostDeltaCentsMax);
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'do-nothing-summary',
    title: `If upkeep is put off for ${run.horizonMonths} months`,
    body: [
      low && high ? `Estimated extra cost: ${low === high ? low : `${low} to ${high}`}.` : null,
      run.riskScoreDelta != null ? `Risk score rises by ${run.riskScoreDelta}.` : null,
      run.incidentLikelihood ? `Incident likelihood: ${DO_NOTHING_SEVERITY_LABELS[run.incidentLikelihood] ?? run.incidentLikelihood}.` : null,
      `Confidence: ${DO_NOTHING_SEVERITY_LABELS[run.confidence] ?? run.confidence}.`,
      `Run ${humanDate(new Date(run.computedAt))}${scenarioName ? ` for "${scenarioName}"` : ''}.`,
    ].filter(Boolean).join(' '),
    tone: run.incidentLikelihood === 'HIGH' ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  if (run.status !== 'READY') {
    blocks.push({
      type: 'LIMITATION', id: 'do-nothing-status', title: run.status === 'STALE' ? 'This run is out of date' : 'This run did not finish cleanly',
      body: run.status === 'STALE'
        ? 'Something recorded for the home has changed since it ran. Run it again on the Do-Nothing Simulator for current figures.'
        : 'The last simulation ended with an error, so these figures may be incomplete. Run it again on the Do-Nothing Simulator.',
      severity: 'CAUTION',
    });
  } else if (run.confidence === 'LOW') {
    blocks.push({
      type: 'LIMITATION', id: 'do-nothing-status', title: 'Low-data run',
      body: 'Key history was limited, so this run is directional. Adding policy, claims and maintenance history makes it stronger.',
      severity: 'INFO',
    });
  }
  const driverItems = (drivers: readonly { code: string; title: string; detail: string; severity: string }[], prefix: string) => drivers.map((driver, index) => ({
    id: `${prefix}-${index}`, title: driver.title, description: driver.detail, meta: [], status: `${DO_NOTHING_SEVERITY_LABELS[driver.severity] ?? driver.severity} severity`,
  }));
  const sections = [
    { id: 'do-nothing-losses', title: 'Biggest avoidable losses', items: run.outputs.biggestAvoidableLosses.map((loss, index) => {
      const min = doNothingMoney(loss.estCostCentsMin);
      const max = doNothingMoney(loss.estCostCentsMax);
      return { id: `loss-${index}`, title: loss.title, description: loss.detail, meta: min && max ? [min === max ? min : `${min} to ${max}`] : [], status: 'Avoidable' };
    }) },
    { id: 'do-nothing-risks', title: 'Top risk drivers', items: driverItems(run.outputs.topRiskDrivers, 'risk') },
    { id: 'do-nothing-costs', title: 'Top cost drivers', items: driverItems(run.outputs.topCostDrivers, 'cost') },
    { id: 'do-nothing-next', title: 'Suggested next steps', items: run.nextSteps.map((step, index) => ({ id: `step-${index}`, title: step.title, description: step.detail ?? null, meta: [], status: `${DO_NOTHING_SEVERITY_LABELS[step.priority] ?? step.priority} priority` })) },
    { id: 'do-nothing-scenarios', title: 'Saved scenarios', items: scenarioItems },
  ].filter((section) => section.items.length > 0).map((section) => ({ ...section, count: section.items.length }));
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'do-nothing-items', title: 'What drives the estimate', description: 'From the latest run, as on the page. Open the simulator to change the horizon or run a scenario.', sections, actions: [] });
  }
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'DO_NOTHING_READY', blocks, suggestions: ['What are my monthly ownership costs?'] };
}

async function doNothingSimulationResult(propertyId: string, userId: string): Promise<AskOperationResult> {
  const service = new DoNothingSimulatorService();
  try {
    const { scenarios } = await service.listScenarios(propertyId, userId);
    const latest = await service.getLatestRun(propertyId, userId);
    return doNothingSimulationFromView({ run: latest.exists ? latest.run : null, scenarios }, propertyId);
  } catch (error) {
    if ((error as { code?: string })?.code === 'COVERAGE_CONFLICT_REVIEW_REQUIRED') return doNothingSimulationFromView('COVERAGE_CONFLICT', propertyId);
    if (error instanceof Error && error.message === 'Property not found or access denied.') return doNothingSimulationFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('do-nothing-simulator.latest', async (envelope) => doNothingSimulationResult(envelope.propertyId!, envelope.userId));
