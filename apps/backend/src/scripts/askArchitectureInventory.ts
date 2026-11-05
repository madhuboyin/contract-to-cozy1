/**
 * Read-only Ask Cozy architecture inventory (Findings Implementation Plan, Phase 0).
 *
 *   npm run audit:ask-architecture -- --out <file.json>
 *
 * Use --out: importing the Ask facade loads modules whose logger prints warnings (for example a missing GEMINI_API_KEY) to stdout, which would
 * otherwise be interleaved with the JSON report.
 *
 * Emits registry counts, every Ask operation with no owning Skill (with the authoritative metadata that exists for it), and the issues the
 * EXISTING registry validators report. It needs no network, database, Redis or model access, and it never writes. Counts are read from the
 * authoritative registries (and, for the frontend renderer map, from the TypeScript AST) rather than from grep call-site counts. The output
 * is a point-in-time measurement; it is not a committed source of truth, so regenerate it instead of copying numbers into documents.
 *
 * Classification is deliberately conservative: an operation is given a `metadataClassification` only when existing registry metadata
 * establishes it. Anything else is reported as UNCLASSIFIED (never inferred from a name or an incidental call site) and is resolved in Phase 1.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
// Importing the facade registers every handler (the side-effect registration this plan's Phase 2 later makes explicit).
import '../services/ask/askOrchestrator.service';
import {
  ASK_INTERNAL_OPERATION_IDS,
  ASK_OPERATION_DEFINITIONS,
  isAskMessageRoutableOperation,
  validateAskOperationDefinitions,
  type AskOperationId,
} from '../services/ask/askOperationRegistry';
import { ASK_DOMAIN_COMMAND_REGISTRY, getAskDomainCommandByOperation, validateAskDomainCommandRegistry } from '../services/ask/askDomainCommandRegistry';
import { validateCapabilityHandlerRegistry } from '../services/ask/capabilityHandlerRegistry';
import { validateConfirmCapabilityHandlerRegistry } from '../services/ask/confirmCapabilityHandlerRegistry';
import { SKILL_DEFINITIONS, getSkillForOperation, validateSkillDefinitions } from '../services/skills/skillRegistry';
import { validateSkillAdapterDefinitions } from '../services/skills/adapters/skillAdapterRegistry';
import { KNOWN_UNGOVERNED_OPERATIONS, validateSkillOperationGovernanceCoverage } from '../services/intelligence/skillOperationGovernance.contract';
import { AskPresentationBlockSchema } from '../productFramework/ask/ask.contract';
import { SUGGESTED_NEXT_ACTION_PRODUCERS } from '../services/ask/suggestedActions/suggestedNextActionProducers';
import { ELIGIBILITY_RULE_ORDER } from '../services/ask/suggestedActions/suggestedNextActionEligibility';

const BACKEND_ROOT = resolve(__dirname, '../..');
const HANDLER_DIRECTORY = join(BACKEND_ROOT, 'src/services/ask/handlers');
const RENDERER_REGISTRY_FILE = resolve(BACKEND_ROOT, '../frontend/src/components/ask/blocks/registry.tsx');

/** Existing-metadata classification only. UNCLASSIFIED means "no authoritative metadata decides this" and is resolved in Phase 1. */
export type MetadataClassification =
  | 'NO_ROLE_FLOOR_BOUNDARY'
  | 'INTERNAL_COMMAND'
  | 'INTERNAL_NOT_MESSAGE_ROUTABLE'
  | 'MESSAGE_ROUTABLE_COMMAND'
  | 'UNCLASSIFIED';

export interface SkilllessOperationRow {
  operationId: AskOperationId;
  propertyRoleFloor: string | null;
  messageRoutable: boolean;
  inInternalOperationSet: boolean;
  inKnownUngovernedList: boolean;
  domainCommandId: string | null;
  executionMode: string;
  metadataClassification: MetadataClassification;
  classificationBasis: string;
}

export interface AskArchitectureInventory {
  counts: Record<string, number>;
  skilllessOperations: SkilllessOperationRow[];
  skilllessByClassification: Record<string, number>;
  /** Property-scoped skill-less operations that are neither Skill-owned nor listed in KNOWN_UNGOVERNED_OPERATIONS, and the reverse. */
  governanceDrift: { skilllessUnlisted: AskOperationId[]; listedButSkillOwned: AskOperationId[]; listedButUnknown: string[] };
  validatorIssues: Record<string, string[]>;
}

function classify(operationId: AskOperationId): Pick<SkilllessOperationRow, 'metadataClassification' | 'classificationBasis'> {
  const definition = ASK_OPERATION_DEFINITIONS[operationId];
  const command = getAskDomainCommandByOperation(operationId);
  if (definition.propertyRoleFloor === null) {
    return { metadataClassification: 'NO_ROLE_FLOOR_BOUNDARY', classificationBasis: 'propertyRoleFloor is null (orchestrator-native boundary/discovery response)' };
  }
  const internal = ASK_INTERNAL_OPERATION_IDS.has(operationId);
  if (internal && command) {
    return { metadataClassification: 'INTERNAL_COMMAND', classificationBasis: 'ASK_INTERNAL_OPERATION_IDS member with a domain command registry entry' };
  }
  if (internal) {
    return { metadataClassification: 'INTERNAL_NOT_MESSAGE_ROUTABLE', classificationBasis: 'ASK_INTERNAL_OPERATION_IDS member without a domain command; launch-only vs declared-action-only vs capture is not recorded in metadata' };
  }
  if (command) {
    return { metadataClassification: 'MESSAGE_ROUTABLE_COMMAND', classificationBasis: 'message-routable with a domain command registry entry' };
  }
  return { metadataClassification: 'UNCLASSIFIED', classificationBasis: 'message-routable, property-scoped, no domain command; no registry field states whether it is a read, a launch, or something else' };
}

export function countRendererKeysFromSource(sourceText: string): number {
  const file = ts.createSourceFile('registry.tsx', sourceText, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  let count: number | null = null;
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'ASK_BLOCK_RENDERERS'
      && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      count = node.initializer.properties.filter((property) => !ts.isSpreadAssignment(property)).length;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (count === null) throw new Error('ASK_BLOCK_RENDERERS object literal not found in the frontend renderer registry');
  return count;
}

export function buildAskArchitectureInventory(): AskArchitectureInventory {
  const operationIds = Object.keys(ASK_OPERATION_DEFINITIONS) as AskOperationId[];
  const handlerFiles = readdirSync(HANDLER_DIRECTORY).filter((name) => name.endsWith('.handler.ts'));
  const commands = Object.values(ASK_DOMAIN_COMMAND_REGISTRY);

  const counts: Record<string, number> = {
    operations: operationIds.length,
    skills: Object.keys(SKILL_DEFINITIONS).length,
    capabilityHandlerFiles: handlerFiles.length,
    distinctOperationAdapterKeys: new Set(operationIds.map((id) => ASK_OPERATION_DEFINITIONS[id].adapterKey)).size,
    domainCommands: commands.length,
    distinctConfirmAdapterKeys: new Set(commands.map((command) => command.adapterKey)).size,
    presentationBlocks: AskPresentationBlockSchema.options.length,
    blockRenderers: countRendererKeysFromSource(readFileSync(RENDERER_REGISTRY_FILE, 'utf8')),
    suggestedActionProducers: SUGGESTED_NEXT_ACTION_PRODUCERS.length,
    eligibilityRules: ELIGIBILITY_RULE_ORDER.length,
    knownUngovernedOperations: KNOWN_UNGOVERNED_OPERATIONS.length,
  };

  const known = new Set<string>(KNOWN_UNGOVERNED_OPERATIONS);
  const skilllessOperations = operationIds
    .filter((operationId) => !getSkillForOperation(operationId))
    .sort()
    .map((operationId): SkilllessOperationRow => {
      const definition = ASK_OPERATION_DEFINITIONS[operationId];
      return {
        operationId,
        propertyRoleFloor: definition.propertyRoleFloor,
        messageRoutable: isAskMessageRoutableOperation(operationId),
        inInternalOperationSet: ASK_INTERNAL_OPERATION_IDS.has(operationId),
        inKnownUngovernedList: known.has(operationId),
        domainCommandId: getAskDomainCommandByOperation(operationId)?.id ?? null,
        executionMode: definition.executionMode,
        ...classify(operationId),
      };
    });

  const skilllessByClassification: Record<string, number> = {};
  for (const row of skilllessOperations) {
    skilllessByClassification[row.metadataClassification] = (skilllessByClassification[row.metadataClassification] ?? 0) + 1;
  }
  counts.skilllessOperations = skilllessOperations.length;

  const governanceDrift = {
    skilllessUnlisted: skilllessOperations.filter((row) => row.propertyRoleFloor !== null && !row.inKnownUngovernedList).map((row) => row.operationId),
    listedButSkillOwned: operationIds.filter((operationId) => known.has(operationId) && getSkillForOperation(operationId)),
    listedButUnknown: [...known].filter((operationId) => !(operationId in ASK_OPERATION_DEFINITIONS)),
  };

  // The existing validators are called as-is; none of their rules is reimplemented here.
  const validatorIssues: Record<string, string[]> = {
    validateAskOperationDefinitions: validateAskOperationDefinitions(),
    validateAskDomainCommandRegistry: validateAskDomainCommandRegistry(),
    validateCapabilityHandlerRegistry: validateCapabilityHandlerRegistry(),
    validateConfirmCapabilityHandlerRegistry: validateConfirmCapabilityHandlerRegistry(),
    validateSkillDefinitions: validateSkillDefinitions(),
    validateSkillAdapterDefinitions: validateSkillAdapterDefinitions(),
    validateSkillOperationGovernanceCoverage: validateSkillOperationGovernanceCoverage({
      skillCoversOperation: (operationId) => getSkillForOperation(operationId) !== undefined,
    }),
  };

  return { counts, skilllessOperations, skilllessByClassification, governanceDrift, validatorIssues };
}

function main(): void {
  const inventory = buildAskArchitectureInventory();
  const outIndex = process.argv.indexOf('--out');
  const report = `${JSON.stringify(inventory, null, 2)}\n`;
  if (outIndex >= 0 && process.argv[outIndex + 1]) writeFileSync(resolve(process.argv[outIndex + 1]), report);
  else process.stdout.write(report);
  const issueCount = Object.values(inventory.validatorIssues).reduce((total, issues) => total + issues.length, 0);
  // Importing the Ask facade loads modules that may hold open handles; this is a one-shot report, so exit explicitly.
  process.exit(issueCount > 0 ? 1 : 0);
}

if (require.main === module) main();
