import { getFactDefinitionsForScope, isFactApplicable } from '../catalog/factCatalog';
import { PropertyContextScope, PropertyContextSnapshot } from '../domain/contracts';

export interface PropertyContextScopeCompleteness {
  scope: PropertyContextScope;
  totalFacts: number;
  knownFacts: number;
  completenessPercent: number;
  missingFactKeys: string[];
  conflictedFactKeys: string[];
  staleFactKeys: string[];
}

export interface PropertyContextCompleteness {
  propertyId: string;
  contextVersion: string;
  completenessPercent: number;
  scopes: PropertyContextScopeCompleteness[];
}

export function getContextCompleteness(snapshot: PropertyContextSnapshot): PropertyContextCompleteness {
  const scopes = snapshot.scopes.map((scope): PropertyContextScopeCompleteness => {
    const factKeys = getFactDefinitionsForScope(scope)
      .filter((definition) => isFactApplicable(definition, snapshot.facts))
      .map((definition) => definition.key);
    const knownFactKeys = factKeys.filter((key) => snapshot.facts[key]?.state === 'KNOWN');
    const missingFactKeys = factKeys.filter((key) => !snapshot.facts[key] || snapshot.facts[key].state === 'UNKNOWN');
    const conflictedFactKeys = factKeys.filter((key) => snapshot.facts[key]?.state === 'CONFLICTED');
    const staleFactKeys = factKeys.filter((key) => snapshot.facts[key]?.state === 'STALE');
    return {
      scope,
      totalFacts: factKeys.length,
      knownFacts: knownFactKeys.length,
      completenessPercent: factKeys.length === 0 ? 100 : Math.round((knownFactKeys.length / factKeys.length) * 100),
      missingFactKeys,
      conflictedFactKeys,
      staleFactKeys,
    };
  });
  const totalFacts = scopes.reduce((sum, scope) => sum + scope.totalFacts, 0);
  const knownFacts = scopes.reduce((sum, scope) => sum + scope.knownFacts, 0);
  return {
    propertyId: snapshot.propertyId,
    contextVersion: snapshot.contextVersion,
    completenessPercent: totalFacts === 0 ? 100 : Math.round((knownFacts / totalFacts) * 100),
    scopes,
  };
}
