import type { AskDestinationId } from './destinations';
import type { GroupedListPattern } from './displayPatterns';

export type AskPresentationFamily = 'READING' | 'WORKSPACE' | 'COMPACT_COLLECTION' | 'ADAPTIVE_GRID' | 'FOCUSED_PANEL' | 'SPECIALIZED';
export type AskPresentationState = 'LOADING' | 'EMPTY' | 'PARTIAL' | 'SUCCESS' | 'STALE' | 'UNAVAILABLE' | 'ERROR' | 'LONG_CONTENT';

export interface AskPresentationContract {
  id: string;
  version: 1;
  homeownerJob: string;
  family: AskPresentationFamily;
  essentialRegions: readonly string[];
  desktopPriority: readonly string[];
  mobilePriority: readonly string[];
  states: readonly AskPresentationState[];
  acceptance: readonly string[];
}

const ALL_STATES = ['LOADING', 'EMPTY', 'PARTIAL', 'SUCCESS', 'STALE', 'UNAVAILABLE', 'ERROR', 'LONG_CONTENT'] as const;

export const ASK_DESTINATION_PRESENTATION_CONTRACTS: Record<AskDestinationId, AskPresentationContract> = {
  home: { id: 'ask.destination.home', version: 1, homeownerJob: 'Understand what matters now and ask a grounded question.', family: 'WORKSPACE', essentialRegions: ['state', 'composer', 'priorities', 'suggestions'], desktopPriority: ['state', 'composer', 'priorities'], mobilePriority: ['state', 'composer', 'priorities'], states: ALL_STATES, acceptance: ['Useful without a prompt', 'Composer remains reachable', 'No hidden pending-work cap'] },
  work: { id: 'ask.destination.work', version: 1, homeownerJob: 'Find and resume home work that needs attention.', family: 'COMPACT_COLLECTION', essentialRegions: ['status groups', 'work rows', 'resume action'], desktopPriority: ['work rows', 'status', 'action'], mobilePriority: ['status', 'work rows', 'action'], states: ALL_STATES, acceptance: ['Rows remain scannable', 'Primary action stays adjacent on wide screens', 'Every cap has a complete-list path'] },
  record: { id: 'ask.destination.record', version: 1, homeownerJob: 'Browse the selected home’s canonical record.', family: 'WORKSPACE', essentialRegions: ['home identity', 'section index', 'freshness'], desktopPriority: ['section index', 'home identity', 'freshness'], mobilePriority: ['home identity', 'section index', 'freshness'], states: ALL_STATES, acceptance: ['Uses workspace width', 'Zero sections remain useful', 'Provenance remains visible'] },
  saved: { id: 'ask.destination.saved', version: 1, homeownerJob: 'Reopen durable reports, comparisons, and decisions.', family: 'COMPACT_COLLECTION', essentialRegions: ['artifact filters', 'artifact list', 'freshness'], desktopPriority: ['artifact list', 'filters', 'freshness'], mobilePriority: ['filters', 'artifact list', 'freshness'], states: ALL_STATES, acceptance: ['Prior versions remain distinguishable', 'Unavailable sources degrade honestly'] },
  history: { id: 'ask.destination.history', version: 1, homeownerJob: 'Find and manage prior Ask conversations.', family: 'COMPACT_COLLECTION', essentialRegions: ['search', 'scope', 'conversation list', 'session actions'], desktopPriority: ['search', 'conversation list', 'session actions'], mobilePriority: ['search', 'scope', 'conversation list'], states: ALL_STATES, acceptance: ['Conversation management remains keyboard operable', 'History does not substitute for Work'] },
};

export const ASK_SPECIALIZED_PRESENTATION_CONTRACTS: Record<GroupedListPattern, AskPresentationContract> = {
  CHOICE_GRID: { id: 'ask.pattern.choice-grid', version: 1, homeownerJob: 'Choose one bounded, mutually understandable option.', family: 'ADAPTIVE_GRID', essentialRegions: ['choices', 'selection action'], desktopPriority: ['choices'], mobilePriority: ['choices'], states: ALL_STATES, acceptance: ['Logical DOM order', 'Choice labels remain complete'] },
  BUDGET_BREAKDOWN: { id: 'ask.pattern.budget-breakdown', version: 1, homeownerJob: 'Understand totals, drivers, and timing together.', family: 'SPECIALIZED', essentialRegions: ['summary', 'cost mix', 'drivers', 'calculation basis'], desktopPriority: ['summary', 'cost mix', 'drivers'], mobilePriority: ['summary', 'drivers', 'cost mix'], states: ALL_STATES, acceptance: ['Amounts retain labels', 'Charts have text equivalents'] },
  STATUS_ACCORDION: { id: 'ask.pattern.status-accordion', version: 1, homeownerJob: 'Scan status groups and disclose detail selectively.', family: 'COMPACT_COLLECTION', essentialRegions: ['status groups', 'rows', 'actions'], desktopPriority: ['rows', 'status', 'actions'], mobilePriority: ['status', 'rows', 'actions'], states: ALL_STATES, acceptance: ['Collapsed headings expose counts', 'Disclosure state is announced'] },
  SHELVES: { id: 'ask.pattern.shelves', version: 1, homeownerJob: 'Browse visually distinct records and open canonical detail.', family: 'ADAPTIVE_GRID', essentialRegions: ['shelves', 'record identity', 'detail'], desktopPriority: ['shelves', 'detail'], mobilePriority: ['shelves', 'detail'], states: ALL_STATES, acceptance: ['List alternative remains available', 'Cards are reserved for rich records'] },
  DECK: { id: 'ask.pattern.deck', version: 1, homeownerJob: 'Review a bounded decision set one item at a time.', family: 'FOCUSED_PANEL', essentialRegions: ['progress', 'current item', 'decision actions'], desktopPriority: ['current item', 'actions', 'progress'], mobilePriority: ['progress', 'current item', 'actions'], states: ALL_STATES, acceptance: ['All actions work without swiping', 'Decision is reversible until submitted'] },
  ROOM_MAP: { id: 'ask.pattern.room-map', version: 1, homeownerJob: 'Browse rooms by spatial floor grouping.', family: 'SPECIALIZED', essentialRegions: ['floor groups', 'rooms', 'room detail'], desktopPriority: ['floor groups', 'rooms', 'detail'], mobilePriority: ['floor groups', 'rooms', 'detail'], states: ALL_STATES, acceptance: ['List alternative remains available', 'Floor grouping never invents location'] },
};

export type AskSpecializedResultFamily = 'ENVIRONMENT_REPORT' | 'TASK_GUIDE' | 'TIMELINE' | 'COMPARISON' | 'SCENARIO_COMPARISON' | 'PRIORITY_LIST';

export const ASK_SPECIALIZED_RESULT_CONTRACTS: Record<AskSpecializedResultFamily, AskPresentationContract> = {
  ENVIRONMENT_REPORT: { id: 'ask.result.environment-report', version: 1, homeownerJob: 'Understand current environmental conditions, risks, and preparations as one report.', family: 'SPECIALIZED', essentialRegions: ['conditions hero', 'signals', 'alerts', 'forecast', 'preparation'], desktopPriority: ['conditions hero', 'signals', 'alerts', 'forecast'], mobilePriority: ['conditions hero', 'alerts', 'signals', 'preparation'], states: ALL_STATES, acceptance: ['Signals retain text labels', 'Charts retain accessible summaries', 'Unavailable providers remain named'] },
  TASK_GUIDE: { id: 'ask.result.task-guide', version: 1, homeownerJob: 'Complete a guided home task with context and progress.', family: 'FOCUSED_PANEL', essentialRegions: ['progress', 'current step', 'safety context', 'actions'], desktopPriority: ['current step', 'actions', 'progress'], mobilePriority: ['progress', 'current step', 'actions'], states: ALL_STATES, acceptance: ['Current step is announced', 'Safety context precedes consequential actions'] },
  TIMELINE: { id: 'ask.result.timeline', version: 1, homeownerJob: 'Understand ordered home events and open their evidence.', family: 'SPECIALIZED', essentialRegions: ['time scale', 'events', 'event detail'], desktopPriority: ['time scale', 'events', 'detail'], mobilePriority: ['events', 'detail', 'time scale'], states: ALL_STATES, acceptance: ['List alternative remains available', 'Date precision is never invented'] },
  COMPARISON: { id: 'ask.result.comparison', version: 1, homeownerJob: 'Compare bounded alternatives on consistent evidence.', family: 'SPECIALIZED', essentialRegions: ['alternatives', 'comparison dimensions', 'evidence', 'actions'], desktopPriority: ['alternatives', 'dimensions', 'actions'], mobilePriority: ['alternatives', 'leading dimensions', 'actions'], states: ALL_STATES, acceptance: ['Same dimensions label every option', 'Table alternative remains available'] },
  SCENARIO_COMPARISON: { id: 'ask.result.scenario-comparison', version: 1, homeownerJob: 'Understand how explicit assumptions change a recommendation.', family: 'SPECIALIZED', essentialRegions: ['baseline', 'scenario', 'assumptions', 'direction', 'actions'], desktopPriority: ['baseline and scenario', 'direction', 'assumptions'], mobilePriority: ['direction', 'baseline', 'scenario', 'assumptions'], states: ALL_STATES, acceptance: ['Assumptions remain visible', 'Direction is not conveyed by color alone'] },
  PRIORITY_LIST: { id: 'ask.result.priority-list', version: 1, homeownerJob: 'Scan ranked home actions and understand why they matter now.', family: 'COMPACT_COLLECTION', essentialRegions: ['ranked rows', 'priority', 'reason', 'action'], desktopPriority: ['ranked rows', 'reason', 'action'], mobilePriority: ['priority', 'ranked rows', 'action'], states: ALL_STATES, acceptance: ['Ordering remains explicit', 'Unavailable and completed items remain truthful'] },
};

export function validateAskPresentationContracts(contracts: readonly AskPresentationContract[]): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const contract of contracts) {
    if (ids.has(contract.id)) issues.push(`Duplicate presentation contract id: ${contract.id}`);
    ids.add(contract.id);
    if (!contract.homeownerJob.trim()) issues.push(`${contract.id} has no homeowner job`);
    if (contract.essentialRegions.length === 0) issues.push(`${contract.id} has no essential regions`);
    if (contract.desktopPriority.length === 0 || contract.mobilePriority.length === 0) issues.push(`${contract.id} has no responsive priorities`);
    for (const state of ALL_STATES) if (!contract.states.includes(state)) issues.push(`${contract.id} does not declare ${state}`);
    if (contract.acceptance.length === 0) issues.push(`${contract.id} has no acceptance criteria`);
  }
  return issues;
}

export function validateRegisteredAskPresentationContracts(): string[] {
  return validateAskPresentationContracts([
    ...Object.values(ASK_DESTINATION_PRESENTATION_CONTRACTS),
    ...Object.values(ASK_SPECIALIZED_PRESENTATION_CONTRACTS),
    ...Object.values(ASK_SPECIALIZED_RESULT_CONTRACTS),
  ]);
}

const registrationIssues = validateRegisteredAskPresentationContracts();
if (registrationIssues.length > 0) throw new Error(`Invalid Ask presentation contracts:\n${registrationIssues.join('\n')}`);
