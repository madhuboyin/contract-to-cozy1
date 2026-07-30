'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE,
  evidenceConfidenceForFinding,
  validateRetroactiveDisposition,
} = require('../../src/services/projectCompliance/retroactiveCompliancePolicy.ts');
const {
  CreateManualFlagSchema,
  UpdateFlagSchema,
} = require('../../src/validators/permitTracker.validators.ts');

test('missing available records is explicitly non-diagnostic', () => {
  assert.match(NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE, /currently available/i);
  assert.match(NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE, /does not establish/i);
  assert.doesNotMatch(NOT_FOUND_IN_AVAILABLE_RECORDS_MESSAGE, /is illegal|was illegal/i);
});

test('authority-backed terminal dispositions require source, evidence, and observation date', () => {
  const base = {
    currentStatus: 'INVESTIGATING',
    nextStatus: 'CONFIRMED_UNPERMITTED',
    authorityOutcome: 'CONFIRMED_UNPERMITTED',
    researchChannel: 'MUNICIPAL_AUTHORITY',
    researchSourceReference: 'Building department letter 2026-07-29',
    evidenceDocumentIds: ['document-1'],
  };
  assert.match(validateRetroactiveDisposition(base)[0], /municipal authority/i);
  assert.deepEqual(validateRetroactiveDisposition({
    ...base,
    authorityObservedAt: '2026-07-29',
  }), []);
});

test('matched authoritative permit can resolve permitted status without an illegality inference', () => {
  assert.deepEqual(validateRetroactiveDisposition({
    currentStatus: 'INVESTIGATING',
    nextStatus: 'CONFIRMED_PERMITTED',
    resolvedByPermitId: 'permit-1',
  }), []);
});

test('dismissal and remediation are evidence governed', () => {
  assert.equal(validateRetroactiveDisposition({
    currentStatus: 'INVESTIGATING',
    nextStatus: 'DISMISSED',
    resolutionNotes: 'Date predates available online records.',
  }).length, 1);
  assert.deepEqual(validateRetroactiveDisposition({
    currentStatus: 'INVESTIGATING',
    nextStatus: 'DISMISSED',
    resolutionNotes: 'Closing file establishes the work predates the searchable range.',
    evidenceDocumentIds: ['document-1'],
  }), []);
  assert.equal(validateRetroactiveDisposition({
    currentStatus: 'CONFIRMED_UNPERMITTED',
    nextStatus: 'REMEDIATED',
    remediationCaseId: 'case-1',
    evidenceDocumentIds: ['document-1'],
  }).length, 1);
});

test('evidence confidence improves without overstating record search results', () => {
  assert.equal(evidenceConfidenceForFinding({
    recordSearchOutcome: 'NOT_FOUND_IN_AVAILABLE_RECORDS',
  }), 'MEDIUM');
  assert.equal(evidenceConfidenceForFinding({
    recordSearchOutcome: 'INCONCLUSIVE',
    evidenceDocumentIds: ['document-1'],
  }), 'HIGH');
  assert.equal(evidenceConfidenceForFinding({
    recordSearchOutcome: 'MATCH_FOUND',
    resolvedByPermitId: 'permit-1',
  }), 'AUTHORITY_CONFIRMED');
});

test('historical intake captures origin and stage and constrains search provenance', () => {
  assert.equal(CreateManualFlagSchema.safeParse({
    workType: 'ROOM_ADDITION',
    disclosureRisk: 'HIGH',
    workOrigin: 'PRIOR_OWNER',
    workStage: 'COMPLETED',
    recordSearchOutcome: 'NOT_SEARCHED',
  }).success, true);
  assert.equal(CreateManualFlagSchema.safeParse({
    workType: 'ROOM_ADDITION',
    disclosureRisk: 'HIGH',
    workOrigin: 'PRIOR_OWNER',
    workStage: 'COMPLETED',
    recordSearchOutcome: 'NOT_FOUND_IN_AVAILABLE_RECORDS',
  }).success, false);
  assert.equal(UpdateFlagSchema.safeParse({
    recordSearchOutcome: 'INCONCLUSIVE',
    researchChannel: 'LICENSED_PROFESSIONAL',
  }).success, true);
});

test('remediation conversion creates a Renovation Case but never an active Project', () => {
  const service = fs.readFileSync(
    path.join(__dirname, '../../src/services/permitTracker.service.ts'),
    'utf8',
  );
  const method = service.slice(service.indexOf('async createRemediationCase'));
  assert.match(method, /renovationCase\.create/);
  assert.match(method, /lifecycle: 'REQUIREMENTS_RESEARCH'/);
  assert.match(method, /historicalResearchOnly: true/);
  assert.doesNotMatch(method, /projectRecord\.create/);
});

test('disclosure package includes unknown, dismissed, and resolved audit outcomes', () => {
  const worker = fs.readFileSync(
    path.join(__dirname, '../../../workers/src/jobs/generatePermitDisclosure.job.ts'),
    'utf8',
  );
  assert.match(worker, /where: \{ propertyId \}/);
  assert.match(worker, /recordSearchOutcome: true/);
  assert.match(worker, /authorityOutcome: true/);
  assert.match(worker, /dispositionAt: true/);
  assert.match(worker, /does not establish that prior work was unpermitted or unlawful/i);
});

test('later open-data and document matches reconcile prior unknown findings', () => {
  const detection = fs.readFileSync(
    path.join(__dirname, '../../src/services/permitDetection.service.ts'),
    'utf8',
  );
  assert.match(detection, /matchingPermit\.source === 'OPEN_DATA_API' \|\| matchingPermit\.isVerified/);
  assert.match(detection, /DOCUMENT_WORK_TYPE_AND_DATE/);
  assert.match(detection, /OPEN_DATA_WORK_TYPE_AND_DATE/);
  assert.match(detection, /recordSearchOutcome: 'MATCH_FOUND'/);
  assert.match(detection, /authorityMatch \? 'CONFIRMED_PERMITTED' : 'INVESTIGATING'/);
});

test('retroactive advisor copy reports evidence state rather than diagnosing illegality', () => {
  const summaryBuilder = fs.readFileSync(
    path.join(__dirname, '../../src/homeRenovationAdvisor/engine/summary/summaryBuilder.service.ts'),
    'utf8',
  );
  assert.match(summaryBuilder, /Reported Structural Permit Gap/);
  assert.match(summaryBuilder, /before drawing a compliance conclusion/);
  assert.match(summaryBuilder, /does not determine that the work was unlawful/);
});

test('inspection write-back creates an unknown research finding, not an illegality diagnosis', () => {
  const writeBack = fs.readFileSync(
    path.join(__dirname, '../../src/services/inspectionWriteBack.service.ts'),
    'utf8',
  );
  assert.match(writeBack, /status: 'UNKNOWN'/);
  assert.match(writeBack, /NOT_FOUND_IN_AVAILABLE_RECORDS/);
  assert.match(writeBack, /does not establish that the work was unpermitted or unlawful/i);
  assert.match(writeBack, /permitHistoricalFindingEvent\.create/);
});
