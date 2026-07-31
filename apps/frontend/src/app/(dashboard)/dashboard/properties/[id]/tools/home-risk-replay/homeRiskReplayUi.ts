import type {
  HomeRiskReplayDetail,
  HomeRiskReplayTimelineEvent,
  HomeRiskReplayWindowType,
} from '@/components/features/homeRiskReplay/types';

type ApiErrorLike = {
  message?: string;
  status?: number | string;
  payload?: {
    error?: {
      code?: string;
      message?: string;
    };
  };
};

export type HomeRiskReplayValidationInput = {
  windowType: HomeRiskReplayWindowType;
  windowStart: string;
  windowEnd: string;
};

export type HomeRiskReplayValidationErrors = Partial<
  Record<'windowStart' | 'windowEnd', string>
>;

export type HomeRiskReplayErrorStage = 'open' | 'generate' | 'history' | 'detail';

export type HomeRiskReplayGuardrail = {
  title: string;
  description: string;
  tone: 'info' | 'good';
};

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as ApiErrorLike).payload?.error?.code;
}

function extractStatus(error: unknown): number | string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as ApiErrorLike).status;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

export function buildHomeRiskReplayValidationErrors(
  input: HomeRiskReplayValidationInput
): HomeRiskReplayValidationErrors {
  if (input.windowType !== 'custom_range') return {};

  const errors: HomeRiskReplayValidationErrors = {};

  if (!input.windowStart.trim()) {
    errors.windowStart = 'Choose a start date for the source window.';
  }

  if (!input.windowEnd.trim()) {
    errors.windowEnd = 'Choose an end date for the source window.';
  }

  if (input.windowStart && input.windowEnd && input.windowStart > input.windowEnd) {
    errors.windowStart = 'Start date must be on or before the end date.';
  }

  return errors;
}

export function getHomeRiskReplayUserMessage(
  error: unknown,
  stage: HomeRiskReplayErrorStage
): string {
  const status = extractStatus(error);
  const code = extractErrorCode(error);
  const rawMessage = extractMessage(error).toLowerCase();
  const isNetwork =
    status === 'NETWORK' ||
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout');

  if (
    code === 'PROPERTY_ACCESS_DENIED' ||
    code === 'PROPERTY_NOT_FOUND' ||
    code === 'HOME_RISK_REPLAY_NOT_FOUND' ||
    status === 404
  ) {
    if (stage === 'open') {
      return 'We could not load this property context. Open Past Hazard Exposure from one of your properties and try again.';
    }

    if (stage === 'detail') {
      return 'We could not open that saved legacy result. Return to the current sourced exposure view.';
    }

    return 'We could not find that past hazard information anymore. Try again.';
  }

  if (status === 401 || code === 'AUTH_REQUIRED' || code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
    return 'Your session expired. Refresh the page and try again.';
  }

  if (status === 400 || code === 'VALIDATION_ERROR') {
    if (stage === 'generate') {
      return 'Check the source window details and try again.';
    }
    return 'We could not process that past hazard request. Try again.';
  }

  if (isNetwork) {
    if (stage === 'generate') {
      return 'We could not check reviewed source records right now. Check your connection and try again.';
    }
    if (stage === 'history') {
      return 'We could not load the prior legacy results right now. Try again.';
    }
    if (stage === 'detail') {
      return 'We could not open that past hazard record right now. Try again.';
    }
    return 'We could not load Past Hazard Exposure right now. Try again.';
  }

  if (stage === 'generate') {
    return 'We could not check reviewed source records right now. Please try again in a moment.';
  }
  if (stage === 'history') {
    return 'We could not load prior legacy results right now.';
  }
  if (stage === 'detail') {
    return 'We could not open that past hazard record right now.';
  }

  return 'We could not load Past Hazard Exposure right now.';
}

function isBroadLocationMatch(basis: string | undefined): boolean {
  return basis === 'zip' || basis === 'city' || basis === 'county' || basis === 'state';
}

export function buildHomeRiskReplayGuardrail(
  replay: HomeRiskReplayDetail | null | undefined
): HomeRiskReplayGuardrail | null {
  if (!replay) return null;

  if ((replay.totalEvents ?? 0) === 0) {
    return {
      title: 'No matched events in available records',
      description:
        'No events matched this property in the records currently available for the selected period. Source coverage is not yet comprehensive, so this is not an all-clear or proof that no event occurred.',
      tone: 'info',
    };
  }

  const locationBases = (replay.timelineEvents ?? [])
    .map((event) => event.impactFactorsJson?.locationMatch?.basis)
    .filter((basis): basis is string => typeof basis === 'string' && basis.length > 0);

  if (locationBases.some((basis) => isBroadLocationMatch(basis))) {
    return {
      title: 'Some matches are broader location signals',
      description:
        'Some events are matched from ZIP, city, county, or state-level history. Treat them as relevant context for the home, not proof of direct damage.',
      tone: 'info',
    };
  }

  return {
    title: 'Geographic exposure, not proof of damage',
    description:
      'These historical source records match the property geography. They do not establish damage, causation, insurance coverage, or a change in property value.',
    tone: 'info',
  };
}

export function buildEventLocationNote(
  event: Pick<HomeRiskReplayTimelineEvent, 'impactFactorsJson'>
): string | null {
  const basis = event.impactFactorsJson?.locationMatch?.basis;

  if (!basis) {
    return 'This event was matched from historical risk records and available property context.';
  }

  if (basis === 'property') {
    return 'This event matched closely to this property’s location, but it still is not proof of direct damage.';
  }

  if (isBroadLocationMatch(basis)) {
    return 'This match comes from broader location history near the property, so treat it as relevant context rather than direct evidence of impact.';
  }

  return 'This event was matched from nearby historical risk records and property context.';
}
