// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import {
  DEDUCTIBLE_LABELS, DO_NOTHING_PROPERTY_ENTITY_TYPE, DO_NOTHING_SCENARIO_ACTION_IDS, DO_NOTHING_SCENARIO_ENTITY_TYPE, DO_NOTHING_SCENARIO_MESSAGES,
} from '../support/doNothingScenarioCommand';
import { DoNothingSimulatorService } from '../../doNothingSimulator.service';
import { humanDate } from '../askFormatting';
import { DO_NOTHING_RUN_ACTION_ID, DO_NOTHING_RUN_MESSAGE } from '../support/homeToolRunConstants';
import { collectionDescriptor } from '../support/collectionDescriptor';

// Do-Nothing Simulator capability-card slice (FRD v1.68): the nineteenth new operation for a capability with none (the
// v1.47 "needs a product decision" label did not hold: runs and scenarios are stored and no model is called). Reads
// DoNothingSimulatorService.getLatestRun and listScenarios with no filter, the two GETs the page makes on load (the
// latest-run route also builds a financial-context envelope and emits TOOL_USED analytics; Ask does neither). OWNER
// floor: the routes admit any member, but assertPropertyForUser only admits the primary homeowner profile and throws a
// plain Error, which the page turns into a 500; Ask says who can see it. getLatestRun refuses while coverage records
// conflict (also a 500 on the page); Ask says to resolve them first. A stale, failed or low-confidence run is disclosed,
// not presented as current. Reading never runs a simulation. Saving, changing and deleting a scenario are the confirmed DO_NOTHING_SCENARIO_COMMAND (FRD v1.336).
type DoNothingRunView = Extract<Awaited<ReturnType<DoNothingSimulatorService['getLatestRun']>>, { exists: true }>['run'];
type DoNothingScenarioView = Awaited<ReturnType<DoNothingSimulatorService['listScenarios']>>['scenarios'][number];
const doNothingMoney = (cents: number | null | undefined) => (cents == null ? null : `$${Math.round(cents / 100).toLocaleString('en-US')}`);
const DO_NOTHING_SEVERITY_LABELS: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const DO_NOTHING_SECTION_ITEM_LIMIT = 100;
const displayText = (value: unknown): string | null => typeof value === 'string' && value.trim() ? value.trim() : null;

export function doNothingSimulationFromView(
  view: { run: DoNothingRunView | null; scenarios: readonly DoNothingScenarioView[] } | 'PRIMARY_OWNER_ONLY' | 'COVERAGE_CONFLICT',
  propertyId: string,
  canChange = false,
): AskOperationResult {
  // FRD v1.336: saving and changing scenarios is a contributor's step on the primary owner's record.
  const addScenario = canChange ? [{
    id: DO_NOTHING_SCENARIO_ACTION_IDS.CREATE, label: 'Add a scenario', interactionType: 'START_WORKFLOW' as const, message: DO_NOTHING_SCENARIO_MESSAGES.CREATE,
    operationId: 'DO_NOTHING_SCENARIO_COMMAND' as const, entityType: DO_NOTHING_PROPERTY_ENTITY_TYPE, entityId: propertyId, style: 'SECONDARY' as const,
  }] : [];
  // The answer reaches only the home's primary account holder, who can run the simulation from it, inside Ask.
  const runAction = (label: string) => ({ id: DO_NOTHING_RUN_ACTION_ID, label, interactionType: 'START_WORKFLOW' as const, message: DO_NOTHING_RUN_MESSAGE, operationId: 'DO_NOTHING_SIMULATION_RUN', style: 'PRIMARY' as const });
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
        tone: 'CAUTION', actions: [],
      }, boundary],
      suggestions: [],
    };
  }
  const { run, scenarios } = view;
  const scenarioItems = scenarios.slice(0, DO_NOTHING_SECTION_ITEM_LIMIT).map((scenario) => ({
    id: scenario.id,
    title: scenario.name,
    description: `${scenario.horizonMonths} months`,
    meta: [
      scenario.inputOverrides.skipMaintenance ? 'Skips maintenance' : null,
      scenario.inputOverrides.skipWarranty ? 'Skips warranty' : null,
      scenario.inputOverrides.riskTolerance ? `${DO_NOTHING_SEVERITY_LABELS[scenario.inputOverrides.riskTolerance] ?? scenario.inputOverrides.riskTolerance} risk tolerance` : null,
      scenario.inputOverrides.deductibleStrategy && scenario.inputOverrides.deductibleStrategy !== 'UNCHANGED' ? `Deductible: ${DEDUCTIBLE_LABELS[scenario.inputOverrides.deductibleStrategy] ?? scenario.inputOverrides.deductibleStrategy}` : null,
      scenario.inputOverrides.cashBufferCents != null ? `Cash buffer ${doNothingMoney(scenario.inputOverrides.cashBufferCents)}` : null,
    ].filter((value): value is string => Boolean(value)),
    status: 'Saved',
    entityType: DO_NOTHING_SCENARIO_ENTITY_TYPE,
    actions: canChange ? (['EDIT', 'DELETE'] as const).map((kind) => ({
      id: DO_NOTHING_SCENARIO_ACTION_IDS[kind], label: kind === 'EDIT' ? 'Change' : 'Delete', message: DO_NOTHING_SCENARIO_MESSAGES[kind],
      operationId: 'DO_NOTHING_SCENARIO_COMMAND' as const, interactionType: 'MUTATE_RECORD' as const, style: kind === 'EDIT' ? 'SECONDARY' as const : 'QUIET' as const,
    })) : [],
  }));
  if (!run) {
    const blocks: AskPresentationBlock[] = [{
      type: 'SUMMARY', id: 'do-nothing-summary', title: 'No do-nothing simulation run yet',
      body: `The Do-Nothing Simulator estimates what putting off home upkeep could cost over 6 to 36 months.${scenarios.length ? ` ${scenarios.length} scenario${scenarios.length === 1 ? ' is' : 's are'} saved.` : ''} Run one below; nothing runs until you confirm.`,
      tone: 'DEFAULT', actions: [runAction('Run a simulation'), ...addScenario],
    }];
    if (scenarioItems.length) {
      const sections = [{ id: 'do-nothing-scenarios', title: 'Saved scenarios', count: scenarioItems.length, items: scenarioItems }];
      blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'do-nothing-items', title: 'Saved scenarios', description: 'Saved with their assumptions; none has been run yet.', sections, collection: collectionDescriptor({ sourceTotal: scenarioItems.length, fetchedCount: scenarioItems.length, sections, nextPageAvailable: false }), actions: [] });
    }
    blocks.push(boundary);
    return { status: 'ANSWERED', reasonCode: 'DO_NOTHING_NO_RUN', blocks, suggestions: [] };
  }
  const scenarioName = run.scenarioId ? scenarios.find((scenario) => scenario.id === run.scenarioId)?.name ?? null : null;
  const low = doNothingMoney(run.expectedCostDeltaCentsMin);
  const high = doNothingMoney(run.expectedCostDeltaCentsMax);
  const likelihood = run.incidentLikelihood ? DO_NOTHING_SEVERITY_LABELS[run.incidentLikelihood] ?? run.incidentLikelihood : null;
  const confidence = DO_NOTHING_SEVERITY_LABELS[run.confidence] ?? run.confidence;
  const costRange = low && high ? (low === high ? low : `${low} to ${high}`) : null;
  const ranAt = humanDate(new Date(run.computedAt));
  // FRD v1.404: the lead is the service's own summary sentence (the page's result card), with the figures as chips and a key-figures row.
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'do-nothing-summary',
    title: `If upkeep is put off for ${run.horizonMonths} months`,
    body: [
      displayText(run.summary) ?? (costRange ? `Estimated extra cost: ${costRange}.` : 'The simulation finished.'),
      scenarioName ? `Run for \u201C${scenarioName}\u201D.` : null,
    ].filter(Boolean).join(' '),
    tone: run.incidentLikelihood === 'HIGH' ? 'CAUTION' : 'DEFAULT',
    chips: [
      { label: `${confidence} confidence`, tone: run.confidence === 'LOW' ? 'CAUTION' : 'DEFAULT' },
      ...(likelihood ? [{ label: `${likelihood} incident likelihood`, tone: run.incidentLikelihood === 'HIGH' ? 'CAUTION' as const : 'DEFAULT' as const }] : []),
      { label: `${run.horizonMonths}-month horizon`, tone: 'DEFAULT' as const },
      { label: `Run ${ranAt}`, tone: 'DEFAULT' as const },
    ],
    actions: [runAction('Run it again'), ...addScenario],
  }, {
    type: 'METRIC_ROW', id: 'do-nothing-metrics', title: 'Key figures',
    metrics: [
      { label: 'Horizon', value: `${run.horizonMonths} months`, tone: 'DEFAULT' },
      { label: 'Extra cost if delayed', value: costRange ?? 'Not estimated', tone: costRange ? 'CAUTION' : 'DEFAULT' },
      { label: 'Risk score change', value: run.riskScoreDelta == null ? 'Not estimated' : `+${run.riskScoreDelta}`, tone: run.riskScoreDelta ? 'CAUTION' : 'DEFAULT' },
      { label: 'Incident likelihood', value: likelihood ?? 'Not estimated', tone: run.incidentLikelihood === 'HIGH' ? 'CAUTION' : 'DEFAULT' },
      { label: 'Confidence', value: confidence, tone: run.confidence === 'LOW' ? 'CAUTION' : 'DEFAULT' },
    ],
  }];
  if (run.status !== 'READY') {
    blocks.push({
      type: 'LIMITATION', id: 'do-nothing-status', title: run.status === 'STALE' ? 'This run is out of date' : 'This run did not finish cleanly',
      body: run.status === 'STALE'
        ? 'Something recorded for the home has changed since it ran. Run it again for current figures.'
        : 'The last simulation ended with an error, so these figures may be incomplete. Run it again.',
      severity: 'CAUTION',
    });
  } else if (run.confidence === 'LOW') {
    blocks.push({
      type: 'LIMITATION', id: 'do-nothing-status', title: 'Low-data run',
      body: 'Key history was limited, so this run is directional. Adding policy, claims and maintenance history makes it stronger.',
      severity: 'INFO',
    });
  }
  const driverItems = (drivers: readonly { code: string; title: string; detail: string; severity: string }[], prefix: string) => drivers
    .flatMap((driver, index) => {
      const title = displayText(driver?.title);
      if (!title) return [];
      return [{ id: `${prefix}-${index}`, title, description: displayText(driver.detail), meta: [], status: `${DO_NOTHING_SEVERITY_LABELS[driver.severity] ?? displayText(driver.severity) ?? 'Unknown'} severity` }];
    })
    .slice(0, DO_NOTHING_SECTION_ITEM_LIMIT);
  const sections = [
    { id: 'do-nothing-losses', title: 'Biggest avoidable losses', items: run.outputs.biggestAvoidableLosses.flatMap((loss, index) => {
      const title = displayText(loss?.title);
      if (!title) return [];
      const min = doNothingMoney(loss.estCostCentsMin);
      const max = doNothingMoney(loss.estCostCentsMax);
      return [{ id: `loss-${index}`, title, description: displayText(loss.detail), meta: min && max ? [min === max ? min : `${min} to ${max}`] : [], status: 'Avoidable' }];
    }).slice(0, DO_NOTHING_SECTION_ITEM_LIMIT) },
    { id: 'do-nothing-risks', title: 'Top risk drivers', items: driverItems(run.outputs.topRiskDrivers, 'risk') },
    { id: 'do-nothing-costs', title: 'Top cost drivers', items: driverItems(run.outputs.topCostDrivers, 'cost') },
    { id: 'do-nothing-next', title: 'Suggested next steps', items: run.nextSteps.flatMap((step, index) => {
      const title = displayText(step?.title);
      if (!title) return [];
      return [{ id: `step-${index}`, title, description: displayText(step.detail), meta: [], status: `${DO_NOTHING_SEVERITY_LABELS[step.priority] ?? displayText(step.priority) ?? 'Unknown'} priority` }];
    }).slice(0, DO_NOTHING_SECTION_ITEM_LIMIT) },
    { id: 'do-nothing-scenarios', title: 'Saved scenarios', items: scenarioItems },
  ].filter((section) => section.items.length > 0).map((section) => ({ ...section, count: section.items.length }));
  if (sections.length) {
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'do-nothing-items', title: 'What drives the estimate', description: 'From the latest run. Run it again to change the horizon or use a saved scenario.', listDensity: 'DENSE', sections, collection: collectionDescriptor({ sourceTotal: sections.reduce((sum, section) => sum + section.items.length, 0), fetchedCount: sections.reduce((sum, section) => sum + section.items.length, 0), sections, nextPageAvailable: false }), actions: [] });
  }
  // The page's collapsed "Why this changed": each step the model took, with its effect, so the estimate can be checked.
  const traceItems = run.decisionTrace.flatMap((entry, index) => {
    const label = displayText(entry?.label);
    if (!label) return [];
    return [{ id: `trace-${index}`, title: label, description: displayText(entry.detail), meta: [], status: entry.impact === 'POSITIVE' ? 'Lowers the estimate' : entry.impact === 'NEGATIVE' ? 'Raises the estimate' : 'No change' }];
  }).slice(0, DO_NOTHING_SECTION_ITEM_LIMIT);
  if (traceItems.length) {
    const traceSections = [{ id: 'do-nothing-trace-steps', title: 'How the model got here', count: traceItems.length, items: traceItems }];
    blocks.push({ type: 'GROUPED_LIST', filters: [], id: 'do-nothing-trace', title: 'Why this changed', listDensity: 'DENSE', sections: traceSections, collection: collectionDescriptor({ sourceTotal: traceItems.length, fetchedCount: traceItems.length, sections: traceSections, nextPageAvailable: false }), actions: [] });
  }
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: 'DO_NOTHING_READY', blocks, suggestions: [] };
}

async function doNothingSimulationResult(propertyId: string, userId: string, canChange: boolean): Promise<AskOperationResult> {
  const service = new DoNothingSimulatorService();
  try {
    const { scenarios } = await service.listScenarios(propertyId, userId);
    const latest = await service.getLatestRun(propertyId, userId);
    return doNothingSimulationFromView({ run: latest.exists ? latest.run : null, scenarios }, propertyId, canChange);
  } catch (error) {
    if ((error as { code?: string })?.code === 'COVERAGE_CONFLICT_REVIEW_REQUIRED') return doNothingSimulationFromView('COVERAGE_CONFLICT', propertyId);
    if (error instanceof Error && error.message === 'Property not found or access denied.') return doNothingSimulationFromView('PRIMARY_OWNER_ONLY', propertyId);
    throw error;
  }
}

registerCapabilityHandler('do-nothing-simulator.latest', async (envelope, deps) => {
  const access = await (deps.propertyAccess ?? ensurePropertyAccess(envelope.userId, envelope.propertyId!));
  return doNothingSimulationResult(envelope.propertyId!, envelope.userId, access.role !== 'VIEWER');
});
