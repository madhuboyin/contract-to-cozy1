import type { AskOperationId } from './askOperationRegistry';
import type { CreateAskExecutionRequest } from '../../productFramework/ask/ask.contract';

// Ask Cozy Stage 3, Phase 1 (implementation plan §7; FRD §16). The canonical,
// per-operation invocation envelope every capability handler shim receives.
// Deliberately homeowner/request-shaped only -- system-computed dependencies
// a handler may also need (composed skill context, execution timing trace)
// travel as a separate CapabilityInvocationDependencies argument, never
// folded into this envelope, because they are not part of the request the
// homeowner made and don't belong to the operation's own input contract.
export interface CapabilityInvocationEnvelope {
  userId: string;
  propertyId?: string;
  sessionId: string;
  executionId: string;
  message: string;
  launchContext?: CreateAskExecutionRequest['launchContext'];
  suppliedInput?: Record<string, unknown>;
  continuationCursor?: string;
}

// Existing errorContract: 'ASK_TYPED_RESULT' convention (SkillAdapterDefinition,
// skillAdapter.contract.ts) -- a missing handler for a registered, enabled
// adapter must fail as a typed error, never an undefined-function crash.
export class AskCapabilityHandlerMissingError extends Error {
  readonly errorContract = 'ASK_TYPED_RESULT' as const;
  readonly operationId: AskOperationId;
  readonly adapterKey: string;

  constructor(operationId: AskOperationId, adapterKey: string) {
    super(`ASK_CAPABILITY_HANDLER_MISSING: no capability handler registered for adapter "${adapterKey}" (operation ${operationId})`);
    this.name = 'AskCapabilityHandlerMissingError';
    this.operationId = operationId;
    this.adapterKey = adapterKey;
  }
}
