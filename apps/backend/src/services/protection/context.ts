import { getPropertyContext } from '../../modules/propertyContext';
import { evaluateProtectionContext } from './applicabilityPolicy';

export async function getProtectionContextDecisions(propertyId: string, userId: string) {
  const context = await getPropertyContext(
    propertyId,
    { userId },
    {
      scopes: [
        'CORE',
        'LOCATION',
        'STRUCTURE',
        'EXTERIOR',
        'SYSTEMS',
        'SAFETY',
        'INVENTORY',
        'MAINTENANCE',
        'INSPECTION',
        'COVERAGE',
        'RISK',
        'RECALLS',
        'GUIDANCE_STATE',
        'EVENTS',
        'ENVIRONMENT',
      ],
    },
  );
  return {
    contextVersion: context.contextVersion,
    decisions: evaluateProtectionContext(context),
  };
}
