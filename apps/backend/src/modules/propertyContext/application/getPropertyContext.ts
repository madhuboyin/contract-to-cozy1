import { createHash } from 'node:crypto';
import { resolvePropertyAccess } from '../../../services/propertyAccess.service';
import {
  PropertyContextActor,
  PropertyContextRequest,
  PropertyContextScope,
  PropertyContextSnapshot,
  PropertyFact,
} from '../domain/contracts';
import {
  INITIAL_PROPERTY_CONTEXT_ASSEMBLERS,
  PropertyContextAssembler,
} from '../infrastructure/prismaAssemblers';
import {
  propertyContextFactStatesTotal,
  propertyContextReadDurationSeconds,
  propertyContextReadsTotal,
} from '../../../lib/metrics';
import { getFactDefinition } from '../catalog/factCatalog';

export class PropertyContextAccessDeniedError extends Error {
  constructor() {
    super('Property not found or access denied.');
    this.name = 'PropertyContextAccessDeniedError';
  }
}
export interface PropertyContextDependencies {
  authorize: (userId: string, propertyId: string) => Promise<boolean>;
  assemblers: PropertyContextAssembler[];
  now: () => Date;
}

const defaultDependencies: PropertyContextDependencies = {
  authorize: async (userId, propertyId) => Boolean(await resolvePropertyAccess(userId, propertyId)),
  assemblers: INITIAL_PROPERTY_CONTEXT_ASSEMBLERS,
  now: () => new Date(),
};

function contextVersion(propertyId: string, scopes: PropertyContextScope[], facts: Record<string, PropertyFact>): string {
  const stableFacts = Object.keys(facts).sort().map((key) => facts[key]);
  return createHash('sha256')
    .update(JSON.stringify({ propertyId, scopes: [...scopes].sort(), facts: stableFacts }))
    .digest('hex');
}

export async function getPropertyContext(
  propertyId: string,
  actor: PropertyContextActor,
  request: PropertyContextRequest,
  dependencies: PropertyContextDependencies = defaultDependencies,
): Promise<PropertyContextSnapshot> {
  const startedAt = process.hrtime.bigint();
  if (!await dependencies.authorize(actor.userId, propertyId)) {
    for (const scope of request.scopes) propertyContextReadsTotal.inc({ scope, outcome: 'denied' });
    throw new PropertyContextAccessDeniedError();
  }

  const scopes = [...new Set(request.scopes)];
  const assemblerByScope = new Map(dependencies.assemblers.map((assembler) => [assembler.scope, assembler]));
  const supportedScopes = scopes.filter((scope) => assemblerByScope.has(scope));
  const unsupportedScopes = scopes.filter((scope) => !assemblerByScope.has(scope));
  const now = dependencies.now();
  const assembled = await Promise.all(
    supportedScopes.map((scope) => assemblerByScope.get(scope)!.assemble(propertyId, now, actor)),
  );
  const facts = Object.fromEntries(assembled.flat().map((fact) => [fact.key, fact]));
  const warnings: PropertyContextSnapshot['warnings'] = [];
  const conflictedFactKeys = Object.values(facts).filter((fact) => fact.state === 'CONFLICTED').map((fact) => fact.key);
  const staleFactKeys = Object.values(facts).filter((fact) => fact.state === 'STALE').map((fact) => fact.key);
  if (conflictedFactKeys.length) warnings.push({ code: 'CONFLICT', factKeys: conflictedFactKeys });
  if (staleFactKeys.length) warnings.push({ code: 'STALE_SOURCE', factKeys: staleFactKeys });
  if (unsupportedScopes.length) warnings.push({ code: 'PARTIAL_SCOPE', factKeys: unsupportedScopes.map((scope) => `scope.${scope}`) });

  const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
  for (const scope of scopes) {
    propertyContextReadsTotal.inc({ scope, outcome: supportedScopes.includes(scope) ? 'success' : 'unsupported' });
    propertyContextReadDurationSeconds.observe({ scope }, durationSeconds);
  }
  for (const fact of Object.values(facts)) {
    const scope = getFactDefinition(fact.key).scope;
    propertyContextFactStatesTotal.inc({ scope, fact_key: fact.key, state: fact.state });
  }

  return {
    propertyId,
    contextVersion: contextVersion(propertyId, scopes, facts),
    generatedAt: now.toISOString(),
    scopes,
    facts,
    warnings,
  };
}
