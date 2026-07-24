import type { FeatureDecision, PropertyContextSnapshot } from '../../modules/propertyContext/domain/contracts';
import { PropertyContextDecisionBuilder, knownContextValue } from '../propertyContextDecision';

export interface EmergencyContextResult {
  applicability: FeatureDecision;
  promptContext: string;
}

export function evaluateEmergencyContext(context: PropertyContextSnapshot): EmergencyContextResult {
  const facts = new PropertyContextDecisionBuilder(context);
  const keys = [
    'core.dwellingType',
    'core.yearBuilt',
    'structure.foundationType',
    'systems.heatingType',
    'systems.coolingType',
    'systems.waterHeaterType',
    'safety.hasSmokeDetectors',
    'safety.hasCoDetectors',
    'safety.hasFireExtinguisher',
    'safety.hasSumpPump',
    'safety.hasSumpPumpBackup',
  ];
  for (const key of keys) facts.read(key);
  const known = keys.flatMap((key) => {
    const value = knownContextValue<unknown>(context, key);
    return value === undefined ? [] : [`${key}=${String(value)}`];
  });
  const missing = [...facts.missing, ...facts.conflicted];
  const promptContext = [
    known.length ? `Known property facts: ${known.join(', ')}.` : 'No verified property facts are available.',
    missing.length
      ? `Unknown or conflicted property facts: ${missing.join(', ')}. Do not assume these systems or safety devices are present.`
      : 'All requested property safety facts are known.',
  ].join(' ');

  // Emergency Help is never suppressed because property facts are missing.
  // Unknown safety facts increase caution in the prompt instead.
  return {
    applicability: facts.decision('APPLICABLE', [missing.length ? 'SAFETY_CONTEXT_PARTIAL' : 'SAFETY_CONTEXT_AVAILABLE']),
    promptContext,
  };
}
