// BICC-BUY-002: the buyer's one saved comparison. Scoped to the caller in every query; a candidate that is not the caller's active home is refused as "not found" (no probing),
// and ids that stop being active homes are dropped on read. Nothing here touches Property, a household or a homeowner calculation.
import { prisma } from '../../../lib/prisma';
import { APIError } from '../../../middleware/error.middleware';
import { COMPARISON_DIMENSIONS } from './candidateComparison';

export const MAX_SAVED_COMPARISON_HOMES = 6;
const DIMENSION_KEYS: ReadonlySet<string> = new Set(COMPARISON_DIMENSIONS.map((d) => d.key));

export interface SavedComparison { candidateIds: string[]; dimensions: string[] }

/** Pure: keeps only ids that are still the person's active homes, in the order saved. */
export function reconcileSavedComparison(saved: SavedComparison | null, activeIds: ReadonlySet<string>): SavedComparison | null {
  if (!saved) return null;
  const candidateIds = saved.candidateIds.filter((id) => activeIds.has(id));
  const dimensions = saved.dimensions.filter((key) => DIMENSION_KEYS.has(key));
  return candidateIds.length >= 2 ? { candidateIds, dimensions } : null;
}

export const candidateComparisonStateService = {
  async get(userId: string): Promise<SavedComparison | null> {
    const row = await prisma.candidateComparisonState.findUnique({ where: { userId } });
    if (!row) return null;
    const active = await prisma.candidateProperty.findMany({ where: { userId, status: 'ACTIVE', id: { in: row.candidateIds } }, select: { id: true } });
    return reconcileSavedComparison({ candidateIds: row.candidateIds, dimensions: row.dimensions }, new Set(active.map((home) => home.id)));
  },

  async save(userId: string, input: { candidateIds: unknown; dimensions: unknown }): Promise<SavedComparison> {
    const { candidateIds, dimensions } = input;
    if (!Array.isArray(candidateIds) || !candidateIds.every((id) => typeof id === 'string' && id)) throw new APIError('Choose between two and six of your homes.', 400, 'CANDIDATE_COMPARISON_INVALID');
    const ids = [...new Set(candidateIds as string[])];
    if (ids.length < 2 || ids.length > MAX_SAVED_COMPARISON_HOMES) throw new APIError('Choose between two and six of your homes.', 400, 'CANDIDATE_COMPARISON_INVALID');
    if (!Array.isArray(dimensions) || !dimensions.every((key) => typeof key === 'string' && DIMENSION_KEYS.has(key))) throw new APIError('Choose what to compare from the list.', 400, 'CANDIDATE_COMPARISON_INVALID');
    const keys = [...new Set(dimensions as string[])];
    const owned = await prisma.candidateProperty.findMany({ where: { userId, status: 'ACTIVE', id: { in: ids } }, select: { id: true } });
    // One id that is not the caller's active home fails the whole request the same way, so it cannot be used to probe for other people's homes.
    if (owned.length !== ids.length) throw new APIError('One of those homes was not found.', 404, 'CANDIDATE_NOT_FOUND');
    await prisma.candidateComparisonState.upsert({ where: { userId }, create: { userId, candidateIds: ids, dimensions: keys }, update: { candidateIds: ids, dimensions: keys } });
    return { candidateIds: ids, dimensions: keys };
  },

  async clear(userId: string): Promise<void> {
    await prisma.candidateComparisonState.deleteMany({ where: { userId } });
  },
};
