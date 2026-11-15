/**
 * ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md — §18 Phase 1 Barrel & Verification
 */

export * from './phase1FamilyManifest';
export * from './commandPreviewAdmission';
export * from './presentationHumanizer';

import { verifyProtectionLexemeSeparation } from '../sharedSemanticLexicon';
import { WARRANTY_RELATION_MEANINGS } from '../transitionalWarrantyRead';
import { operationAnswerContractCoverage } from '../../answerContract/operationAnswerContract';
import {
  ASK_PHASE1_FAMILY_MANIFEST_VERSION,
  verifyPhase1FamilyManifestCompleteness,
} from './phase1FamilyManifest';
import { ASK_COMMAND_PREVIEW_ADMISSION_VERSION } from './commandPreviewAdmission';
import { ASK_PRESENTATION_HUMANIZER_VERSION } from './presentationHumanizer';

export interface Phase1ContainmentSummary {
  readonly phase: 'PHASE_1_IMMEDIATE_CORRECTNESS_CONTAINMENT';
  readonly familyManifestVersion: string;
  readonly commandPreviewAdmissionVersion: string;
  readonly presentationHumanizerVersion: string;
  readonly warrantyMeaningsDefined: readonly string[];
  readonly protectionTokensSeparated: boolean;
  readonly familyManifestComplete: boolean;
  readonly selectedFamilyCount: number;
  readonly deferredFamilyCount: number;
  readonly answerContractCoverage: {
    readonly covered: number;
    readonly total: number;
    readonly sourceScanOnly: number;
  };
}

export function buildPhase1ContainmentSummary(): Phase1ContainmentSummary {
  const lexemeSeparation = verifyProtectionLexemeSeparation();
  const manifestCheck = verifyPhase1FamilyManifestCompleteness();
  const contractCoverage = operationAnswerContractCoverage();

  return {
    phase: 'PHASE_1_IMMEDIATE_CORRECTNESS_CONTAINMENT',
    familyManifestVersion: ASK_PHASE1_FAMILY_MANIFEST_VERSION,
    commandPreviewAdmissionVersion: ASK_COMMAND_PREVIEW_ADMISSION_VERSION,
    presentationHumanizerVersion: ASK_PRESENTATION_HUMANIZER_VERSION,
    warrantyMeaningsDefined: Object.keys(WARRANTY_RELATION_MEANINGS),
    protectionTokensSeparated: lexemeSeparation.valid,
    familyManifestComplete: manifestCheck.valid,
    selectedFamilyCount: manifestCheck.selectedCount,
    deferredFamilyCount: manifestCheck.deferredCount,
    answerContractCoverage: contractCoverage,
  };
}

export function verifyPhase1Invariants(): {
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
  const summary = buildPhase1ContainmentSummary();
  return {
    valid: issues.length === 0,
    issues,
    summary,
  };
}
