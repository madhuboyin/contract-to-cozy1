import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext/domain/contracts';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface EnvironmentApplicability {
  feature: FeatureDecision;
  hvacFilterMaintenance: FeatureDecision;
}

export function evaluateEnvironmentApplicability(context: PropertyContextSnapshot): EnvironmentApplicability {
  const featureFacts = new PropertyContextDecisionBuilder(context);
  const zipCode = featureFacts.read<string>('location.zipCode');
  const geocoded = featureFacts.read<boolean>('location.geocoded');
  const feature = zipCode || geocoded
    ? featureFacts.decision('APPLICABLE', ['PROPERTY_LOCATION_AVAILABLE'])
    : featureFacts.unknown('PROPERTY_LOCATION_UNKNOWN');

  const hvacFacts = new PropertyContextDecisionBuilder(context);
  const heatingType = hvacFacts.read<string>('systems.heatingType');
  const coolingType = hvacFacts.read<string>('systems.coolingType');
  const installed = hvacFacts.read<string[]>('systems.installedItemTypes');
  const hasHvac = Boolean(
    heatingType
    || coolingType
    || installed?.some((type) => ['HVAC', 'FURNACE', 'AIR_CONDITIONER'].includes(type)),
  );
  let hvacFilterMaintenance: FeatureDecision;
  if (!hasHvac) {
    hvacFilterMaintenance = heatingType === undefined && coolingType === undefined && installed === undefined
      ? hvacFacts.unknown('HVAC_PRESENCE_UNKNOWN')
      : hvacFacts.decision('NOT_APPLICABLE', ['HVAC_NOT_PRESENT']);
  } else {
    const responsibility = hvacFacts.read<string>('responsibility.hvac');
    if (!responsibility || responsibility === 'UNKNOWN') {
      hvacFilterMaintenance = hvacFacts.unknown('HVAC_RESPONSIBILITY_UNKNOWN');
    } else if (responsibility === 'ASSOCIATION') {
      hvacFilterMaintenance = hvacFacts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
    } else if (responsibility === 'LANDLORD') {
      hvacFilterMaintenance = hvacFacts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
    } else {
      hvacFilterMaintenance = hvacFacts.decision('APPLICABLE', ['HVAC_FILTER_MAINTENANCE_APPLICABLE']);
    }
  }

  return { feature, hvacFilterMaintenance };
}
