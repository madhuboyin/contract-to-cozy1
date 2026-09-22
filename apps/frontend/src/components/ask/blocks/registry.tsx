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
  TimelineBlock,
  UnsupportedBlock,
  WorkflowProgressBlock,
} from './CoreBlocks';
import { EvidenceBlock, OutputArtifactsBlock, RelatedRecordsBlock } from './ContextualBlocks';
import {
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
import type { AskBlockRenderer, AskBlockRendererProps, AskBlockType } from './types';

type AskBlockRendererRegistry = { [T in AskBlockType]: AskBlockRenderer<T> };

export const ASK_BLOCK_RENDERERS: AskBlockRendererRegistry = {
  SUMMARY: SummaryBlock,
  PROACTIVE_INSIGHT: ProactiveInsightBlock,
  GROUPED_LIST: GroupedListBlock,
  TABLE: TableBlock,
  CAPABILITY_LIST: CapabilityListBlock,
  EVIDENCE: EvidenceBlock,
  BOUNDARY: BoundaryBlock,
  MONITOR: MonitorBlock,
  WORKFLOW_PROGRESS: WorkflowProgressBlock,
  OUTPUT_ARTIFACTS: OutputArtifactsBlock,
  RELATED_RECORDS: RelatedRecordsBlock,
  METRIC_ROW: MetricRowBlock,
  TIMELINE: TimelineBlock,
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
