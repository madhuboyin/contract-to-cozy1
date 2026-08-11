import { AsyncLocalStorage } from 'async_hooks';

// humanDate() is called from ~20 places deep inside individual operation
// resolvers, none of which currently receive the property they're scoped
// to. Threading an explicit parameter through every one of those call
// sites would touch most of this module. AsyncLocalStorage (already used
// this way elsewhere in the backend — see lib/requestContext.ts) lets the
// small number of top-level orchestrator entry points set the property's
// timezone once, while every humanDate() call anywhere in that async
// chain reads it implicitly.
export interface AskExecutionContext {
  propertyTimezone?: string | null;
}

const askExecutionContextStorage = new AsyncLocalStorage<AskExecutionContext>();

// enterWith (rather than run+callback) so each top-level orchestrator entry
// point can set this with one line near its top — each is already the start
// of its own unit of work (one call per API request), so there's no sibling
// code this could leak into.
export function enterAskExecutionContext(context: AskExecutionContext): void {
  askExecutionContextStorage.enterWith(context);
}

export function getAskPropertyTimezone(): string {
  return askExecutionContextStorage.getStore()?.propertyTimezone || 'UTC';
}
