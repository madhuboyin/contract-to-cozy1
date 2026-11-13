import manifest from './answerContractManifest.json';
import type { AskOperationId, AskOperationResult } from '../askOperationRegistry';

interface OperationAnswerContract {
  operationId: string;
  allowedBlockTypes: string[];
  emittedBlockIds: string[];
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

/** Runtime half of FR-GATE-1/2; used only after semantic mismatch checks. */
export function matchesOperationAnswerContract(operationId: AskOperationId, result: AskOperationResult): boolean {
  const contract = CONTRACTS.get(operationId);
  if (!contract || result.blocks.length === 0) return false;
  const allowedTypes = new Set(contract.allowedBlockTypes);
  return result.blocks.every((block) => allowedTypes.has(block.type)
    && contract.emittedBlockIds.some((declaration) => idMatches(declaration, block.type, block.id)));
}

export function operationAnswerContractCoverage(): { covered: number; total: number } {
  const contracts = [...CONTRACTS.values()];
  return {
    covered: contracts.filter((contract) => contract.allowedBlockTypes.length > 0 && contract.emittedBlockIds.length > 0).length,
    total: contracts.length,
  };
}
