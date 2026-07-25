import type { PropertyContextSnapshot } from '../../modules/propertyContext';
import {
  isHoaApprovalRelevantWork,
  isPermitRelevantWork,
} from '../../services/projectCompliance/workScope';
import type { CapabilityProjectSource } from './capabilityRecommendationContext';

/**
 * Adds only reviewed compliance triggers. Permit and HOA applicability remain
 * independent: HOA promotion requires a known association, while permit
 * promotion depends on the work classification.
 */
export function enrichProjectComplianceCapabilitySources(
  snapshot: PropertyContextSnapshot,
  projects: readonly CapabilityProjectSource[],
): CapabilityProjectSource[] {
  const hoaAssociation = snapshot.facts['compliance.hoaAssociation'];
  const hasKnownHoaAssociation =
    hoaAssociation?.state === 'KNOWN' && hoaAssociation.value != null;

  return projects.map((project) => {
    const signals = new Set(project.signalIntentFamilies);
    const work = { projectType: project.kind };
    if (isPermitRelevantWork(work)) {
      signals.add('PERMIT_RELEVANT_PROJECT');
    }
    if (hasKnownHoaAssociation && isHoaApprovalRelevantWork(work)) {
      signals.add('HOA_PROJECT_APPROVAL_REQUIRED');
    }
    return {
      ...project,
      signalIntentFamilies: [...signals],
    };
  });
}
