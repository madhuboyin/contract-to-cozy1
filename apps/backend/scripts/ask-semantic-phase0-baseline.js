#!/usr/bin/env node
/**
 * Phase 0 — Baseline and invariants CLI (ASK_COZY_CROSS_DOMAIN_SEMANTIC_ARCHITECTURE_FRD.md §18).
 *
 * Usage:
 *   node scripts/ask-semantic-phase0-baseline.js          Print Phase 0 baseline summary & validate invariants
 *   node scripts/ask-semantic-phase0-baseline.js --check  Exit 1 if any Phase 0 validator reports drift/issues
 *   node scripts/ask-semantic-phase0-baseline.js --json   Emit JSON report to stdout
 */
require('ts-node/register/transpile-only');

const { buildAskSemanticPhase0BaselineSummary } = require('../src/services/ask/semantic/phase0/index.ts');

const args = process.argv.slice(2);
const summary = buildAskSemanticPhase0BaselineSummary();
const allIssues = Object.entries(summary.validatorIssues).flatMap(([category, issues]) =>
  issues.map((issue) => `[${category}] ${issue}`),
);

if (args.includes('--json')) {
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(allIssues.length > 0 ? 1 : 0);
}

console.log('Ask Cozy Cross-Domain Semantic Architecture — Phase 0 Baseline & Invariants\n');
console.log(`Versions:`);
console.log(`  ontologyBaseline:        ${summary.versions.ontologyBaseline}`);
console.log(`  scalarFieldCoalescence:  ${summary.versions.scalarFieldCoalescence}`);
console.log(`  recognizerRetirement:    ${summary.versions.recognizerRetirement}`);
console.log(`  relationGovernance:      ${summary.versions.relationGovernance}`);
console.log(`  seededScenarioCatalogue: ${summary.versions.seededScenarioCatalogue}\n`);

console.log(`Inventory Counts:`);
console.log(`  domains (§5 + boundary):                        ${summary.counts.domains}`);
console.log(`  catalogued data-point entities (FR-ONT-1):      ${summary.counts.cataloguedEntities}`);
console.log(`  catalogued data-point fields (FR-ONT-2):        ${summary.counts.cataloguedFields}`);
console.log(`  capabilities & operations (FR-ONT-4):           ${summary.counts.capabilitiesAndOperations}`);
console.log(`  scalar field coalescence groups (FR-ONT-2):     ${summary.counts.scalarFieldCoalescenceGroups}`);
console.log(`  recognizer retirement entries (FR-ONT-8):       ${summary.counts.recognizerInventoryEntries} (${summary.counts.totalInventoriedRecognizerItems} live items)`);
console.log(`  semantic predicates with meaning tags:          ${summary.counts.semanticPredicatesWithMeaningTags}`);
console.log(`  relationship storage access sites (FR-ONT-7):   ${summary.counts.relationshipStorageAccessSites} (${summary.counts.directStorageSitesOutsideCanonicalAdapter} outside canonical adapter)`);
console.log(`  traversable relation paths (FR-ONT-3):          ${summary.counts.traversableRelationPaths}`);
console.log(`  dual-parent schema models flagged:              ${summary.counts.dualParentSchemaModels}`);
console.log(`  seeded property archetypes (FR-EVAL-1):         ${summary.counts.seededPropertyArchetypes}`);
console.log(`  independent semantic families (§5 coverage):    ${summary.counts.independentSemanticFamilies}`);
console.log(`  containment regression cases (not coverage):    ${summary.counts.containmentRegressionCases}\n`);

console.log(`Schema & Property-Context Reconciliation (FR-ONT-6):`);
console.log(`  Prisma models: ${summary.schemaReconciliation.totalPrismaModels} (${summary.schemaReconciliation.propertyScopedEntityCount} property-scoped: ${summary.schemaReconciliation.candidateEntityCount} candidate, ${summary.schemaReconciliation.excludedDefaultEntityCount} default-excluded)`);
console.log(`  Prisma enums:  ${summary.schemaReconciliation.totalPrismaEnums}`);
console.log(`  Property Context fact keys: ${summary.schemaReconciliation.propertyFactCatalogCount} (${summary.schemaReconciliation.propertyFactsMappedToDataPoints.length} mapped to data points, ${summary.schemaReconciliation.propertyFactsUncoveredByDataPointCatalogue.length} explicit uncovered/composite)\n`);

console.log(`Mechanical Completeness Proof:`);
console.log(`  discovered recognizer files:        ${summary.completenessProof.discoveredRecognizerFilesCount} (${summary.completenessProof.unaccountedRecognizerFiles.length} unaccounted)`);
console.log(`  discovered relation access files:   ${summary.completenessProof.discoveredRelationAccessFilesCount} (${summary.completenessProof.unaccountedRelationAccessFiles.length} unaccounted)`);
console.log(`  discovered scalar duplicate pairs:  ${summary.completenessProof.discoveredDuplicateScalarCandidatesCount} (${summary.completenessProof.unaccountedDuplicateScalarCandidates.length} unaccounted)`);
console.log(`  explicit operation domain mappings: ${summary.completenessProof.totalOperationsCount} (${summary.completenessProof.unmappedOperations.length} unmapped)`);
console.log(`  verified seeded archetype fixtures: ${summary.completenessProof.archetypeFixtureVerificationPassedCount}/${summary.counts.seededPropertyArchetypes}`);
console.log(`  verified seeded family executions:  ${summary.completenessProof.familyFixtureExecutionPassedCount}/${summary.counts.independentSemanticFamilies}\n`);

console.log(`Phase 0 Exit Criteria:`);
console.log(`  inventoriesGenerated:                   ${summary.exitCriteria.inventoriesGenerated}`);
console.log(`  contradictionsAndUncoveredDataExplicit: ${summary.exitCriteria.contradictionsAndUncoveredDataExplicit}`);
console.log(`  noNinetyPercentCompletionClaim:         ${summary.exitCriteria.noNinetyPercentCompletionClaim}\n`);

if (allIssues.length > 0) {
  console.error(`Phase 0 baseline validation failed with ${allIssues.length} issue(s):`);
  for (const issue of allIssues) console.error(`  - ${issue}`);
  process.exit(1);
}

console.log('Phase 0 baseline invariants verified (0 validator issues).');
process.exit(0);
