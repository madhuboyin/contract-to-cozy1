/**
 * ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md — FR-CAP-4 / §18 Phase 1
 *
 * Command Candidate Preview Admission Gate:
 * Requires semantic job, target entity, parameters, and required slots to
 * validate before any uncertified command candidate opens a confirmation preview.
 * If validation fails, downgrades the preview into a safe NEEDS_CLARIFICATION
 * response so no unverified command confirmation card can be shown.
 */

import { getAskDomainCommandByOperation } from '../../askDomainCommandRegistry';
import type { AskEntityResolutionResult } from '../../askEntityResolution';
import type { AskOperationId, AskOperationResult } from '../../askOperationRegistry';

export const ASK_COMMAND_PREVIEW_ADMISSION_VERSION = '1.0.0' as const;

export interface CommandPreviewAdmissionInput {
  readonly operationId: AskOperationId;
  readonly message: string;
  readonly routedDeterministically: boolean;
  readonly operationConfirmedByUser: boolean;
  readonly entityResolution?: AskEntityResolutionResult | null;
  readonly result: AskOperationResult;
}

export interface CommandPreviewAdmissionVerdict {
  readonly admitted: boolean;
  readonly applicable: boolean;
  readonly reasonCode:
    | 'NOT_A_COMMAND_PREVIEW'
    | 'CERTIFIED_OR_USER_CONFIRMED_COMMAND'
    | 'COMMAND_PREVIEW_ADMITTED'
    | 'COMMAND_JOB_UNREGISTERED'
    | 'COMMAND_TARGET_ENTITY_UNRESOLVED'
    | 'COMMAND_REQUIRED_SLOTS_MISSING'
    | 'COMMAND_PARAMETERS_INVALID';
  readonly missingSlots: readonly string[];
}

const UNSAFE_PARAMETER_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'rawWhere', 'prismaWhere']);

function hasValidCommandParameters(result: AskOperationResult): boolean {
  const confirmationParams = (result.confirmation as { parameters?: unknown } | null | undefined)?.parameters;
  const topParams = result.parameters;
  const candidate = confirmationParams ?? topParams;
  if (candidate === undefined || candidate === null) return false;
  if (typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const keys = Object.keys(candidate as Record<string, unknown>);
  if (keys.some((key) => UNSAFE_PARAMETER_KEYS.has(key))) return false;
  return true;
}

function extractMissingCommandSlots(
  entityResolution: AskEntityResolutionResult | null | undefined,
  result: AskOperationResult,
): string[] {
  const missing: string[] = [];
  const entityMissing = (entityResolution as { missingSlots?: readonly string[] } | null | undefined)?.missingSlots ?? [];
  for (const slot of entityMissing) {
    if (slot && !missing.includes(slot)) missing.push(slot);
  }
  const paramMissing = (result.parameters as { missingRequiredSlots?: readonly string[] } | undefined)?.missingRequiredSlots ?? [];
  for (const slot of paramMissing) {
    if (slot && !missing.includes(slot)) missing.push(slot);
  }
  return missing;
}

/**
 * Evaluates whether a command candidate that wants to open a confirmation preview
 * has validated semantic job, target entity, parameters, and required slots.
 */
export function validateCommandPreviewAdmission(
  input: CommandPreviewAdmissionInput,
): CommandPreviewAdmissionVerdict {
  const commandDef = getAskDomainCommandByOperation(input.operationId);
  const opensPreview = input.result.status === 'NEEDS_CONFIRMATION' || Boolean(input.result.confirmation);

  if (!commandDef && !opensPreview) {
    return {
      admitted: true,
      applicable: false,
      reasonCode: 'NOT_A_COMMAND_PREVIEW',
      missingSlots: [],
    };
  }

  if (!opensPreview) {
    return {
      admitted: true,
      applicable: false,
      reasonCode: 'NOT_A_COMMAND_PREVIEW',
      missingSlots: [],
    };
  }

  // Certified deterministic command routes or explicit user-confirmed command launches
  // still require a registered domain command and valid parameter envelope.
  if (!commandDef || !commandDef.id || !commandDef.artifactType) {
    return {
      admitted: false,
      applicable: true,
      reasonCode: 'COMMAND_JOB_UNREGISTERED',
      missingSlots: [],
    };
  }

  const missingSlots = extractMissingCommandSlots(input.entityResolution, input.result);
  if (missingSlots.length > 0) {
    return {
      admitted: false,
      applicable: true,
      reasonCode: 'COMMAND_REQUIRED_SLOTS_MISSING',
      missingSlots,
    };
  }

  if (!hasValidCommandParameters(input.result)) {
    return {
      admitted: false,
      applicable: true,
      reasonCode: 'COMMAND_PARAMETERS_INVALID',
      missingSlots: [],
    };
  }

  if (input.routedDeterministically || input.operationConfirmedByUser) {
    return {
      admitted: true,
      applicable: true,
      reasonCode: 'CERTIFIED_OR_USER_CONFIRMED_COMMAND',
      missingSlots: [],
    };
  }

  // Uncertified command candidate: must have resolved target entity (or NOT_REQUIRED when property/account-scoped)
  const entityOutcome = input.entityResolution?.outcome;
  if (
    entityOutcome === 'MISSING'
    || entityOutcome === 'AMBIGUOUS'
    || (entityOutcome === undefined && commandDef.authorization === 'PROPERTY_ROLE')
  ) {
    return {
      admitted: false,
      applicable: true,
      reasonCode: 'COMMAND_TARGET_ENTITY_UNRESOLVED',
      missingSlots: [],
    };
  }

  return {
    admitted: true,
    applicable: true,
    reasonCode: 'COMMAND_PREVIEW_ADMITTED',
    missingSlots: [],
  };
}

/**
 * Enforces FR-CAP-4 on an operation result before a confirmation preview is returned.
 */
export function gateUncertifiedCommandPreview(input: CommandPreviewAdmissionInput): {
  readonly result: AskOperationResult;
  readonly verdict: CommandPreviewAdmissionVerdict;
} {
  const verdict = validateCommandPreviewAdmission(input);
  if (verdict.admitted) {
    return { result: input.result, verdict };
  }

  const slotDetail = verdict.missingSlots.length > 0
    ? ` Needed details: ${verdict.missingSlots.join(', ')}.`
    : '';
  return {
    verdict,
    result: {
      status: 'NEEDS_CLARIFICATION',
      reasonCode: 'ASK_COMMAND_PREVIEW_ADMISSION_BLOCKED',
      confirmation: undefined,
      captureRequests: [],
      suggestions: [],
      parameters: {
        ...(input.result.parameters ?? {}),
        commandPreviewAdmission: {
          version: ASK_COMMAND_PREVIEW_ADMISSION_VERSION,
          admitted: false,
          reasonCode: verdict.reasonCode,
          missingSlots: verdict.missingSlots,
        },
      },
      blocks: [{
        type: 'SUMMARY',
        id: 'command-preview-admission-clarify',
        title: 'I need one more detail before preparing that change',
        body: `I couldn’t verify the exact home record and details for that action, so I haven’t opened a confirmation preview or changed anything.${slotDetail}`,
        tone: 'CAUTION',
        actions: [],
      }],
    },
  };
}
