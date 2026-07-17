import type { AggregationContextFeature } from './context';
import { getAggregationContextEnvelope } from './context';

export interface AggregationBatchItem {
  propertyId: string;
  userId: string;
}

export interface AggregationBatchResult {
  propertyId: string;
  status: 'READY' | 'DENIED' | 'FAILED';
  envelope?: Awaited<ReturnType<typeof getAggregationContextEnvelope>>;
  errorCode?: string;
}

/** Bounded-concurrency loader for workers and bulk aggregation jobs. */
export async function getAggregationContextBatch(
  items: AggregationBatchItem[],
  feature: AggregationContextFeature = 'WORKER_BATCH',
  concurrency = 10,
): Promise<AggregationBatchResult[]> {
  const unique = [...new Map(items.map((item) => [`${item.propertyId}:${item.userId}`, item])).values()];
  const results = new Array<AggregationBatchResult>(unique.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < unique.length) {
      const index = cursor++;
      const item = unique[index];
      try {
        results[index] = {
          propertyId: item.propertyId,
          status: 'READY',
          envelope: await getAggregationContextEnvelope(item.propertyId, item.userId, feature),
        };
      } catch (error: any) {
        const denied = error?.name === 'PropertyContextAccessDeniedError';
        results[index] = {
          propertyId: item.propertyId,
          status: denied ? 'DENIED' : 'FAILED',
          errorCode: denied ? 'PROPERTY_ACCESS_DENIED' : 'CONTEXT_LOAD_FAILED',
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), unique.length || 1) }, worker));
  return results;
}
