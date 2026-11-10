// Composition FRD §6.10: the CURRENT authorization view used by the final gate, at assembly time and again on every replay. It re-reads property access and
// the operations this user may run now, so stale authorization never becomes durable disclosure authority.
import { readAskOperationalControls } from '../../../config/askOperationalControls';
import { resolvePropertyAccess } from '../../propertyAccess.service';
import { discoverableAskOperationIds } from '../askHandlerSupport';
import { getAskOperationDefinition } from '../askOperationRegistry';
import type { AuthorizationView } from './compositeResult';

const RANK: Record<string, number> = { VIEWER: 1, CONTRIBUTOR: 2, OWNER: 3 };

export async function buildAuthorizationView(userId: string, propertyId: string, controls = readAskOperationalControls()): Promise<AuthorizationView> {
  const access = await resolvePropertyAccess(userId, propertyId);
  if (!access) return { propertyAccess: false, isOperationAuthorized: () => false };
  const eligible = new Set(await discoverableAskOperationIds({ propertyId, propertyAccess: access, controls }));
  return {
    propertyAccess: true,
    isOperationAuthorized: (operationId) => {
      const floor = getAskOperationDefinition(operationId).propertyRoleFloor;
      return eligible.has(operationId) && (!floor || (RANK[String(access.role)] ?? 0) >= RANK[floor]);
    },
  };
}
