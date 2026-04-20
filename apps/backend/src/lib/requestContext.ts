// apps/backend/src/lib/requestContext.ts
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Helper to get the current Request ID from the context.
 */
export const getRequestId = (): string | undefined => {
  return requestContextStorage.getStore()?.requestId;
};
