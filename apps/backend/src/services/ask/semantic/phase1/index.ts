/**
 * ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md — §18 Phase 1 Barrel & Verification
 */

export * from './phase1FamilyManifest';
export * from './commandPreviewAdmission';
export * from './presentationHumanizer';

import fs from 'node:fs';
import path from 'node:path';
import { verifyProtectionLexemeSeparation } from '../sharedSemanticLexicon';
import { WARRANTY_RELATION_MEANINGS } from '../transitionalWarrantyRead';
import { operationAnswerContractCoverage } from '../../answerContract/operationAnswerContract';
import {
  ASK_PHASE1_FAMILY_MANIFEST_VERSION,
  PHASE1_SELECTED_BASIC_READ_FAMILIES,
  verifyPhase1FamilyManifestCompleteness,
} from './phase1FamilyManifest';
import { ASK_COMMAND_PREVIEW_ADMISSION_VERSION } from './commandPreviewAdmission';
import { ASK_PRESENTATION_HUMANIZER_VERSION } from './presentationHumanizer';

const DEFAULT_BACKEND_ROOT = path.resolve(__dirname, '../../../../..');

const PHASE1_CAPABILITY_HANDLER_FILES: Record<string, string> = {
  'data-point-read.read': 'src/services/ask/handlers/dataPointRead.handler.ts',
  'saved-results.read': 'src/services/ask/handlers/savedResults.handler.ts',
};

function collectTypeScriptSourceFiles(dir: string, results: string[] = []): string[] {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      if (fullPath.endsWith(path.join('src', 'services', 'ask', 'semantic'))) continue;
      collectTypeScriptSourceFiles(fullPath, results);
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function verifyNoUnguardedLegacyWarrantyWrites(backendRoot: string = DEFAULT_BACKEND_ROOT): {
  readonly valid: boolean;
  readonly unguardedFiles: readonly string[];
} {
  const srcDir = path.join(backendRoot, 'src');
  const files = collectTypeScriptSourceFiles(srcDir);
  const unguardedFiles: string[] = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, 'utf8');
    const hasInventoryWrite = /inventoryItem\.(?:create|update|upsert|createMany|updateMany)\s*\(/.test(source);
    if (!hasInventoryWrite) continue;
    const writesNonNullWarrantyId = /\bdata\s*:\s*\{[\s\S]{0,800}?\bwarrantyId\s*:\s*(?!null\b)/.test(source);
    const hasContainmentGuard = /\bassertValidTransitionalWarrantyLinkWrite\b/.test(source);
    if (writesNonNullWarrantyId && !hasContainmentGuard) {
      unguardedFiles.push(path.relative(backendRoot, filePath).replace(/\\/g, '/'));
    }
  }

  return {
    valid: unguardedFiles.length === 0,
    unguardedFiles,
  };
}

export function verifyPhase1RuntimeWiring(backendRoot: string = DEFAULT_BACKEND_ROOT): {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly verifiedHandlerFiles: readonly string[];
} {
  const issues: string[] = [];
  const verifiedHandlerFiles: string[] = [];

  const requiredChecks: Array<{
    relativePath: string;
    requiredTokens: readonly string[];
  }> = [
    {
      relativePath: 'src/services/ask/handlers/dataPointRead.handler.ts',
      requiredTokens: [
        'dataPointReadGrammarAgreement',
        'warrantyShapeGrammarAgreement',
        'buildSemanticReadReceipt',
        'verifySemanticReadReceiptEntailment',
      ],
    },
    {
      relativePath: 'src/services/ask/handlers/savedResults.handler.ts',
      requiredTokens: [
        'savedResultsGrammarAgreement',
        'buildSemanticReadReceipt',
        'verifySemanticReadReceiptEntailment',
      ],
    },
  ];

  for (const check of requiredChecks) {
    const fullPath = path.join(backendRoot, check.relativePath);
    if (!fs.existsSync(fullPath)) {
      issues.push(`Missing Phase 1 runtime handler: ${check.relativePath}`);
      continue;
    }
    const source = fs.readFileSync(fullPath, 'utf8');
    const missingTokens = check.requiredTokens.filter((token) => !source.includes(token));
    if (missingTokens.length > 0) {
      issues.push(`Phase 1 handler ${check.relativePath} is missing runtime wiring: ${missingTokens.join(', ')}`);
    } else {
      verifiedHandlerFiles.push(check.relativePath);
    }
  }

  for (const family of PHASE1_SELECTED_BASIC_READ_FAMILIES) {
    const handlerPath = PHASE1_CAPABILITY_HANDLER_FILES[family.canonicalAdapterKey];
    if (!handlerPath) {
      issues.push(`Selected Phase 1 family ${family.familyId} (${family.canonicalAdapterKey}) has no mapped runtime handler.`);
    } else if (!verifiedHandlerFiles.includes(handlerPath)) {
      issues.push(`Selected Phase 1 family ${family.familyId} maps to unverified handler ${handlerPath}.`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    verifiedHandlerFiles,
  };
}

export interface Phase1ContainmentSummary {
  readonly phase: 'PHASE_1_IMMEDIATE_CORRECTNESS_CONTAINMENT';
  readonly familyManifestVersion: string;
  readonly commandPreviewAdmissionVersion: string;
  readonly presentationHumanizerVersion: string;
  readonly warrantyMeaningsDefined: readonly string[];
  readonly warrantyCanonicalizationStatus: 'TRANSITIONAL_PENDING_22_1_OWNER_RULING';
  readonly protectionTokensSeparated: boolean;
  readonly familyManifestComplete: boolean;
  readonly runtimeWiringVerified: boolean;
  readonly legacyWarrantyWritesContained: boolean;
  readonly selectedFamilyCount: number;
  readonly deferredFamilyCount: number;
  readonly answerContractCoverage: {
    readonly covered: number;
    readonly total: number;
    readonly sourceScanOnly: number;
  };
}

export function buildPhase1ContainmentSummary(backendRoot: string = DEFAULT_BACKEND_ROOT): Phase1ContainmentSummary {
  const lexemeSeparation = verifyProtectionLexemeSeparation();
  const manifestCheck = verifyPhase1FamilyManifestCompleteness();
  const runtimeWiring = verifyPhase1RuntimeWiring(backendRoot);
  const writeContainment = verifyNoUnguardedLegacyWarrantyWrites(backendRoot);
  const contractCoverage = operationAnswerContractCoverage();

  return {
    phase: 'PHASE_1_IMMEDIATE_CORRECTNESS_CONTAINMENT',
    familyManifestVersion: ASK_PHASE1_FAMILY_MANIFEST_VERSION,
    commandPreviewAdmissionVersion: ASK_COMMAND_PREVIEW_ADMISSION_VERSION,
    presentationHumanizerVersion: ASK_PRESENTATION_HUMANIZER_VERSION,
    warrantyMeaningsDefined: Object.keys(WARRANTY_RELATION_MEANINGS),
    warrantyCanonicalizationStatus: 'TRANSITIONAL_PENDING_22_1_OWNER_RULING',
    protectionTokensSeparated: lexemeSeparation.valid,
    familyManifestComplete: manifestCheck.valid,
    runtimeWiringVerified: runtimeWiring.valid,
    legacyWarrantyWritesContained: writeContainment.valid,
    selectedFamilyCount: manifestCheck.selectedCount,
    deferredFamilyCount: manifestCheck.deferredCount,
    answerContractCoverage: contractCoverage,
  };
}

export function verifyPhase1Invariants(backendRoot: string = DEFAULT_BACKEND_ROOT): {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly summary: Phase1ContainmentSummary;
} {
  const issues: string[] = [];
  const lexemeSeparation = verifyProtectionLexemeSeparation();
  if (!lexemeSeparation.valid) {
    issues.push(...lexemeSeparation.violations);
  }
  const manifestCheck = verifyPhase1FamilyManifestCompleteness();
  if (!manifestCheck.valid) {
    if (manifestCheck.missingDomainGroups.length > 0) {
      issues.push(`Missing §5 domain groups in Phase 1 manifest: ${manifestCheck.missingDomainGroups.join(', ')}`);
    }
    if (manifestCheck.missingFalseDeclineCategories.length > 0) {
      issues.push(`Missing false-decline categories in Phase 1 manifest: ${manifestCheck.missingFalseDeclineCategories.join(', ')}`);
    }
  }
  if (WARRANTY_RELATION_MEANINGS.PROPERTY_WHOLE_HOME_PLAN.newWriteStatus !== 'PROHIBITED_LEGACY_AMBIGUOUS_LINK') {
    issues.push('Legacy InventoryItem.warrantyId write containment is not set to PROHIBITED_LEGACY_AMBIGUOUS_LINK');
  }
  const writeContainment = verifyNoUnguardedLegacyWarrantyWrites(backendRoot);
  if (!writeContainment.valid) {
    issues.push(`Unguarded legacy InventoryItem.warrantyId write(s) detected: ${writeContainment.unguardedFiles.join(', ')}`);
  }
  const runtimeWiring = verifyPhase1RuntimeWiring(backendRoot);
  if (!runtimeWiring.valid) {
    issues.push(...runtimeWiring.issues);
  }
  const summary = buildPhase1ContainmentSummary(backendRoot);
  return {
    valid: issues.length === 0,
    issues,
    summary,
  };
}
