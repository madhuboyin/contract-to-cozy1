import type { ServiceRadarVerdict } from './servicePriceRadarApi';

export const MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT = 250000;

export type ServicePriceRadarValidationInput = {
  serviceCategory: string;
  quoteAmount: string;
};

export type ServicePriceRadarValidationErrors = Partial<
  Record<'serviceCategory' | 'quoteAmount', string>
>;

export type ServicePriceRadarErrorStage = 'property' | 'submit' | 'list' | 'detail';

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

export type ServicePriceRadarGuardrailInput = {
  verdict: ServiceRadarVerdict | null;
  confidenceScore: number | null;
  benchmarkMatched: boolean;
  expectedLow: number | null;
  expectedHigh: number | null;
};

export type ServicePriceRadarGuardrail = {
  title: string;
  description: string;
  tone: 'info' | 'elevated';
};

function extractErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const payload = (error as ApiErrorLike).payload;
  return payload?.error?.code;
}

function extractStatus(error: unknown): number | string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  return (error as ApiErrorLike).status;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

export function buildServicePriceRadarValidationErrors(
  form: ServicePriceRadarValidationInput
): ServicePriceRadarValidationErrors {
  const errors: ServicePriceRadarValidationErrors = {};

  if (!form.serviceCategory.trim()) {
    errors.serviceCategory = 'Choose the service type first.';
  }

  const amount = Number(form.quoteAmount);
  if (!form.quoteAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
    errors.quoteAmount = 'Enter the quote amount you want to check.';
  } else if (amount > MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT) {
    errors.quoteAmount = 'Enter a quote below $250,000 for this MVP estimate.';
  }

  return errors;
}

export function getServicePriceRadarUserMessage(
  error: unknown,
  stage: ServicePriceRadarErrorStage
): {
  message: string;
  clearLinkedEntity?: boolean;
} {
  const status = extractStatus(error);
  const code = extractErrorCode(error);
  const rawMessage = extractMessage(error).toLowerCase();
  const isNetwork =
    status === 'NETWORK' ||
    rawMessage.includes('network') ||
    rawMessage.includes('fetch') ||
    rawMessage.includes('timeout');

  if (code === 'INVALID_LINKED_ENTITY') {
    return {
      message:
        'The linked home item is no longer available. We removed it, so you can retry the quote check.',
      clearLinkedEntity: true,
    };
  }

  if (
    code === 'PROPERTY_ACCESS_DENIED' ||
    code === 'SERVICE_RADAR_CHECK_NOT_FOUND' ||
    status === 404
  ) {
    if (stage === 'property') {
      return {
        message:
          'We could not load this property context. Open Service Price Radar from one of your properties and try again.',
      };
    }

    return {
      message: 'We could not find that quote check anymore. Refresh the page and try again.',
    };
  }

  if (status === 401 || code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') {
    return {
      message: 'Your session expired. Refresh the page and try again.',
    };
  }

  if (status === 400 || code === 'VALIDATION_ERROR') {
    if (stage === 'submit') {
      return {
        message: 'Check the quote details and try again.',
      };
    }

    return {
      message: 'We could not load this Radar data because the request was invalid. Try again.',
    };
  }

  if (isNetwork) {
    if (stage === 'submit') {
      return {
        message: 'We could not check this quote right now. Check your connection and try again.',
      };
    }
    if (stage === 'list') {
      return {
        message: 'We could not load recent quote checks. Try again.',
      };
    }
    if (stage === 'detail') {
      return {
        message: 'We could not open that quote check. Try again.',
      };
    }
    return {
      message: 'We could not load this property context. Try again.',
    };
  }

  if (stage === 'submit') {
    return {
      message: 'We could not check this quote right now. Please try again in a moment.',
    };
  }
  if (stage === 'list') {
    return {
      message: 'We could not load recent quote checks right now.',
    };
  }
  if (stage === 'detail') {
    return {
      message: 'We could not open that quote check right now.',
    };
  }
  return {
    message: 'We could not load this property context right now.',
  };
}

export function buildServicePriceRadarGuardrail(
  input: ServicePriceRadarGuardrailInput
): ServicePriceRadarGuardrail | null {
  const benchmarkMissing = !input.benchmarkMatched;
  const lowConfidence = input.confidenceScore !== null && input.confidenceScore < 0.5;
  const missingRange =
    input.expectedLow === null || input.expectedHigh === null || input.expectedHigh <= 0;

  if (input.verdict === 'INSUFFICIENT_DATA' || missingRange) {
    return {
      title: 'Broad estimate only',
      description: benchmarkMissing
        ? 'We could only estimate a broad range based on limited property and pricing context.'
        : 'We could only estimate a broad range with the context available for this home.',
      tone: 'info',
    };
  }

  if (benchmarkMissing && lowConfidence) {
    return {
      title: 'Directional result',
      description:
        'This result uses fallback regional assumptions, so it is best treated as a broad guide.',
      tone: 'elevated',
    };
  }

  if (benchmarkMissing) {
    return {
      title: 'Fallback pricing context',
      description:
        'We used fallback regional assumptions because a direct benchmark was not available.',
      tone: 'info',
    };
  }

  if (lowConfidence) {
    return {
      title: 'Use as directional guidance',
      description:
        'This estimate is less specific than usual, so another quote or more linked home context could help.',
      tone: 'info',
    };
  }

  return null;
}
