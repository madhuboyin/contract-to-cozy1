import type { HomeAction } from './homeAction.contract';

type PresentationVariant = NonNullable<HomeAction['presentation']>['variant'];

const ABSTRACT_HOME_HEADLINE = /^(?:review a financial exposure|review and address before listing|review the flagged home facts|review and update (?:this|the) home fact\.?|(?:review|continue|address|resolve)\s+(?:(?:this|the|a|an)\s+)?(?:action|decision|journey|issue|item|exposure|details?|home fact))$/i;

export type HomeActionPresentationEligibility = {
  eligible: boolean;
  variant: PresentationVariant | null;
  reasons: string[];
};

type PresentationRule = {
  requiredFactLabels: readonly string[];
  requiredLaunchParams?: readonly string[];
  allowedPrimaryCtaKinds?: readonly HomeAction['primaryCta']['kind'][];
  evaluate: (action: HomeAction) => string[];
};

const CORE_LAUNCH_PARAMS = [
  'launchSurface',
  'propertyId',
  'sourceActionId',
  'sourceEntityType',
  'sourceEntityId',
  'recommendationReason',
  'recommendationVersion',
  'contextVersion',
  'returnTo',
] as const;

function missingFactLabels(action: HomeAction, required: readonly string[]): string[] {
  const labels = new Set((action.presentation?.keyFacts ?? []).map((fact) => fact.label.trim().toLowerCase()));
  return required.filter((label) => !labels.has(label.toLowerCase()));
}

function basePresentationReasons(action: HomeAction): string[] {
  const presentation = action.presentation;
  if (!presentation) return [];
  const reasons: string[] = [];
  if (!presentation.subject?.label.trim()) reasons.push('MISSING_SUBJECT');
  if (!presentation.headline.trim()) reasons.push('MISSING_HEADLINE');
  if (!(presentation.whyNow?.trim() || presentation.summary.trim())) reasons.push('MISSING_REASON');
  if (!action.primaryCta.href.trim() || !action.primaryCta.label.trim()) reasons.push('MISSING_DESTINATION');
  if (ABSTRACT_HOME_HEADLINE.test(presentation.headline.trim())) {
    reasons.push('GENERIC_HEADLINE');
  }
  return reasons;
}

export function ensureHomeActionPresentation(action: HomeAction): HomeAction {
  if (action.presentation) return action;
  const subjectLabel = action.evidence.find((evidence) => evidence.label?.trim())?.label.trim() || action.signal.trim();
  const headline = ABSTRACT_HOME_HEADLINE.test(action.recommendedAction.trim())
    ? action.signal.trim()
    : action.recommendedAction.trim();
  const observed = action.evidence.find((evidence) => evidence.observedAt)?.observedAt;
  return {
    ...action,
    presentation: {
      variant: 'GENERIC_ACTION',
      eyebrow: null,
      headline: headline.slice(0, 180),
      summary: action.whyItMatters.slice(0, 320),
      whyNow: action.whyItMatters.slice(0, 500),
      keyFacts: [
        { label: 'Source', value: (action.evidence[0]?.source ?? action.source.kind).slice(0, 240) },
        { label: 'Confidence', value: action.confidence.label.toLowerCase() },
        ...(observed ? [{
          label: 'Observed',
          value: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(observed)),
        }] : []),
      ],
      factGroups: [],
      subject: {
        kind: ['INCIDENT', 'RECALL'].includes(action.source.kind) ? 'EVENT' : 'PROPERTY',
        id: action.source.entityId,
        label: subjectLabel.slice(0, 180),
      },
      detailLabel: 'Why this?',
      group: null,
    },
  };
}

function ctaRuleReasons(action: HomeAction, rule: PresentationRule): string[] {
  if (!rule.allowedPrimaryCtaKinds?.length) return [];
  return rule.allowedPrimaryCtaKinds.includes(action.primaryCta.kind)
    ? []
    : [`INVALID_PRIMARY_CTA:${action.primaryCta.kind}`];
}

function requireObservedEvidence(action: HomeAction): string[] {
  return action.evidence.some((evidence) => evidence.observedAt) ? [] : ['MISSING_OBSERVATION_DATE'];
}

export const HOME_ACTION_PRESENTATION_REGISTRY: Partial<Record<PresentationVariant, PresentationRule>> = {
  ASSET_LIFECYCLE: {
    requiredFactLabels: [],
    requiredLaunchParams: [...CORE_LAUNCH_PARAMS, 'itemId'],
    allowedPrimaryCtaKinds: ['REVIEW', 'SCHEDULE', 'SELECT_PROVIDER', 'FINANCE', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.presentation?.subject?.kind !== 'INVENTORY_ITEM') reasons.push('MISSING_ASSET');
      if (!action.timing.windowStart && !action.timing.windowEnd) reasons.push('NO_ACTIONABLE_WINDOW');
      if ((action.presentation?.factGroups.length ?? 0) === 0) reasons.push('MISSING_ASSET_FACTS');
      return reasons;
    },
  },
  SEASONAL_CHECKLIST: {
    requiredFactLabels: ['Season', 'Progress', 'Time remaining', 'Critical tasks', 'Next task'],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['REVIEW', 'START', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.evidence.length === 0) reasons.push('NO_REMAINING_TASKS');
      if (!action.timing.windowEnd) reasons.push('MISSING_SEASON_WINDOW');
      return reasons;
    },
  },
  WEATHER_ALERT: {
    requiredFactLabels: ['Hazard', 'Location', 'Forecast window', 'Severity', 'Source freshness', 'Preparation'],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['REVIEW', 'ESCALATE', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.evidence.some((evidence) => evidence.freshness === 'STALE')) reasons.push('STALE_ALERT');
      if (!action.timing.windowStart && !action.timing.windowEnd) reasons.push('MISSING_FORECAST_WINDOW');
      return reasons;
    },
  },
  ENVIRONMENT_PREPARATION: {
    requiredFactLabels: ['Hazard', 'Location', 'Forecast window', 'Severity', 'Source freshness', 'Preparation'],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['REVIEW', 'START', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.evidence.some((evidence) => evidence.freshness === 'STALE')) reasons.push('STALE_ENVIRONMENT_SIGNAL');
      if (!action.timing.windowStart && !action.timing.windowEnd) reasons.push('MISSING_EXPOSURE_WINDOW');
      return reasons;
    },
  },
  FINANCIAL_EXPOSURE: {
    requiredFactLabels: ['Subject', 'Exposure', 'Trigger', 'Coverage', 'Observation date', 'Confidence', 'Missing facts'],
    requiredLaunchParams: [...CORE_LAUNCH_PARAMS, 'journeyId'],
    allowedPrimaryCtaKinds: ['REVIEW', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      const hasAmount = action.presentation?.keyFacts.some((fact) => fact.label.toLowerCase() === 'exposure');
      if (!hasAmount && !action.presentation?.whyNow?.trim()) reasons.push('MISSING_TRIGGER_OR_AMOUNT');
      reasons.push(...requireObservedEvidence(action));
      return reasons;
    },
  },
  SALE_PREPARATION: {
    requiredFactLabels: ['Sale stage', 'Item', 'Source', 'Category', 'Impact'],
    requiredLaunchParams: [...CORE_LAUNCH_PARAMS, 'focusItemId'],
    allowedPrimaryCtaKinds: ['REVIEW', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      const stage = action.presentation?.keyFacts.find((fact) => fact.label.toLowerCase() === 'sale stage')?.value.toUpperCase();
      if (stage === 'CLOSED' || stage === 'CANCELLED') reasons.push('INACTIVE_SALE_CASE');
      if (action.presentation?.subject?.kind !== 'SALE_READINESS_ITEM') reasons.push('MISSING_SALE_ITEM');
      return reasons;
    },
  },
  HOME_FACT_REVIEW: {
    requiredFactLabels: [],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if ((action.presentation?.keyFacts.length ?? 0) === 0) reasons.push('MISSING_EXACT_FACTS');
      if (!/forecast|decision|plan/i.test(`${action.presentation?.whyNow ?? ''} ${action.expectedOutcome}`)) {
        reasons.push('MISSING_AFFECTED_DECISION');
      }
      const correctionDestination = action.primaryCta.kind === 'CORRECT_FACT' ||
        action.secondaryCtas.some((cta) => cta.kind === 'CORRECT_FACT');
      if (!correctionDestination) reasons.push('MISSING_CORRECTION_DESTINATION');
      return reasons;
    },
  },
  HEALTH_FACTOR_REVIEW: {
    // Property Health Score factor surfaced as a maintenance / data-gap /
    // warranty-gap prompt. Copy comes from content/healthFactorCopy.ts.
    requiredFactLabels: ['Current status'],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['REVIEW', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.presentation?.subject?.kind !== 'PROPERTY') reasons.push('MISSING_PROPERTY_SUBJECT');
      if ((action.presentation?.keyFacts.length ?? 0) === 0) reasons.push('MISSING_EXACT_FACTS');
      return reasons;
    },
  },
  COVERAGE_REVIEW: {
    requiredFactLabels: ['Subject', 'Evidence', 'Provider', 'Policy', 'Renewal / expiry', 'Gap'],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['REVIEW', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.evidence.length === 0) reasons.push('MISSING_COVERAGE_EVIDENCE');
      if (!['MATERIAL_FINANCIAL', 'REGULATED_COVERAGE'].includes(action.governance.safetyTier)) {
        reasons.push('MISSING_COVERAGE_GOVERNANCE');
      }
      return reasons;
    },
  },
  GENERIC_ACTION: {
    requiredFactLabels: [],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    evaluate: basePresentationReasons,
  },
  ACCEPTED_WORK: {
    requiredFactLabels: ['Task', 'Work state', 'Due', 'Execution'],
    requiredLaunchParams: CORE_LAUNCH_PARAMS,
    allowedPrimaryCtaKinds: ['REVIEW', 'ESCALATE', 'CORRECT_FACT'],
    evaluate: (action) => {
      const reasons = basePresentationReasons(action);
      if (action.presentation?.subject?.kind !== 'WORK_ITEM') reasons.push('MISSING_WORK_ITEM');
      const state = action.presentation?.keyFacts.find((fact) => fact.label.toLowerCase() === 'work state')?.value.toUpperCase();
      if (state === 'VERIFIED' || state === 'CLOSED') reasons.push('TERMINAL_WORK');
      return reasons;
    },
  },
};

export function requiredHomeActionLaunchParams(variant: PresentationVariant | null | undefined): readonly string[] {
  return variant ? HOME_ACTION_PRESENTATION_REGISTRY[variant]?.requiredLaunchParams ?? CORE_LAUNCH_PARAMS : CORE_LAUNCH_PARAMS;
}

export function evaluateHomeActionPresentationEligibility(action: HomeAction): HomeActionPresentationEligibility {
  const variant = action.presentation?.variant ?? null;
  if (!variant) return { eligible: true, variant, reasons: [] };
  const rule = HOME_ACTION_PRESENTATION_REGISTRY[variant];
  if (!rule) {
    const reasons = basePresentationReasons(action);
    return { eligible: reasons.length === 0, variant, reasons };
  }
  const requiredFactReasons = missingFactLabels(action, rule.requiredFactLabels)
    .map((label) => `MISSING_FACT:${label}`);
  const reasons = [...new Set([...rule.evaluate(action), ...ctaRuleReasons(action, rule), ...requiredFactReasons])];
  return { eligible: reasons.length === 0, variant, reasons };
}

export function homeActionLaunchEligibilityReasons(action: HomeAction): string[] {
  const required = requiredHomeActionLaunchParams(action.presentation?.variant);
  const reasons: string[] = [];
  const ctas = [action.primaryCta, ...action.secondaryCtas];
  ctas.forEach((cta, index) => {
    if (!cta.href.startsWith('/')) return;
    const destination = new URL(cta.href, 'https://contracttocozy.local');
    for (const parameter of required) {
      if (!destination.searchParams.get(parameter)) {
        reasons.push(`MISSING_LAUNCH_PARAM:${index === 0 ? 'PRIMARY' : `SECONDARY_${index}`}:${parameter}`);
      }
    }
  });
  return [...new Set(reasons)];
}
