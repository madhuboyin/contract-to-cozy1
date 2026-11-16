/**
 * ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md — §18 Phase 1 Barrel & Verification
 */

export * from './basicReadFamilyManifest';
export * from './commandPreviewAdmission';
export * from './presentationHumanizer';

import fs from 'node:fs';
import path from 'node:path';
import { verifyProtectionLexemeSeparation } from '../sharedSemanticLexicon';
import { WARRANTY_RELATION_MEANINGS } from '../transitionalWarrantyRead';
import { operationAnswerContractCoverage } from '../../answerContract/operationAnswerContract';
import { parseDeterministicSemanticRequest } from '../deterministicSemanticParser';
import {
  dataPointReadGrammarAgreement,
  savedResultsGrammarAgreement,
  warrantyShapeGrammarAgreement,
} from '../legacyGrammarAgreement';
import { planDataPointQuery } from '../../dataPoint/dataPointQueryPlan';
import { resolveDataPoint } from '../../dataPoint/dataPointCatalogue';
import { planShape789 } from '../../dataPoint/dataPointShapes789';
import {
  ASK_BASIC_READ_FAMILY_MANIFEST_VERSION,
  SELECTED_BASIC_READ_FAMILIES,
  verifyBasicReadFamilyManifestCompleteness,
} from './basicReadFamilyManifest';
import { ASK_COMMAND_PREVIEW_ADMISSION_VERSION } from './commandPreviewAdmission';
import { ASK_PRESENTATION_HUMANIZER_VERSION } from './presentationHumanizer';

const DEFAULT_BACKEND_ROOT = path.resolve(__dirname, '../../../../..');

const BASIC_READ_CAPABILITY_HANDLER_FILES: Record<string, string> = {
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
    const writesNonNullWarrantyId = /\bdata\s*:\s*\{[\s\S]{0,800}?\bwarrantyId\s*:(?!\s*null\b)\s*/.test(source);
    const untrustedPayloadName = String.raw`(?:patch|body|input|payload|requestData|data)`;
    const writesInlineSpreadPayload = new RegExp(`inventoryItem\\.(?:create|update|upsert|createMany|updateMany)\\s*\\([\\s\\S]{0,800}?\\bdata\\s*:\\s*\\{[\\s\\S]{0,400}?\\.\\.\\.\\s*${untrustedPayloadName}\\b`).test(source);
    const spreadPayloadNames = [...source.matchAll(new RegExp(`\\b(?:const|let)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;]+)?=\\s*\\{[\\s\\S]{0,400}?\\.\\.\\.\\s*${untrustedPayloadName}\\b`, 'g'))].map((match) => match[1]);
    const writesUnsanitizedNamedSpread = spreadPayloadNames.some((payloadName) => {
      const usedByInventoryWrite = new RegExp(`inventoryItem\\.(?:create|update|upsert|createMany|updateMany)\\s*\\([\\s\\S]{0,800}?\\bdata\\s*:\\s*${payloadName}\\b`).test(source);
      const stripsLegacyField = new RegExp(`delete\\s+${payloadName}\\.warrantyId\\b`).test(source);
      return usedByInventoryWrite && !stripsLegacyField;
    });
    // A guard elsewhere in the file must never bless a later write. Phase 1
    // prohibits the storage write itself; callers must use Warranty.inventoryItemId.
    if (writesNonNullWarrantyId || writesInlineSpreadPayload || writesUnsanitizedNamedSpread) {
      unguardedFiles.push(path.relative(backendRoot, filePath).replace(/\\/g, '/'));
    }
  }

  return {
    valid: unguardedFiles.length === 0,
    unguardedFiles,
  };
}

export function verifyContainmentRuntimeWiring(backendRoot: string = DEFAULT_BACKEND_ROOT): {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly verifiedHandlerFiles: readonly string[];
  readonly verifiedFamilyIds: readonly string[];
} {
  const issues: string[] = [];
  const verifiedHandlerFiles: string[] = [];
  const verifiedFamilyIds: string[] = [];

  const requiredChecks: Array<{
    relativePath: string;
    requiredTokens: readonly string[];
    forbiddenTokens?: readonly string[];
  }> = [
    {
      relativePath: 'src/services/ask/handlers/dataPointRead.handler.ts',
      requiredTokens: [
        'dataPointReadGrammarAgreement',
        'warrantyShapeGrammarAgreement',
        'buildSemanticReadReceipt',
        'verifySemanticReadReceiptEntailment',
        'agreement?.facet?.id',
        '!queryAgreement || queryAgreement.outcome !== \'AGREE\'',
        '!singlePointAgreement || singlePointAgreement.outcome !== \'AGREE\'',
      ],
      forbiddenTokens: [
        'agreement.plan.outcome === \'MATCH\' && agreement.outcome !== \'AGREE\'',
      ],
    },
    {
      relativePath: 'src/services/ask/handlers/savedResults.handler.ts',
      requiredTokens: [
        'savedResultsGrammarAgreement',
        'buildSemanticReadReceipt',
        'verifySemanticReadReceiptEntailment',
        'requestClass: \'CAPABILITY\'',
        'operationAdapter: \'saved-results.read\'',
        'deps?.propertyAccess?.role',
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
    const forbiddenFound = (check.forbiddenTokens ?? []).filter((token) => source.includes(token));
    if (missingTokens.length > 0) {
      issues.push(`Phase 1 handler ${check.relativePath} is missing runtime wiring: ${missingTokens.join(', ')}`);
    } else if (forbiddenFound.length > 0) {
      issues.push(`Phase 1 handler ${check.relativePath} retains fail-open guard(s): ${forbiddenFound.join(', ')}`);
    } else {
      verifiedHandlerFiles.push(check.relativePath);
    }
  }

  for (const family of SELECTED_BASIC_READ_FAMILIES) {
    const handlerPath = BASIC_READ_CAPABILITY_HANDLER_FILES[family.canonicalAdapterKey];
    if (!handlerPath) {
      issues.push(`Selected Phase 1 family ${family.familyId} (${family.canonicalAdapterKey}) has no mapped runtime handler.`);
      continue;
    }
    if (!verifiedHandlerFiles.includes(handlerPath)) {
      issues.push(`Selected Phase 1 family ${family.familyId} maps to unverified handler ${handlerPath}.`);
      continue;
    }

    let allExamplesAgreed = family.representativeExamples.length > 0;
    for (const prompt of family.representativeExamples) {
      const plan = parseDeterministicSemanticRequest(prompt);
      if (plan.outcome !== 'MATCH' || !plan.facets[0]?.confidenceSignals.grammarComplete) {
        issues.push(`Phase 1 family ${family.familyId} prompt "${prompt}" failed deterministic grammar parse.`);
        allExamplesAgreed = false;
        continue;
      }
      if (family.canonicalAdapterKey === 'saved-results.read') {
        const agreement = savedResultsGrammarAgreement(prompt, 'LIST');
        if (agreement.outcome !== 'AGREE' || !agreement.facet) {
          issues.push(`Phase 1 family ${family.familyId} prompt "${prompt}" failed saved-results grammar agreement (${agreement.reasonCode}).`);
          allExamplesAgreed = false;
        }
        continue;
      }
      const shapePlan = planShape789(prompt);
      if (shapePlan && (shapePlan.shape === 'NO_WARRANTY' || shapePlan.shape === 'HAS_WARRANTY')) {
        const agreement = warrantyShapeGrammarAgreement(prompt, shapePlan);
        if (agreement.outcome !== 'AGREE' || !agreement.facet) {
          issues.push(`Phase 1 family ${family.familyId} prompt "${prompt}" failed warranty shape agreement (${agreement.reasonCode}).`);
          allExamplesAgreed = false;
        }
        continue;
      }
      const queryOutcome = planDataPointQuery(prompt, new Date('2026-11-15T12:00:00Z'));
      if (queryOutcome.kind === 'PLAN') {
        const projection = queryOutcome.plan.shape === 'AGGREGATE' && queryOutcome.plan.aggregate?.fn === 'COUNT'
          ? 'COUNT'
          : /\bdetails?\b/i.test(prompt) ? 'DETAIL' : 'LIST';
        const agreement = dataPointReadGrammarAgreement(prompt, {
          prismaEntity: queryOutcome.plan.template.entity,
          projection,
        });
        if (agreement?.outcome !== 'AGREE' || !agreement.facet) {
          issues.push(`Phase 1 family ${family.familyId} prompt "${prompt}" failed query grammar agreement (${agreement?.reasonCode ?? 'UNMAPPED_ENTITY'}).`);
          allExamplesAgreed = false;
        }
        continue;
      }
      const point = resolveDataPoint(prompt);
      if (point) {
        const agreement = dataPointReadGrammarAgreement(prompt, {
          prismaEntity: point.entity,
          projection: 'DETAIL',
        });
        if (agreement?.outcome !== 'AGREE' || !agreement.facet) {
          issues.push(`Phase 1 family ${family.familyId} prompt "${prompt}" failed single-point grammar agreement (${agreement?.reasonCode ?? 'UNMAPPED_ENTITY'}).`);
          allExamplesAgreed = false;
        }
        continue;
      }
      issues.push(`Phase 1 family ${family.familyId} prompt "${prompt}" has no executable route through ${family.canonicalAdapterKey}.`);
      allExamplesAgreed = false;
    }

    if (allExamplesAgreed) {
      verifiedFamilyIds.push(family.familyId);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    verifiedHandlerFiles,
    verifiedFamilyIds,
  };
}

export interface ContainmentSummary {
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

export function buildContainmentSummary(backendRoot: string = DEFAULT_BACKEND_ROOT): ContainmentSummary {
  const lexemeSeparation = verifyProtectionLexemeSeparation();
  const manifestCheck = verifyBasicReadFamilyManifestCompleteness();
  const runtimeWiring = verifyContainmentRuntimeWiring(backendRoot);
  const writeContainment = verifyNoUnguardedLegacyWarrantyWrites(backendRoot);
  const contractCoverage = operationAnswerContractCoverage();

  return {
    phase: 'PHASE_1_IMMEDIATE_CORRECTNESS_CONTAINMENT',
    familyManifestVersion: ASK_BASIC_READ_FAMILY_MANIFEST_VERSION,
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

export function verifyContainmentInvariants(backendRoot: string = DEFAULT_BACKEND_ROOT): {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly summary: ContainmentSummary;
} {
  const issues: string[] = [];
  const lexemeSeparation = verifyProtectionLexemeSeparation();
  if (!lexemeSeparation.valid) {
    issues.push(...lexemeSeparation.violations);
  }
  const manifestCheck = verifyBasicReadFamilyManifestCompleteness();
  if (!manifestCheck.valid) {
    if (manifestCheck.missingDomainGroups.length > 0) {
      issues.push(`Missing §5 domain groups in Phase 1 manifest: ${manifestCheck.missingDomainGroups.join(', ')}`);
    }
    if (manifestCheck.missingFalseDeclineCategories.length > 0) {
      issues.push(`Missing false-decline categories in Phase 1 manifest: ${manifestCheck.missingFalseDeclineCategories.join(', ')}`);
    }
  }
  if (WARRANTY_RELATION_MEANINGS.PROPERTY_WHOLE_HOME_PLAN.canonicalStoragePath !== 'WarrantyApplicability.warrantyId + inventoryItemId with status=COVERED') {
    issues.push('Whole-home warranty applicability is not assigned to the canonical WarrantyApplicability relation');
  }
  const writeContainment = verifyNoUnguardedLegacyWarrantyWrites(backendRoot);
  if (!writeContainment.valid) {
    issues.push(`Unguarded legacy InventoryItem.warrantyId write(s) detected: ${writeContainment.unguardedFiles.join(', ')}`);
  }
  const runtimeWiring = verifyContainmentRuntimeWiring(backendRoot);
  if (!runtimeWiring.valid) {
    issues.push(...runtimeWiring.issues);
  }
  const summary = buildContainmentSummary(backendRoot);
  return {
    valid: issues.length === 0,
    issues,
    summary,
  };
}
