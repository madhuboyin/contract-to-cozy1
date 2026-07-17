import type { DiyProjectCategory } from '@prisma/client';
import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext/domain/contracts';
import { PropertyContextDecisionBuilder } from '../propertyContextDecision';

const responsibilityByCategory: Partial<Record<DiyProjectCategory, string>> = {
  HVAC: 'responsibility.hvac',
  PLUMBING: 'responsibility.plumbing',
  EXTERIOR: 'responsibility.buildingExterior',
  LANDSCAPING: 'responsibility.landscaping',
};

export function evaluateDiyApplicability(
  context: PropertyContextSnapshot,
  category: DiyProjectCategory,
): FeatureDecision {
  const facts = new PropertyContextDecisionBuilder(context);
  if (category === 'EXTERIOR' || category === 'LANDSCAPING') {
    const privateOutdoorSpace = facts.read<boolean>('exterior.hasPrivateOutdoorSpace');
    if (privateOutdoorSpace === undefined) return facts.unknown('PRIVATE_OUTDOOR_SPACE_UNKNOWN');
    if (!privateOutdoorSpace) return facts.decision('NOT_APPLICABLE', ['NO_PRIVATE_OUTDOOR_SPACE']);
  }
  if (category === 'HVAC') {
    const heating = facts.read<string>('systems.heatingType');
    const cooling = facts.read<string>('systems.coolingType');
    const installed = facts.read<string[]>('systems.installedItemTypes');
    if (!heating && !cooling && !installed?.some((type) => ['HVAC', 'FURNACE', 'AIR_CONDITIONER'].includes(type))) {
      return facts.unknown('HVAC_PRESENCE_UNKNOWN');
    }
  }
  const responsibilityKey = responsibilityByCategory[category];
  if (responsibilityKey) {
    const responsibility = facts.read<string>(responsibilityKey);
    if (!responsibility || responsibility === 'UNKNOWN') return facts.unknown('RESPONSIBILITY_UNKNOWN');
    if (responsibility === 'ASSOCIATION') return facts.decision('NOT_APPLICABLE', ['ASSOCIATION_RESPONSIBLE']);
    if (responsibility === 'LANDLORD') return facts.decision('NOT_APPLICABLE', ['LANDLORD_RESPONSIBLE']);
  }
  return facts.decision('APPLICABLE', ['DIY_PROJECT_PROPERTY_APPLICABLE']);
}
