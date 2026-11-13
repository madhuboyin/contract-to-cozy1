// Composition FRD §6.10: the CURRENT authorization view used by the final gate, at assembly time and again on every replay. It re-reads property access and
// the operations this user may run now, so stale authorization never becomes durable disclosure authority.
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { resolvePropertyAccess } from '../../propertyAccess.service';
import { discoverableAskOperationIds } from '../askHandlerSupport';
import { getAskOperationDefinition } from '../askOperationRegistry';
import { prisma } from '../../../lib/prisma';
import type { AuthorizationView } from './compositeResult';
import { COMPOSABLE_SOURCE_AUTHORIZATION, type CompositeSourceType } from './sourceAuthorization';

const RANK: Record<string, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };

export async function buildAuthorizationView(userId: string, propertyId: string, controls = readAskOperationalControls()): Promise<AuthorizationView> {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) return { propertyAccess: false, isOperationAuthorized: () => false, authorizeSources: async () => 'WITHHOLD_COMPOSITE' };
  const eligible = new Set(await discoverableAskOperationIds({ propertyId, propertyAccess: access, controls }));
  return {
    propertyAccess: true,
    isOperationAuthorized: (operationId) => {
      const floor = getAskOperationDefinition(operationId).propertyRoleFloor;
      return eligible.has(operationId) && (!floor || (RANK[String(access.role)] ?? 0) >= RANK[floor]);
    },
    // FR-AUT-1: each operation reauthorizes the records behind its section against the live tables, as the requesting user. An operation with no contract,
    // or a record lookup that throws, fails closed.
    authorizeSources: async (operationId, sources) => {
      const contract = COMPOSABLE_SOURCE_AUTHORIZATION[operationId];
      if (!contract) return 'REDACT_SECTION';
      return contract.authorizeSources({ userId, propertyId, role: String(access.role), exists: (model: CompositeSourceType, where) => recordExists(model, where) }, sources);
    },
  };
}

/** One bounded existence check against the live table for a source type (`select: { id }` only; no record content is read). */
/** A source type that is a constrained view of a table (not a Prisma model of its own) names the model it reads. */
const SOURCE_TYPE_MODEL: Readonly<Partial<Record<CompositeSourceType, string>>> = { CurrentPropertyRecordVersion: 'PropertyRecordVersion' };
export const delegateNameForSourceType = (model: CompositeSourceType): string => { const name = SOURCE_TYPE_MODEL[model] ?? model; return `${name.charAt(0).toLowerCase()}${name.slice(1)}`; };
async function recordExists(model: CompositeSourceType, where: Record<string, unknown>): Promise<boolean> {
  const delegate = (prisma as unknown as Record<string, { findFirst(args: { where: Record<string, unknown>; select: { id: true } }): Promise<unknown> }>)[delegateNameForSourceType(model)];
  if (!delegate) throw new Error(`no delegate for ${model}`);
  return Boolean(await delegate.findFirst({ where, select: { id: true } }));
}
