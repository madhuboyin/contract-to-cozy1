import { getPropertyContext } from '../../modules/propertyContext';
import { evaluateProtectionContext } from './applicabilityPolicy';
import { reconcileProtectionIssues } from './issueReconciliation';
import type { PropertyContextScope } from '../../modules/propertyContext';

export type ProtectionContextFeature =
  | 'AGGREGATE'
  | 'INSPECTION'
  | 'RISK_PREMIUM_OPTIMIZER'
  | 'APPLIANCE_ORACLE'
  | 'VISUAL_INSPECTOR'
  | 'CLIMATE_RISK'
  | 'EVENT_RADAR'
  | 'RISK_REPLAY'
  | 'INCIDENT_NOTIFICATION';

export const PROTECTION_FEATURE_SCOPES: Record<ProtectionContextFeature, PropertyContextScope[]> = {
  AGGREGATE: ['CORE', 'LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'INVENTORY', 'MAINTENANCE', 'INSPECTION', 'COVERAGE', 'RISK', 'RECALLS', 'GUIDANCE_STATE', 'EVENTS', 'ENVIRONMENT'],
  INSPECTION: ['STRUCTURE', 'SYSTEMS', 'INVENTORY', 'INSPECTION', 'RESPONSIBILITY'],
  RISK_PREMIUM_OPTIMIZER: ['CORE', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'INVENTORY', 'MAINTENANCE', 'INSPECTION', 'COVERAGE', 'RISK', 'ENVIRONMENT'],
  APPLIANCE_ORACLE: ['INVENTORY', 'SYSTEMS', 'MAINTENANCE', 'RECALLS', 'GUIDANCE_STATE'],
  VISUAL_INSPECTOR: ['STRUCTURE', 'SYSTEMS', 'INVENTORY', 'INSPECTION', 'RESPONSIBILITY'],
  CLIMATE_RISK: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'SAFETY', 'ENVIRONMENT', 'MAINTENANCE'],
  EVENT_RADAR: ['LOCATION', 'STRUCTURE', 'EXTERIOR', 'RESPONSIBILITY', 'SYSTEMS', 'RISK', 'EVENTS', 'ENVIRONMENT', 'MAINTENANCE'],
  RISK_REPLAY: ['LOCATION', 'STRUCTURE', 'RESPONSIBILITY', 'SYSTEMS', 'RISK', 'EVENTS', 'ENVIRONMENT'],
  INCIDENT_NOTIFICATION: ['RESPONSIBILITY', 'SAFETY', 'COVERAGE', 'RISK', 'EVENTS'],
};

export async function getProtectionContextDecisions(
  propertyId: string,
  userId: string,
  feature: ProtectionContextFeature = 'AGGREGATE',
) {
  const context = await getPropertyContext(
    propertyId,
    { userId },
    {
      scopes: PROTECTION_FEATURE_SCOPES[feature],
    },
  );
  return {
    contextVersion: context.contextVersion,
    feature,
    scopes: context.scopes,
    decisions: evaluateProtectionContext(context),
    reconciliation: reconcileProtectionIssues(context),
  };
}
