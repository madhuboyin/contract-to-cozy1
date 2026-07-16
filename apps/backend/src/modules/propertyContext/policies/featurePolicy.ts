import { FeatureDecision, PropertyContextSnapshot, PropertyFact } from '../domain/contracts';

export function inspectDecisionFacts(
  context: PropertyContextSnapshot,
  requiredFactKeys: string[],
): Pick<FeatureDecision, 'usedFactKeys' | 'missingFactKeys' | 'conflictedFactKeys' | 'validUntil'> {
  const facts = requiredFactKeys.map((key) => context.facts[key]).filter((fact): fact is PropertyFact => Boolean(fact));
  const missingFactKeys = requiredFactKeys.filter((key) => {
    const fact = context.facts[key];
    return !fact || fact.state === 'UNKNOWN' || fact.state === 'STALE';
  });
  const conflictedFactKeys = facts.filter((fact) => fact.state === 'CONFLICTED').map((fact) => fact.key);
  const validUntilValues = facts
    .map((fact) => fact.validUntil)
    .filter((value): value is string => value !== null)
    .sort();

  return {
    usedFactKeys: facts.filter((fact) => fact.state === 'KNOWN').map((fact) => fact.key),
    missingFactKeys,
    conflictedFactKeys,
    validUntil: validUntilValues[0] ?? null,
  };
}
