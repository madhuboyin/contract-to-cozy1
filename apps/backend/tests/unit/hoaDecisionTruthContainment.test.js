'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const calls = {
  updates: [],
  evidenceLookups: [],
};

const prismaMock = {
  document: {
    findFirst: async (args) => {
      calls.evidenceLookups.push(args);
      return args.where.id === 'document-property-1'
        && args.where.propertyId === 'property-1'
        ? { id: args.where.id }
        : null;
    },
  },
  hoaApprovalRecord: {
    findFirst: async () => ({
      id: 'approval-1',
      propertyId: 'property-1',
      isActive: true,
      decisionStatus: null,
      decisionTruthLayer: null,
      decisionSourceType: null,
      decisionSourceReference: null,
      decisionEvidenceDocumentId: null,
      associationReferenceNumber: null,
    }),
    update: async (args) => {
      calls.updates.push(args);
      return { id: 'approval-1', ...args.data };
    },
  },
};

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: { prisma: prismaMock },
};

const incidentServicePath = require.resolve('../../src/services/incidents/incident.service.ts');
require.cache[incidentServicePath] = {
  id: incidentServicePath,
  filename: incidentServicePath,
  loaded: true,
  exports: { IncidentService: class {} },
};

const servicePath = require.resolve('../../src/services/hoaCompliance.service.ts');
delete require.cache[servicePath];
const {
  assertDecisionTruth,
  hoaComplianceService,
} = require(servicePath);
const {
  CreateApprovalRecordSchema,
} = require('../../src/validators/hoaCompliance.validators.ts');

test('legacy ambiguous HOA status input is rejected', () => {
  const result = CreateApprovalRecordSchema.safeParse({
    workType: 'FENCE',
    status: 'APPROVED',
  });

  assert.equal(result.success, false);
});

test('association decisions require an explicit truth layer and source', async () => {
  await assert.rejects(
    () => assertDecisionTruth('property-1', {
      decisionStatus: 'APPROVED',
    }),
    (error) => {
      assert.equal(error.code, 'HOA_DECISION_PROVENANCE_REQUIRED');
      return true;
    },
  );
});

test('documented decisions require property-scoped evidence', async () => {
  await assert.rejects(
    () => assertDecisionTruth('property-1', {
      decisionStatus: 'APPROVED',
      decisionTruthLayer: 'DOCUMENTED',
      decisionSourceType: 'ASSOCIATION_DOCUMENT',
      decisionEvidenceDocumentId: 'document-other-property',
    }),
    (error) => {
      assert.equal(error.code, 'HOA_DECISION_EVIDENCE_PROPERTY_MISMATCH');
      return true;
    },
  );

  await assert.doesNotReject(
    () => assertDecisionTruth('property-1', {
      decisionStatus: 'APPROVED_WITH_CONDITIONS',
      decisionTruthLayer: 'DOCUMENTED',
      decisionSourceType: 'ASSOCIATION_DOCUMENT',
      decisionEvidenceDocumentId: 'document-property-1',
      approvalConditions: 'Use the approved exterior color palette.',
    }),
  );
});

test('decision metadata cannot exist without decision truth', async () => {
  await assert.rejects(
    () => assertDecisionTruth('property-1', {
      decisionSourceType: 'ASSOCIATION_EMAIL',
      decisionSourceReference: 'board@example.test',
    }),
    (error) => {
      assert.equal(error.code, 'HOA_DECISION_STATUS_REQUIRED');
      return true;
    },
  );
});

test('reported HOA progress never becomes association decision truth', async () => {
  calls.updates.length = 0;

  await hoaComplianceService.updateApprovalRecord(
    'approval-1',
    'property-1',
    'user-1',
    {
      reportedStatus: 'APPROVED',
      decisionDate: '2026-07-29T12:00:00.000Z',
    },
  );

  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].data.reportedStatus, 'APPROVED');
  assert.equal(calls.updates[0].data.reportedByUserId, 'user-1');
  assert.equal(calls.updates[0].data.decisionStatus, undefined);
  assert.equal(calls.updates[0].data.decisionTruthLayer, undefined);
});
