import manifest from './answerContractManifest.json';
import type { AskOperationId, AskOperationResult } from '../askOperationRegistry';

export type OperationAnswerEvidenceTier =
  | 'CODE_PATH_CONTRACT'
  | 'TYPED_CONTRACT_UNTESTED_AGAINST_HANDLER'
  | 'SOURCE_SCAN_ONLY';

interface OperationAnswerContract {
  operationId: string;
  allowedBlockTypes: string[];
  emittedBlockIds: string[];
  evidenceTier: OperationAnswerEvidenceTier;
}

const CONTRACTS = new Map(
  (manifest.operations as OperationAnswerContract[]).map((contract) => [contract.operationId, contract]),
);

function idMatches(declaration: string, type: string, id: string): boolean {
  const separator = declaration.indexOf(':');
  if (separator < 0 || declaration.slice(0, separator) !== type) return false;
  const declaredId = declaration.slice(separator + 1);
  return declaredId.endsWith('*') ? id.startsWith(declaredId.slice(0, -1)) : id === declaredId;
}

export function operationAnswerContractTier(operationId: AskOperationId): OperationAnswerEvidenceTier | null {
  return CONTRACTS.get(operationId)?.evidenceTier ?? null;
}

export function isSourceScanOnlyAnswerContract(operationId: AskOperationId): boolean {
  return operationAnswerContractTier(operationId) === 'SOURCE_SCAN_ONLY';
}

/**
 * FR-ANS-3 / §18 Phase 1: Any answer-gate bypass based only on source-scan
 * contracts is prohibited. An operation whose manifest contract is
 * SOURCE_SCAN_ONLY (or TYPED_CONTRACT_UNTESTED_AGAINST_HANDLER) may never
 * bypass semantic relevance or receipt entailment checks.
 */
export function canAnswerContractBypassRelevance(operationId: AskOperationId): boolean {
  const contract = CONTRACTS.get(operationId);
  if (!contract) return true;
  return contract.evidenceTier === 'CODE_PATH_CONTRACT'
    && contract.allowedBlockTypes.length > 0
    && contract.emittedBlockIds.length > 0;
}

/** Runtime half of FR-GATE-1/2; used only after semantic mismatch checks. */
export function matchesOperationAnswerContract(operationId: AskOperationId, result: AskOperationResult): boolean {
  const contract = CONTRACTS.get(operationId);
  if (!contract || contract.evidenceTier !== 'CODE_PATH_CONTRACT' || result.blocks.length === 0) return false;
  const allowedTypes = new Set(contract.allowedBlockTypes);
  return result.blocks.every((block) => allowedTypes.has(block.type)
    && contract.emittedBlockIds.some((declaration) => idMatches(declaration, block.type, block.id)));
}

export function operationAnswerContractCoverage(): { covered: number; total: number; sourceScanOnly: number } {
  const contracts = [...CONTRACTS.values()];
  return {
    covered: contracts.filter((contract) => contract.evidenceTier === 'CODE_PATH_CONTRACT' && contract.allowedBlockTypes.length > 0 && contract.emittedBlockIds.length > 0).length,
    total: contracts.length,
    sourceScanOnly: contracts.filter((contract) => contract.evidenceTier === 'SOURCE_SCAN_ONLY').length,
  };
}
