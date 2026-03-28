import type { OrchestratedActionDTO } from '@/types';
import type { GuidanceActionModel } from '@/features/guidance/utils/guidanceMappers';

function tokenize(value: string | null | undefined): Set<string> {
  if (!value) return new Set();
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}

function domainHints(action: OrchestratedActionDTO): string[] {
  const category = String(action.category ?? '').toLowerCase();
  const key = String(action.actionKey ?? '').toLowerCase();
  const system = String(action.systemType ?? '').toLowerCase();

  if (key.startsWith('coverage_gap::') || category.includes('insurance')) {
    return ['coverage', 'insurance'];
  }
  if (category.includes('safety')) {
    return ['safety', 'recall', 'inspection'];
  }
  if (category.includes('financial')) {
    return ['financial', 'cost', 'coverage'];
  }
  if (category.includes('systems') || system.includes('hvac') || system.includes('plumb')) {
    return ['lifecycle', 'maintenance', 'repair', 'replace'];
  }
  return ['maintenance', 'risk'];
}

function scoreMatch(action: OrchestratedActionDTO, guidance: GuidanceActionModel): number {
  if (action.source !== 'RISK') return -1000;

  const guidanceFamily = guidance.journey.primarySignal?.signalIntentFamily?.toLowerCase() ?? '';
  const hints = domainHints(action);
  const hintScore = hints.filter((hint) => guidanceFamily.includes(hint)).length * 4;

  const actionTokens = tokenize(
    [
      action.title,
      action.description ?? '',
      action.systemType ?? '',
      action.category ?? '',
      action.actionKey ?? '',
    ].join(' ')
  );
  const guidanceTokens = tokenize(
    [
      guidance.title,
      guidance.subtitle,
      guidance.nextStep?.label ?? '',
      guidance.currentStep?.label ?? '',
      guidance.journey.journeyTypeKey ?? '',
      guidance.journey.primarySignal?.signalIntentFamily ?? '',
      guidance.explanation?.what ?? '',
    ].join(' ')
  );

  let overlap = 0;
  for (const token of actionTokens) {
    if (guidanceTokens.has(token)) overlap += 1;
  }

  const sameInsurancePressure =
    action.actionKey.startsWith('COVERAGE_GAP::') && guidance.issueDomain === 'INSURANCE' ? 6 : 0;
  const readyBoost = guidance.executionReadiness === 'READY' ? 2 : 0;

  return hintScore + overlap * 2 + sameInsurancePressure + readyBoost;
}

export function resolveGuidanceForOrchestrationAction(args: {
  action: OrchestratedActionDTO;
  guidanceActions: GuidanceActionModel[];
}): GuidanceActionModel | null {
  const { action, guidanceActions } = args;
  if (action.source !== 'RISK') return null;

  const ranked = guidanceActions
    .map((candidate) => ({ candidate, score: scoreMatch(action, candidate) }))
    .sort((a, b) => b.score - a.score);

  if (!ranked[0] || ranked[0].score <= 0) return null;
  return ranked[0].candidate;
}

export function buildGuidanceCtaLabel(action: GuidanceActionModel): string {
  const step = action.nextStep ?? action.currentStep;
  if (!step) return action.title;
  return `Step ${step.stepOrder}: ${step.label}`;
}
