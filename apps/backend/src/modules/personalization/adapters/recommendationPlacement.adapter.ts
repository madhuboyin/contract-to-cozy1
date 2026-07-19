import {
  findPersonalizationDefinition,
  PersonalizationModule,
} from '../catalog/personalizationDefinitions';
import {
  buildRecommendationResponseContract,
  resolveRecommendationResponseStatus,
  type RecommendationResponseContract,
} from '../../../productFramework/recommendationResponse.contract';

interface StoredRecommendation {
  id: string;
  status: string;
  score: number | null;
  priorityBand: string | null;
  confidence: number | null;
  expiresAt: Date | null;
  definition: { code: string; category: string; safetyTier: string; governancePolicyVersion: string };
  explanations: Array<{ headline: string; reasonCodes: unknown }>;
}

function explanationSummary(reasonCodes: unknown): string {
  if (!Array.isArray(reasonCodes)) return '';
  const first = reasonCodes[0];
  if (!first || typeof first !== 'object') return '';
  const params = (first as { params?: unknown }).params;
  if (!params || typeof params !== 'object') return '';
  const message = (params as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

export interface ModuleRecommendationDTO {
  id: string;
  code: string;
  category: string;
  modules: readonly PersonalizationModule[];
  title: string;
  summary: string;
  score: number;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number | null;
  governance: {
    safetyTier: string;
    professionalBoundary: string | null;
    conservativeFallback: string | null;
    emergencyEscalation: string | null;
    policyVersion: string;
  };
  recommendationResponse: RecommendationResponseContract;
  actions: Array<{
    type: 'CONVERT_TO_TASK' | 'OPEN_MAINTENANCE';
    label: string;
    enabled: boolean;
  }>;
  expiresAt: string | null;
}

export function mapRecommendationToModule(
  recommendation: StoredRecommendation,
  module: PersonalizationModule,
  canAct: boolean,
): ModuleRecommendationDTO | null {
  const definition = findPersonalizationDefinition(recommendation.definition.code);
  if (!definition || !definition.modules.includes(module)) return null;

  const explanation = recommendation.explanations[0];
  const priority = recommendation.priorityBand === 'HIGH' || recommendation.priorityBand === 'LOW'
    ? recommendation.priorityBand
    : 'MEDIUM';
  const responseStatus = resolveRecommendationResponseStatus({ confidence: recommendation.confidence });
  const recommendationResponse = buildRecommendationResponseContract({
    status: responseStatus,
    safetyTier: definition.governance.safetyTier,
    reasonCode: responseStatus === 'AVAILABLE' ? 'PERSONALIZATION_AVAILABLE' : `PERSONALIZATION_${responseStatus}`,
  });

  return {
    id: recommendation.id,
    code: recommendation.definition.code,
    category: recommendation.definition.category,
    modules: definition.modules,
    title: explanation?.headline || definition.headline,
    summary: explanationSummary(explanation?.reasonCodes) || definition.body,
    score: recommendation.score ?? definition.defaultScore,
    priority,
    confidence: recommendation.confidence,
    governance: {
      safetyTier: definition.governance.safetyTier,
      professionalBoundary: definition.governance.professionalBoundary,
      conservativeFallback: definition.governance.conservativeFallback,
      emergencyEscalation: definition.governance.emergencyEscalation,
      policyVersion: definition.governance.policyVersion,
    },
    recommendationResponse,
    actions: module === 'MAINTENANCE'
      ? [{ type: 'CONVERT_TO_TASK', label: 'Add to maintenance', enabled: canAct && recommendationResponse.materialActionAllowed }]
      : [{ type: 'OPEN_MAINTENANCE', label: 'Review in Maintenance', enabled: true }],
    expiresAt: recommendation.expiresAt?.toISOString() ?? null,
  };
}

export function buildMaintenanceTaskFromRecommendation(recommendation: {
  id: string;
  definition: { code: string };
  explanations: Array<{ headline: string; reasonCodes: unknown }>;
}) {
  const definition = findPersonalizationDefinition(recommendation.definition.code);
  if (!definition || !definition.modules.includes('MAINTENANCE')) return null;
  const explanation = recommendation.explanations[0];

  return {
    title: explanation?.headline || definition.headline,
    description: explanationSummary(explanation?.reasonCodes) || definition.body,
    assetType: definition.maintenanceTask.assetType,
    priority: definition.maintenanceTask.priority,
    nextDueDate: new Date().toISOString(),
    actionKey: `personalization:${recommendation.id}:maintenance-task`,
  };
}
