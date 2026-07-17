import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext/domain/contracts';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

export interface HomeModificationApplicability {
  feature: FeatureDecision;
  outdoor: FeatureDecision;
}

export function evaluateHomeModificationApplicability(
  context: PropertyContextSnapshot,
): HomeModificationApplicability {
  const featureFacts = new PropertyContextDecisionBuilder(context);
  featureFacts.read<string>('core.dwellingType');
  featureFacts.read<number>('core.yearBuilt');
  const feature = featureFacts.decision('APPLICABLE', ['PROPERTY_MODIFICATIONS_AVAILABLE']);

  const outdoorFacts = new PropertyContextDecisionBuilder(context);
  const hasPrivateOutdoorSpace = outdoorFacts.read<boolean>('exterior.hasPrivateOutdoorSpace');
  let outdoor: FeatureDecision;
  if (hasPrivateOutdoorSpace === undefined) {
    outdoor = outdoorFacts.unknown('PRIVATE_OUTDOOR_SPACE_UNKNOWN');
  } else if (!hasPrivateOutdoorSpace) {
    outdoor = outdoorFacts.decision('NOT_APPLICABLE', ['NO_PRIVATE_OUTDOOR_SPACE']);
  } else {
    const responsibility = outdoorFacts.read<string>('responsibility.deckPatioBalcony');
    if (!responsibility || responsibility === 'UNKNOWN') {
      outdoor = outdoorFacts.unknown('OUTDOOR_RESPONSIBILITY_UNKNOWN');
    } else if (responsibility === 'ASSOCIATION') {
      outdoor = outdoorFacts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
    } else if (responsibility === 'LANDLORD') {
      outdoor = outdoorFacts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
    } else {
      outdoor = outdoorFacts.decision('APPLICABLE', ['PRIVATE_OUTDOOR_PROJECT_APPLICABLE']);
    }
  }
  return { feature, outdoor };
}
