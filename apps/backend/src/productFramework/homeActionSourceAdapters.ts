import {
  HOME_ACTION_SOURCE_KINDS,
  parseHomeAction,
  type HomeAction,
} from './homeAction.contract';

export type HomeActionSourceKind = typeof HOME_ACTION_SOURCE_KINDS[number];

export type HomeActionSourceInput = Omit<HomeAction, 'source' | 'job'> & {
  sourceEntityId: string;
  sourceVersion: string | null;
  job?: HomeAction['job'];
};

type SourceAdapterDefinition = {
  kind: HomeActionSourceKind;
  defaultJob: HomeAction['job'];
  description: string;
  adapt: (input: HomeActionSourceInput) => HomeAction;
};

const SOURCE_DEFAULT_JOBS: Record<HomeActionSourceKind, HomeAction['job']> = {
  GUIDANCE: 'DECIDE',
  MAINTENANCE: 'STAY_AHEAD',
  INCIDENT: 'MAJOR_MOMENT',
  RECALL: 'STAY_AHEAD',
  COVERAGE: 'DECIDE',
  PERSONALIZATION: 'STAY_AHEAD',
  PROJECT: 'MAJOR_MOMENT',
  SYSTEM: 'STAY_AHEAD',
};

const SOURCE_DESCRIPTIONS: Record<HomeActionSourceKind, string> = {
  GUIDANCE: 'Guidance journeys and decision recommendations.',
  MAINTENANCE: 'Recurring, seasonal, and condition-driven maintenance work.',
  INCIDENT: 'Active damage, emergency, and incident-response work.',
  RECALL: 'Verified product and component recall follow-up.',
  COVERAGE: 'Insurance, warranty, claim, and coverage decisions.',
  PERSONALIZATION: 'Reviewed property-scoped personalization recommendations.',
  PROJECT: 'Project, quote, permit, booking, and major-moment work.',
  SYSTEM: 'System-derived risk, lifecycle, and data-quality actions.',
};

function createAdapter(kind: HomeActionSourceKind): SourceAdapterDefinition {
  const defaultJob = SOURCE_DEFAULT_JOBS[kind];
  return {
    kind,
    defaultJob,
    description: SOURCE_DESCRIPTIONS[kind],
    adapt(input) {
      const { sourceEntityId, sourceVersion, job, ...action } = input;
      return parseHomeAction({
        ...action,
        source: {
          kind,
          entityId: sourceEntityId,
          version: sourceVersion,
        },
        job: job ?? defaultJob,
      });
    },
  };
}

export const HOME_ACTION_SOURCE_ADAPTERS = Object.fromEntries(
  HOME_ACTION_SOURCE_KINDS.map((kind) => [kind, createAdapter(kind)]),
) as Record<HomeActionSourceKind, SourceAdapterDefinition>;

export function adaptHomeActionSource(
  kind: HomeActionSourceKind,
  input: HomeActionSourceInput,
): HomeAction {
  return HOME_ACTION_SOURCE_ADAPTERS[kind].adapt(input);
}

export function assertEveryHomeActionSourceHasAdapter(): void {
  for (const kind of HOME_ACTION_SOURCE_KINDS) {
    if (!HOME_ACTION_SOURCE_ADAPTERS[kind]) {
      throw new Error(`Missing Home Action source adapter for ${kind}`);
    }
  }
}
