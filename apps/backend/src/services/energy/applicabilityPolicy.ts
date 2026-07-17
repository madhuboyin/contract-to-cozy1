import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext/domain/contracts';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface EnergyApplicability {
  feature: FeatureDecision;
  hvacRecommendations: FeatureDecision;
  poolRecommendations: FeatureDecision;
}

function presenceDecision(
  context: PropertyContextSnapshot,
  key: string,
  presentReason: string,
  absentReason: string,
  unknownReason: string,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  const value = facts.read<boolean>(key);
  if (value === undefined) return facts.unknown(unknownReason);
  return value
    ? facts.decision('APPLICABLE', [presentReason])
    : facts.decision('NOT_APPLICABLE', [absentReason]);
}

export function evaluateEnergyApplicability(context: PropertyContextSnapshot): EnergyApplicability {
  const facts = new PropertyContextDecisionBuilder(context);
  const state = facts.read<string>('location.state');
  const squareFeet = facts.read<number>('core.propertySizeSqFt');
  const feature = !state || !squareFeet
    ? facts.unknown('ENERGY_BASELINE_FACTS_UNKNOWN')
    : facts.decision('APPLICABLE', ['ENERGY_BASELINE_AVAILABLE']);

  const hvacFacts = new PropertyContextDecisionBuilder(context);
  const heating = hvacFacts.read<string>('systems.heatingType');
  const cooling = hvacFacts.read<string>('systems.coolingType');
  const hasCooling = hvacFacts.read<boolean>('systems.hasCooling');
  const hvacRecommendations = heating || cooling || hasCooling === true
    ? hvacFacts.decision('APPLICABLE', ['HVAC_PRESENT'])
    : heating === undefined && cooling === undefined && hasCooling === undefined
      ? hvacFacts.unknown('HVAC_PRESENCE_UNKNOWN')
      : hvacFacts.decision('NOT_APPLICABLE', ['HVAC_NOT_PRESENT']);

  return {
    feature,
    hvacRecommendations,
    poolRecommendations: presenceDecision(
      context,
      'exterior.hasPoolOrSpa',
      'POOL_SPA_PRESENT',
      'POOL_SPA_NOT_PRESENT',
      'POOL_SPA_PRESENCE_UNKNOWN',
    ),
  };
}
