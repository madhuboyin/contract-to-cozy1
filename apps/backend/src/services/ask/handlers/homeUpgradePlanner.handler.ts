// Moved out of askOrchestrator.service.ts unchanged (decomposition phase 1, FRD v1.98;
// docs/architecture/ASK_ORCHESTRATOR_DECOMPOSITION_REVIEW.md). The handler registers itself, and the orchestrator
// re-exports the names below so existing imports keep working.
import { prisma } from '../../../lib/prisma';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { readableCode } from '../askFormatting';
import { HomeDigitalTwinScenarioService } from '../../homeDigitalTwinScenario.service';

// Home Upgrade Planner (home-digital-twin) capability-card slice (FRD v1.57): the ninth new operation for a capability
// with none. Reads HomeDigitalTwinScenarioService.listScenarios, the call GET
// /properties/:id/home-digital-twin/scenarios makes, for the property's twin (found the way that route's controller finds
// it, without creating one). The page itself renders the twin read's recentScenarios, which stops at five and carries no
// component or run, so the page labels every group "Whole-home plans" and never shows a calculation in progress; this
// read has both, and all saved (non-archived) options. Grouped and ordered the way the page groups them. Cost, savings
// and payback are shown only when computed, never homeowner-typed, as on the page. Read-only: creating, calculating and
// recording a decision stay on the page.
type UpgradeScenarioView = Awaited<ReturnType<HomeDigitalTwinScenarioService['listScenarios']>>[number];
const UPGRADE_ACTIVE_RUN_WINDOW_MS = 5 * 60 * 1000;
// The page's own labels (HomeDigitalTwinClient).
const UPGRADE_SCENARIO_TYPE_LABELS: Record<string, string> = {
  MAINTAIN_COMPONENT: 'Maintain', REPAIR_COMPONENT: 'Repair', REPLACE_COMPONENT: 'Replace Component', UPGRADE_COMPONENT: 'Upgrade Component',
  WAIT_MONITOR: 'Wait & Monitor', ENERGY_IMPROVEMENT: 'Energy Improvement', RESILIENCE_IMPROVEMENT: 'Resilience Improvement',
  ADD_FEATURE: 'Add Feature', RENOVATION: 'Renovation', REMOVE_FEATURE: 'Remove Feature', CUSTOM: 'Custom',
};
const UPGRADE_SCENARIO_STATUS_LABELS: Record<string, string> = { DRAFT: 'Draft', READY: 'Ready', COMPUTED: 'Results Ready', FAILED: 'Compute Failed', ARCHIVED: 'Archived' };
const UPGRADE_DECISION_LABELS: Record<string, string> = { SELECTED: 'Selected', DEFERRED: 'Deferred', REJECTED: 'Rejected', CLOSED: 'Closed' };
const UPGRADE_COMPONENT_LABELS: Record<string, string> = {
  HVAC: 'HVAC System', WATER_HEATER: 'Water Heater', ROOF: 'Roof', PLUMBING: 'Plumbing', ELECTRICAL: 'Electrical Panel', INSULATION: 'Insulation',
  WINDOWS: 'Windows', SOLAR: 'Solar', APPLIANCE: 'Appliance', FLOORING: 'Flooring', EXTERIOR: 'Exterior', FOUNDATION: 'Foundation', OTHER: 'Other',
};

function upgradeImpactDisplay(scenario: UpgradeScenarioView, impactType: string): string | null {
  const impact = scenario.impacts.find((row) => row.impactType === impactType && !row.isUserSupplied);
  if (!impact) return null;
  const format = (value: number) => (impact.unit === 'USD'
    ? `$${Math.round(value).toLocaleString('en-US')}`
    : impact.unit === 'PERCENT' ? `${value}%` : `${value}${impact.unit ? ` ${impact.unit.toLowerCase()}` : ''}`);
  if (impact.valueLow != null && impact.valueHigh != null && impact.valueLow !== impact.valueHigh) return `${format(impact.valueLow)}–${format(impact.valueHigh)}`;
  if (impact.valueNumeric != null) return format(impact.valueNumeric);
  return impact.valueText ?? null;
}

// IW-PRES-016 (FRD v1.89): a system's two to four saved upgrade options as a comparison strip. The only badge is
// "Selected", the homeowner's own recorded decision. There is no lowest-cost or fastest-payback badge (the figures
// are ranges that overlap) and no leading mark. The upfront cost is declared as an amount only when it is a single
// recorded figure in dollars; bars are drawn only when every option has one.
export function homeUpgradeComparison(
  key: string,
  label: string,
  rows: readonly UpgradeScenarioView[],
  isActiveRun: (scenario: UpgradeScenarioView) => boolean,
): Extract<AskPresentationBlock, { type: 'COMPARISON' }> | null {
  if (rows.length < 2 || rows.length > 4) return null;
  const amountOf = (scenario: UpgradeScenarioView) => {
    const impact = scenario.impacts.find((row) => row.impactType === 'UPFRONT_COST' && !row.isUserSupplied);
    if (!impact || impact.unit !== 'USD' || impact.valueNumeric == null || !Number.isFinite(Number(impact.valueNumeric)) || Number(impact.valueNumeric) < 0) return null;
    if ((impact.valueLow != null && impact.valueLow !== impact.valueNumeric) || (impact.valueHigh != null && impact.valueHigh !== impact.valueNumeric)) return null;
    return { value: Number(impact.valueNumeric), currency: 'USD' };
  };
  return {
    type: 'COMPARISON', id: `home-upgrade-options-${key.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, title: `${label} options`,
    description: 'Saved options for this system, from the Home Upgrade Planner. Costs, savings and payback are planning ranges, not quotes.',
    options: rows.map((scenario) => {
      const cost = upgradeImpactDisplay(scenario, 'UPFRONT_COST');
      const savings = upgradeImpactDisplay(scenario, 'ANNUAL_SAVINGS');
      const payback = upgradeImpactDisplay(scenario, 'PAYBACK_PERIOD');
      const stale = scenario.status === 'COMPUTED' && Boolean(scenario.staleAt);
      const results = isActiveRun(scenario)
        ? (scenario.latestRun?.status === 'RUNNING' ? 'Calculating' : 'Queued')
        : stale ? 'Results out of date' : UPGRADE_SCENARIO_STATUS_LABELS[scenario.status] ?? readableCode(scenario.status);
      const decision = UPGRADE_DECISION_LABELS[scenario.decisionStatus];
      const amount = amountOf(scenario);
      return {
        id: scenario.id, label: scenario.name, summary: UPGRADE_SCENARIO_TYPE_LABELS[scenario.scenarioType] ?? readableCode(scenario.scenarioType),
        ...(scenario.decisionStatus === 'SELECTED'
          ? { badges: [{ label: 'Selected', basis: 'You chose this option in the Home Upgrade Planner.', policyCode: 'UPGRADE_SCENARIO_SELECTED' }] }
          : {}),
        ...(amount ? { amount } : {}),
        attributes: [
          { label: 'Upfront cost', value: cost ?? 'Not calculated yet', tone: 'DEFAULT' as const },
          { label: 'Annual savings', value: savings ?? 'Not calculated yet', tone: 'DEFAULT' as const },
          { label: 'Payback', value: payback ?? 'Not calculated yet', tone: 'DEFAULT' as const },
          { label: 'Results', value: results, tone: stale || scenario.status === 'FAILED' ? 'CAUTION' as const : 'DEFAULT' as const },
          ...(decision && scenario.decisionStatus !== 'SELECTED' ? [{ label: 'Your decision', value: decision, tone: 'DEFAULT' as const }] : []),
        ],
        actions: [],
      };
    }),
    actions: [],
  };
}

export function homeUpgradeScenariosFromView(scenarios: readonly UpgradeScenarioView[] | null, propertyId: string, now = new Date()): AskOperationResult {
  const pageHref = `/dashboard/properties/${encodeURIComponent(propertyId)}/tools/home-digital-twin`;
  const openAction = { id: 'open-home-digital-twin', label: 'Open Home Upgrade Planner', href: pageHref, style: 'PRIMARY' as const };
  const activeRun = (scenario: UpgradeScenarioView) => Boolean(scenario.latestRun
    && (scenario.latestRun.status === 'QUEUED' || scenario.latestRun.status === 'RUNNING')
    && new Date(scenario.latestRun.startedAt).getTime() >= now.getTime() - UPGRADE_ACTIVE_RUN_WINDOW_MS);
  const safetyNotes = [...new Set((scenarios ?? []).map((scenario) => scenario.safetyBoundary).filter((note): note is string => Boolean(note)))];
  const boundary: AskPresentationBlock = {
    type: 'BOUNDARY', id: 'home-upgrade-boundary', title: 'Planning estimates, not quotes',
    body: ['Costs, savings and payback are planning ranges from your home\'s records and typical figures, not contractor quotes. Get quotes before committing.', ...safetyNotes].join(' '),
    severity: 'INFO', suggestions: [],
  };
  if (!scenarios || !scenarios.length) {
    return {
      status: 'ANSWERED', reasonCode: scenarios ? 'HOME_UPGRADE_NO_SCENARIOS' : 'HOME_UPGRADE_NOT_STARTED',
      blocks: [{
        type: 'SUMMARY', id: 'home-upgrade-summary',
        title: scenarios ? 'No saved upgrade options yet' : 'Home Upgrade Planner is not set up yet',
        body: scenarios
          ? 'The Home Upgrade Planner compares repairing, replacing, upgrading or waiting on a home system. Open it to save an option.'
          : 'The Home Upgrade Planner builds a model of your home\'s systems so you can compare repairing, replacing, upgrading or waiting. Open it to set it up.',
        tone: 'DEFAULT', actions: [openAction],
      }, boundary],
      suggestions: ['What maintenance is due?'],
    };
  }
  // Group by component and order groups the way the page does: selected, then in progress, then pinned, then newest.
  const groups = new Map<string, UpgradeScenarioView[]>();
  for (const scenario of scenarios) groups.set(scenario.componentId ?? 'WHOLE_HOME', [...(groups.get(scenario.componentId ?? 'WHOLE_HOME') ?? []), scenario]);
  const ordered = [...groups.entries()].map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const component = sorted.find((row) => row.component)?.component ?? null;
    const priority = (sorted.some((row) => row.decisionStatus === 'SELECTED') ? 4 : 0) + (sorted.some(activeRun) ? 2 : 0) + (sorted.some((row) => row.isPinned) ? 1 : 0);
    return { key, rows: sorted, priority, updatedAt: new Date(sorted[0].updatedAt).getTime(), label: component ? component.label || UPGRADE_COMPONENT_LABELS[component.componentType] || readableCode(component.componentType) : 'Whole-home plans' };
  }).sort((a, b) => (b.priority - a.priority) || (b.updatedAt - a.updatedAt));
  const selected = scenarios.filter((row) => row.decisionStatus === 'SELECTED').length;
  const ready = scenarios.filter((row) => row.status === 'COMPUTED' && !row.staleAt).length;
  const outOfDate = scenarios.filter((row) => row.status === 'COMPUTED' && row.staleAt).length;
  const blocks: AskPresentationBlock[] = [{
    type: 'SUMMARY', id: 'home-upgrade-summary',
    title: `${scenarios.length} saved upgrade option${scenarios.length === 1 ? '' : 's'} across ${ordered.length} ${ordered.length === 1 ? 'system' : 'systems'}`,
    body: [
      `${ready} with results ready${selected ? `, ${selected} selected` : ''}.`,
      outOfDate ? `${outOfDate} ${outOfDate === 1 ? 'has' : 'have'} results that are out of date because the home's records changed; recalculate on the page.` : null,
    ].filter(Boolean).join(' '),
    tone: outOfDate ? 'CAUTION' : 'DEFAULT',
    actions: [openAction],
  }];
  // IW-PRES-016 (FRD v1.89): a system with two to four saved options gets its own comparison strip, in the page's order;
  // the other systems (one option, or five and more) stay in the list below.
  const strips = ordered.map((group) => ({ group, strip: homeUpgradeComparison(group.key, group.label, group.rows, activeRun) }));
  for (const { strip } of strips) if (strip) blocks.push(strip);
  const listed = strips.filter(({ strip }) => !strip).map(({ group }) => group);
  if (listed.length) blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'home-upgrade-options', title: 'Upgrade options by system', description: 'Grouped by home system, as on the page. Open the planner for the full comparison.',
    sections: listed.map((group) => ({
      id: `home-upgrade-${group.key}`, title: group.label, count: group.rows.length,
      items: group.rows.map((scenario) => {
        const cost = upgradeImpactDisplay(scenario, 'UPFRONT_COST');
        const savings = upgradeImpactDisplay(scenario, 'ANNUAL_SAVINGS');
        const payback = upgradeImpactDisplay(scenario, 'PAYBACK_PERIOD');
        return {
          id: scenario.id,
          title: scenario.name,
          description: null,
          meta: [
            UPGRADE_SCENARIO_TYPE_LABELS[scenario.scenarioType] ?? readableCode(scenario.scenarioType),
            ...(UPGRADE_DECISION_LABELS[scenario.decisionStatus] ? [UPGRADE_DECISION_LABELS[scenario.decisionStatus]] : []),
            ...(scenario.isPinned ? ['Pinned'] : []),
            ...(cost ? [`Upfront ${cost}`] : []),
            ...(savings ? [`Savings ${savings} a year`] : []),
            ...(payback ? [`Payback ${payback}`] : []),
          ],
          status: activeRun(scenario)
            ? (scenario.latestRun?.status === 'RUNNING' ? 'Calculating' : 'Queued')
            : scenario.status === 'COMPUTED' && scenario.staleAt ? 'Results out of date' : UPGRADE_SCENARIO_STATUS_LABELS[scenario.status] ?? readableCode(scenario.status),
          href: pageHref,
        };
      }),
    })),
    actions: [],
  });
  blocks.push(boundary);
  return { status: 'ANSWERED', reasonCode: outOfDate ? 'HOME_UPGRADE_RESULTS_STALE' : 'HOME_UPGRADE_SCENARIOS_READY', blocks, suggestions: ['What maintenance is due?'] };
}

async function homeUpgradeScenariosResult(propertyId: string): Promise<AskOperationResult> {
  // The scenarios route's controller looks the twin up the same way; Ask never creates one (that is the page's init).
  const twin = await prisma.homeDigitalTwin.findUnique({ where: { propertyId }, select: { id: true } });
  if (!twin) return homeUpgradeScenariosFromView(null, propertyId);
  return homeUpgradeScenariosFromView(await new HomeDigitalTwinScenarioService().listScenarios(twin.id, {}), propertyId);
}

registerCapabilityHandler('home-digital-twin.scenarios', async (envelope) => homeUpgradeScenariosResult(envelope.propertyId!));
