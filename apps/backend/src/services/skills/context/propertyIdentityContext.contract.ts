import {
  ASK_OPERATION_DEFINITIONS,
  type AskOperationId,
} from '../../ask/askOperationRegistry';

export const PROPERTY_IDENTITY_CONTEXT_PROVIDER = Object.freeze({
  id: 'property.identity-context',
  version: '1.0.0',
});

// Property identity is the baseline context for every property-scoped operation.
// Derive this list from the canonical operation registry so adding an operation
// cannot leave the provider's separate allowlist stale and make valid Skills
// fail closed as NOT_APPLICABLE at runtime.
export const PROPERTY_IDENTITY_CONTEXT_OPERATIONS: readonly AskOperationId[] = Object.freeze(
  Object.values(ASK_OPERATION_DEFINITIONS)
    .filter((operation) => operation.requiresProperty)
    .map((operation) => operation.operationId),
);
