// ASK_COZY_INLINE_WORKSPACE_FRD §11.3 "Component registry": presentation
// components are registered by validated `AskPresentationBlock['type']`
// here, in one place, instead of each new block type adding another branch
// to a monolithic renderer (the risk §29 names as "renderer becomes
// unmaintainable"). `ASK_BLOCK_RENDERERS` is typed so that TypeScript
// refuses to compile if a member of the `AskPresentationBlock` union is
// left unregistered -- the same drift-proofing convention already used for
// `AskOperationId` in askInteractionCoverageMatrix.ts and for
// `AskItemActionInteractionType` in interactionDispatch.ts.
import { ComparisonStripBlock } from '../ComparisonStripBlock';
import { ActionLink } from './context';
import { CapabilityListBlock } from './CapabilityListBlock';
import {
  AssumptionsBlock,
  BoundaryBlock,
  EmptyStateBlock,
  ErrorStateBlock,
  LimitationBlock,
  MetricRowBlock,
  ProactiveInsightBlock,
  SummaryBlock,
  UnsupportedBlock,
  WorkflowProgressBlock,
} from './CoreBlocks';
import { BoundaryWithDetail } from './BoundaryWithDetail';
import { EvidenceBlock, OutputArtifactsBlock, RelatedRecordsBlock } from './ContextualBlocks';
import type { ReactNode } from 'react';
import type { AskPresentationBlock } from '@/features/ask/types';
import {
  ChangeSummaryList,
  ChangeSummaryBlock,
  DecisionProgressBlock,
  DecisionTraceBlock,
  PreferenceReferenceBlock,
  RecommendationChangeBlock,
  ScenarioComparisonBlock,
  WhyNowBlock,
} from './DecisionBlocks';
import { GroupedListBlock } from './GroupedListBlock';
import { MonitorBlock } from './MonitorBlock';
import { OutcomeSummaryBlock, PriorityListBlock } from './PriorityAndOutcomeBlocks';
import { TableBlock } from './TableBlock';
import { LifespanBlock } from '../patterns/LifespanBlock';
import { ProgressBlock } from '../patterns/ProgressBlock';
import { TaskGuideBlock } from '../TaskGuideBlock';
import { TimelineTrackBlock } from '../patterns/TimelineTrackBlock';
import { TrendChartBlock } from '../patterns/TrendChartBlock';
import { InsightBoardBlock } from '../patterns/InsightBoardBlock';
import { EnvironmentReportBlock } from './EnvironmentReportBlock';
import { PROPERTY_BRIEF_PREVIEW_IDS, PropertyBriefHeader, PropertyBriefLimitation, PropertyBriefsSummaryCard } from '../PropertyBriefPreview';
import type { AskBlockRenderer, AskBlockRendererProps, AskBlockType } from './types';

type AskBlockRendererRegistry = { [T in AskBlockType]: AskBlockRenderer<T> };

export const ASK_BLOCK_RENDERERS: AskBlockRendererRegistry = {
  TASK_GUIDE: TaskGuideBlock,
  SUMMARY: (props) => props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.summary ? <PropertyBriefHeader block={props.block} /> : props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.listSummary ? <PropertyBriefsSummaryCard block={props.block} /> : <SummaryBlock {...props} />,
  PROACTIVE_INSIGHT: ProactiveInsightBlock,
  GROUPED_LIST: GroupedListBlock,
  TABLE: TableBlock,
  CAPABILITY_LIST: CapabilityListBlock,
  EVIDENCE: EvidenceBlock,
  BOUNDARY: (props) => (props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.boundary || props.block.id === PROPERTY_BRIEF_PREVIEW_IDS.listBoundary) ? <PropertyBriefLimitation block={props.block} /> : <BoundaryWithDetail {...props} />,
  MONITOR: MonitorBlock,
  WORKFLOW_PROGRESS: WorkflowProgressBlock,
  OUTPUT_ARTIFACTS: OutputArtifactsBlock,
  RELATED_RECORDS: RelatedRecordsBlock,
  METRIC_ROW: MetricRowBlock,
  TIMELINE: TimelineTrackBlock,
  COMPARISON: ({ block }) => <ComparisonStripBlock block={block} renderAction={(action) => <ActionLink action={action} />} />,
  DECISION_TRACE: DecisionTraceBlock,
  DECISION_PROGRESS: DecisionProgressBlock,
  SCENARIO_COMPARISON: ScenarioComparisonBlock,
  PREFERENCE_REFERENCE: PreferenceReferenceBlock,
  WHY_NOW: WhyNowBlock,
  RECOMMENDATION_CHANGE: RecommendationChangeBlock,
  CHANGE_SUMMARY: ChangeSummaryBlock,
  PRIORITY_LIST: PriorityListBlock,
  OUTCOME_SUMMARY: OutcomeSummaryBlock,
  ASSUMPTIONS: AssumptionsBlock,
  LIMITATION: LimitationBlock,
  EMPTY_STATE: EmptyStateBlock,
  ERROR_STATE: ErrorStateBlock,
  LIFESPAN: LifespanBlock,
  PROGRESS: ProgressBlock,
  TREND_CHART: TrendChartBlock,
  INSIGHT_BOARD: InsightBoardBlock,
  ENVIRONMENT_REPORT: EnvironmentReportBlock,
};

export function BlockView(props: AskBlockRendererProps) {
  const Renderer = ASK_BLOCK_RENDERERS[props.block.type as AskBlockType] as AskBlockRenderer<AskBlockType> | undefined;
  // Belt-and-suspenders beyond the compile-time exhaustiveness above: a
  // real server response is not compile-time-checked, so an unrecognized
  // runtime `type` (older client, newer schema version) still has to fail
  // honestly rather than throw. See UnsupportedBlock in ./CoreBlocks.
  if (!Renderer) return <UnsupportedBlock block={props.block} />;
  return <Renderer {...props} />;
}

const rateValue = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Older/staggered backend deployments may return the governed refinance-rate
 * table without the chart block. The table contains the same dated benchmark
 * series, so recover the visual locally instead of silently degrading to a
 * long table. A server-authored chart always wins because it can include
 * opportunity markers and range actions that the table cannot represent.
 */
export function ensureRefinanceRateHistoryChart(blocks: AskPresentationBlock[]): AskPresentationBlock[] {
  if (blocks.some((block) => block.type === 'TREND_CHART' && block.id === 'refinance-rate-history-chart')) return blocks;
  const tableIndex = blocks.findIndex((block) => block.type === 'TABLE' && block.id === 'refinance-rate-history');
  if (tableIndex < 0) return blocks;
  const table = blocks[tableIndex] as Extract<AskPresentationBlock, { type: 'TABLE' }>;
  const observations = table.rows.flatMap((row) => {
    const thirty = rateValue(row.values.thirty);
    const fifteen = rateValue(row.values.fifteen);
    const date = row.values.date?.trim();
    return date && thirty != null && fifteen != null ? [{ date, thirty, fifteen }] : [];
  });
  if (observations.length < 2) return blocks;

  const plotted = [...observations].sort((a, b) => a.date.localeCompare(b.date));
  const thirtyYearValues = plotted.map(({ thirty }) => thirty);
  const lowIndex = thirtyYearValues.indexOf(Math.min(...thirtyYearValues));
  const highIndex = thirtyYearValues.indexOf(Math.max(...thirtyYearValues));
  const chart: Extract<AskPresentationBlock, { type: 'TREND_CHART' }> = {
    type: 'TREND_CHART',
    id: 'refinance-rate-history-chart',
    title: `Mortgage rates, last ${observations.length} weeks`,
    description: 'Compare weekly 30-year and 15-year benchmark movements.',
    basis: 'Every available weekly observation is plotted from governed national benchmarks, not a lender quote.',
    valueFormat: 'PERCENT',
    scale: 'FIT',
    categories: plotted.map(({ date }) => {
      const [, month = '', day = ''] = date.split('-');
      return `${month}/${day}`;
    }),
    series: [
      { id: 'rate-30', label: '30-year fixed', style: 'SOLID', tone: 'DEFAULT', values: plotted.map(({ thirty }) => thirty) },
      { id: 'rate-15', label: '15-year fixed', style: 'DASHED', tone: 'POSITIVE', values: plotted.map(({ fifteen }) => fifteen) },
    ],
    markers: [],
    ranges: [],
    referenceLines: [],
    highlights: [
      { id: 'rate-30-low', label: `${observations.length}-week low ${plotted[lowIndex].thirty.toFixed(3)}%`, categoryIndex: lowIndex, seriesId: 'rate-30', tone: 'POSITIVE' },
      { id: 'rate-30-high', label: `${observations.length}-week high ${plotted[highIndex].thirty.toFixed(3)}%`, categoryIndex: highIndex, seriesId: 'rate-30', tone: 'CAUTION' },
    ],
    actions: [],
  };
  return [...blocks.slice(0, tableIndex), chart, ...blocks.slice(tableIndex)];
}

/** Groups consecutive change blocks into one compact activity list while
 * preserving the general one-block/one-renderer registry for every other
 * response type. */
export function BlockSequence({
  blocks,
  renderBlock,
}: {
  blocks: AskPresentationBlock[];
  renderBlock: (block: AskPresentationBlock, index: number) => ReactNode;
}) {
  const presentationBlocks = ensureRefinanceRateHistoryChart(blocks);
  const rendered: ReactNode[] = [];
  const reserveFundAnswer = presentationBlocks.some((block) => block.id === 'reserve-fund-overview');
  for (let index = 0; index < presentationBlocks.length;) {
    const block = presentationBlocks[index];
    if (reserveFundAnswer && block.id === 'reserve-allocations') {
      const secondaryStart = index;
      const secondary = presentationBlocks.slice(secondaryStart);
      rendered.push(
        <details key="reserve-plan-details" className="group overflow-hidden rounded-2xl border border-slate-200 bg-white" data-reserve-plan-details="">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 [&::-webkit-details-marker]:hidden">
            <span>Plan details</span>
            <span className="text-xs font-medium text-slate-500 group-open:hidden">Allocations, ledger, sources, and assumptions</span>
            <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Hide details</span>
          </summary>
          <div className="space-y-3 border-t border-slate-100 bg-slate-50/40 p-3">
            {secondary.map((secondaryBlock, offset) => renderBlock(secondaryBlock, secondaryStart + offset))}
          </div>
        </details>,
      );
      break;
    }
    if (block.type !== 'CHANGE_SUMMARY') {
      rendered.push(renderBlock(block, index));
      index += 1;
      continue;
    }
    const changes: Extract<AskPresentationBlock, { type: 'CHANGE_SUMMARY' }>[] = [];
    while (index < presentationBlocks.length && presentationBlocks[index].type === 'CHANGE_SUMMARY') {
      changes.push(presentationBlocks[index] as Extract<AskPresentationBlock, { type: 'CHANGE_SUMMARY' }>);
      index += 1;
    }
    rendered.push(<ChangeSummaryList key={`change-summary-${changes[0].id}`} blocks={changes} />);
  }
  return <>{rendered}</>;
}
