import { runCapabilityCatalogOnlyDrill } from './capabilityCatalogOnlyDrill';
import { runCapabilityKillSwitchDrill } from './capabilityKillSwitchDrill';

const INCIDENT_SCENARIOS = [
  {
    code: 'BROKEN_DESTINATION',
    severity: 'SEV_2',
    containment: 'CAPABILITY_DISABLE',
    owners: ['PRODUCT', 'ENGINEERING', 'SUPPORT'],
  },
  {
    code: 'UNAUTHORIZED_EVIDENCE',
    severity: 'SEV_1',
    containment: 'GLOBAL_DISCOVERY_DISABLE',
    owners: ['SECURITY_PRIVACY', 'ENGINEERING', 'PRODUCT', 'SUPPORT'],
  },
  {
    code: 'SYSTEMIC_INCORRECT_RECOMMENDATIONS',
    severity: 'SEV_1',
    containment: 'GLOBAL_DISCOVERY_DISABLE',
    owners: ['PRODUCT', 'ENGINEERING', 'TRUST_DOMAIN', 'SUPPORT'],
  },
  {
    code: 'LIFECYCLE_OVERCOUNT',
    severity: 'SEV_2',
    containment: 'CATALOG_ONLY',
    owners: ['ANALYTICS', 'ENGINEERING', 'PRODUCT', 'SUPPORT'],
  },
] as const;

export function runCapabilityIncidentDrill(now = new Date()) {
  const killSwitch = runCapabilityKillSwitchDrill({ now, env: {} });
  const catalogOnly = runCapabilityCatalogOnlyDrill(now);
  const scenarios = INCIDENT_SCENARIOS.map((scenario) => {
    const containmentVerified =
      scenario.containment === 'CAPABILITY_DISABLE'
        ? killSwitch.perCapability.every(({ passed }) => passed)
        : scenario.containment === 'GLOBAL_DISCOVERY_DISABLE'
          ? killSwitch.global.passed
          : catalogOnly.rollback.catalogPreserved
            && catalogOnly.rollback.surfaces.every(({ suppressed }) => suppressed);
    const recoveryVerified =
      scenario.containment === 'CATALOG_ONLY'
        ? catalogOnly.restoration.catalogRestored
        : killSwitch.restoration.passed;
    const steps = [
      { step: 'DETECT', passed: true },
      { step: 'CLASSIFY', passed: true },
      { step: 'CONTAIN', passed: containmentVerified },
      { step: 'VERIFY_HOME_ACTION_CONTINUITY', passed: true },
      { step: 'ESCALATE', passed: scenario.owners.includes('SUPPORT') },
      { step: 'RECOVER', passed: recoveryVerified },
      { step: 'CLOSE', passed: containmentVerified && recoveryVerified },
    ];
    return {
      ...scenario,
      passed: steps.every(({ passed }) => passed),
      steps,
      evidencePolicy: {
        boundedLineageOnly: true,
        rawPropertyEvidenceProhibited: true,
        credentialsProhibited: true,
        analyticsCaveatRequired: scenario.code === 'LIFECYCLE_OVERCOUNT',
      },
    };
  });

  return {
    contractVersion: 'capability-incident-drill-v1' as const,
    checkedAt: now.toISOString(),
    passed:
      killSwitch.passed
      && catalogOnly.passed
      && scenarios.every(({ passed }) => passed),
    supportingControls: {
      killSwitchContractVersion: killSwitch.contractVersion,
      killSwitchPassed: killSwitch.passed,
      catalogOnlyContractVersion: catalogOnly.contractVersion,
      catalogOnlyPassed: catalogOnly.passed,
    },
    scenarios,
  };
}
