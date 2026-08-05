const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// --- in-memory fakes -------------------------------------------------

let propertyUse = 'FOR_SALE';
let saleCaseStore = null; // single case, keyed implicitly by propertyId
let readinessItems = []; // array of { id, saleCaseId, sourceEntityType, sourceEntityId, ... }
let nextItemId = 1;

let inspectionFindings = [];
let projectRecords = [];
let permitRecords = [];
let unpermittedFlags = [];
let workItems = []; // fed to the mocked listWorkItems usecase
let homeRecords = []; // fed to the mocked homeRecordsService.list

let transitions = []; // in-memory PropertyTransition rows
let nextTransitionId = 1;
let briefShares = []; // in-memory PropertyBriefShare rows (with .brief attached)
let revokeCalls = [];
let revokeShouldFail = new Set(); // shareIds that revokePropertyBriefShare should reject for

function resetFixtures() {
  propertyUse = 'FOR_SALE';
  saleCaseStore = null;
  readinessItems = [];
  nextItemId = 1;
  inspectionFindings = [];
  projectRecords = [];
  permitRecords = [];
  unpermittedFlags = [];
  workItems = [];
  homeRecords = [];
  transitions = [];
  nextTransitionId = 1;
  briefShares = [];
  revokeCalls = [];
  revokeShouldFail = new Set();
}

function findReadinessItem(saleCaseId, sourceEntityType, sourceEntityId) {
  return readinessItems.find(
    (item) => item.saleCaseId === saleCaseId
      && item.sourceEntityType === sourceEntityType
      && item.sourceEntityId === sourceEntityId,
  );
}

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      property: {
        findUnique: async () => ({ propertyUse }),
      },
      propertySaleCase: {
        findUnique: async ({ where }) => (saleCaseStore && saleCaseStore.propertyId === where.propertyId ? saleCaseStore : null),
        create: async ({ data }) => {
          saleCaseStore = {
            id: 'case-1',
            status: 'PREPARING',
            targetListDate: null,
            targetCloseDate: null,
            listedAt: null,
            underContractAt: null,
            closedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          return saleCaseStore;
        },
        update: async ({ data }) => {
          saleCaseStore = { ...saleCaseStore, ...data };
          return saleCaseStore;
        },
      },
      saleReadinessItem: {
        findMany: async ({ where }) => readinessItems.filter((item) => item.saleCaseId === where.saleCaseId),
        upsert: async ({ where, create, update }) => {
          const key = where.saleCaseId_sourceEntityType_sourceEntityId;
          const existing = findReadinessItem(key.saleCaseId, key.sourceEntityType, key.sourceEntityId);
          if (existing) {
            Object.assign(existing, update, { updatedAt: new Date() });
            return existing;
          }
          const created = { id: `item-${nextItemId++}`, createdAt: new Date(), updatedAt: new Date(), ...create };
          readinessItems.push(created);
          return created;
        },
        update: async ({ where, data }) => {
          const item = readinessItems.find((i) => i.id === where.id);
          Object.assign(item, data, { updatedAt: new Date() });
          return item;
        },
        findFirst: async ({ where }) => readinessItems.find(
          (item) => item.id === where.id && saleCaseStore && where.saleCase.propertyId === saleCaseStore.propertyId,
        ) || null,
      },
      propertyTransition: {
        create: async ({ data }) => {
          const created = { id: `transition-${nextTransitionId++}`, createdAt: new Date(), updatedAt: new Date(), completedAt: null, acceptedAt: null, ...data };
          transitions.push(created);
          return created;
        },
        update: async ({ where, data }) => {
          const transition = transitions.find((t) => t.id === where.id);
          Object.assign(transition, data, { updatedAt: new Date() });
          return transition;
        },
        findFirst: async ({ where }) => transitions.find((t) => {
          if (where.id && t.id !== where.id) return false;
          if (where.saleCaseId && t.saleCaseId !== where.saleCaseId) return false;
          if (where.saleCase && (!saleCaseStore || where.saleCase.propertyId !== saleCaseStore.propertyId)) return false;
          return true;
        }) || null,
        findMany: async ({ where }) => transitions.filter((t) => t.saleCaseId === where.saleCaseId),
      },
      propertyBriefShare: {
        findFirst: async ({ where }) => briefShares.find(
          (share) => share.id === where.id
            && share.propertyId === where.propertyId
            && (where.status === undefined || share.status === where.status),
        ) || null,
      },
      inspectionFinding: {
        findMany: async () => inspectionFindings,
      },
      projectRecord: {
        findMany: async () => projectRecords,
      },
      propertyPermitRecord: {
        findMany: async () => permitRecords,
      },
      permitUnpermittedFlag: {
        findMany: async () => unpermittedFlags,
      },
      $transaction: async (input) => Promise.all(input),
    },
  },
};

const propertyAccessPath = require.resolve('../../src/services/propertyAccess.service.ts');
let currentRole = 'OWNER';
require.cache[propertyAccessPath] = {
  id: propertyAccessPath,
  filename: propertyAccessPath,
  loaded: true,
  exports: {
    ROLE_RANK: { VIEWER: 0, CONTRIBUTOR: 1, OWNER: 2 },
    resolvePropertyAccess: async (_userId, propertyId) => ({ propertyId, role: currentRole }),
  },
};

const listWorkItemsPath = require.resolve('../../src/modules/homeOperations/application/listWorkItems.usecase.ts');
require.cache[listWorkItemsPath] = {
  id: listWorkItemsPath,
  filename: listWorkItemsPath,
  loaded: true,
  exports: {
    listWorkItems: async () => workItems,
  },
};

const homeRecordsServicePath = require.resolve('../../src/services/homeRecords.service.ts');
require.cache[homeRecordsServicePath] = {
  id: homeRecordsServicePath,
  filename: homeRecordsServicePath,
  loaded: true,
  exports: {
    homeRecordsService: {
      list: async () => homeRecords,
    },
  },
};

const propertyBriefServicePath = require.resolve('../../src/propertyBrief/propertyBrief.service.ts');
require.cache[propertyBriefServicePath] = {
  id: propertyBriefServicePath,
  filename: propertyBriefServicePath,
  loaded: true,
  exports: {
    revokePropertyBriefShare: async ({ shareId }) => {
      revokeCalls.push(shareId);
      if (revokeShouldFail.has(shareId)) throw new Error('Share not found.');
      const share = briefShares.find((s) => s.id === shareId);
      if (share) share.status = 'REVOKED';
      return share;
    },
  },
};

const { PropertySaleCaseService } = require('../../src/services/propertySaleCase.service.ts');

// --- tests -------------------------------------------------------------

test('getCase reports unconfirmed sale intent and no case when propertyUse is not FOR_SALE', async () => {
  resetFixtures();
  propertyUse = 'PRIMARY_RESIDENCE';
  const result = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  assert.equal(result.saleIntentConfirmed, false);
  assert.equal(result.saleCase, null);
  assert.equal(result.canCreate, false);
});

test('createCase refuses to create a case without confirmed sale intent', async () => {
  resetFixtures();
  propertyUse = 'PRIMARY_RESIDENCE';
  await assert.rejects(
    () => PropertySaleCaseService.createCase('user-1', 'prop-1'),
    /SALE_CASE_INTENT_NOT_CONFIRMED|Confirm the property is for sale/,
  );
});

test('createCase requires at least CONTRIBUTOR household role', async () => {
  resetFixtures();
  currentRole = 'VIEWER';
  await assert.rejects(
    () => PropertySaleCaseService.createCase('user-1', 'prop-1'),
    /Insufficient household role/,
  );
  currentRole = 'OWNER';
});

test('createCase creates one property-shared case (not per-user) when sale intent is confirmed', async () => {
  resetFixtures();
  const created = await PropertySaleCaseService.createCase('user-1', 'prop-1');
  assert.equal(created.status, 'PREPARING');
  assert.equal(saleCaseStore.createdByUserId, 'user-1');

  const result = await PropertySaleCaseService.getCase('user-2', 'prop-1');
  assert.equal(result.saleIntentConfirmed, true);
  assert.equal(result.saleCase.id, created.id);
});

test('readiness projection classifies a SAFETY inspection finding as a material blocker', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  inspectionFindings = [{
    id: 'finding-1', severity: 'SAFETY', homeSystem: 'ELECTRICAL', subsystem: 'Panel',
    inspectorDescription: 'Exposed wiring near panel.',
  }];
  const result = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const item = result.readinessItems.find((i) => i.sourceEntityType === 'INSPECTION_FINDING');
  assert.ok(item, 'expected a projected readiness item for the open finding');
  assert.equal(item.category, 'SAFETY_STRUCTURAL');
  assert.equal(item.requirementClass, 'MATERIAL_BLOCKER');
  assert.equal(item.status, 'OPEN');
});

test('readiness projection classifies an unresolved unpermitted-work flag as a professional decision', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  unpermittedFlags = [{
    id: 'flag-1', workType: 'DECK', flagReason: 'No permit on file for rear deck.', disclosureRisk: 'MODERATE', status: 'FLAGGED',
  }];
  const result = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const item = result.readinessItems.find((i) => i.sourceEntityType === 'PERMIT' && i.sourceEntityId === 'flag-1');
  assert.ok(item);
  assert.equal(item.category, 'PERMITS_DISCLOSURE');
  assert.equal(item.requirementClass, 'PROFESSIONAL_DECISION');
});

test('readiness projection maps HOME_ACTION safety tiers and skips closed/verified work items', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  workItems = [
    { id: 'wi-open', state: 'ACCEPTED', acceptanceState: 'ACCEPTED', safetyTier: 'SAFETY_EMERGENCY', title: 'Fix gas leak', homeownerReason: 'Safety', dueAt: null },
    { id: 'wi-closed', state: 'CLOSED', acceptanceState: 'ACCEPTED', safetyTier: 'SAFETY_EMERGENCY', title: 'Already handled', homeownerReason: null, dueAt: null },
  ];
  const result = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const ids = result.readinessItems.filter((i) => i.sourceEntityType === 'HOME_ACTION').map((i) => i.sourceEntityId);
  assert.deepEqual(ids, ['wi-open']);
  const item = result.readinessItems.find((i) => i.sourceEntityId === 'wi-open');
  assert.equal(item.requirementClass, 'MATERIAL_BLOCKER');
  assert.equal(item.canonicalWorkItemId, 'wi-open');
});

test('a waived item stays waived across resync even while its source condition persists', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  inspectionFindings = [{
    id: 'finding-1', severity: 'MINOR', homeSystem: 'PLUMBING', subsystem: null,
    inspectorDescription: 'Minor drip under sink.',
  }];
  const first = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const item = first.readinessItems.find((i) => i.sourceEntityId === 'finding-1');

  const waived = await PropertySaleCaseService.setItemDecision('user-1', 'prop-1', item.id, 'WAIVE', 'Disclosed to buyer instead');
  assert.equal(waived.status, 'WAIVED');
  assert.equal(waived.waivedByUserId, 'user-1');

  // Resync (getCase again) with the same still-open finding must not revive it to OPEN.
  const second = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const stillWaived = second.readinessItems.find((i) => i.sourceEntityId === 'finding-1');
  assert.equal(stillWaived.status, 'WAIVED');
});

test('an item auto-resolves once its source condition clears', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  projectRecords = [{ id: 'proj-1', name: 'Kitchen remodel', status: 'IN_PROGRESS' }];
  const first = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  assert.equal(first.readinessItems.find((i) => i.sourceEntityId === 'proj-1').status, 'OPEN');

  projectRecords = []; // project completed/cancelled and no longer projected
  const second = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const resolved = second.readinessItems.find((i) => i.sourceEntityId === 'proj-1');
  assert.equal(resolved.status, 'RESOLVED');
  assert.ok(resolved.resolvedAt);
});

test('REOPEN clears a waive decision back to OPEN', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  inspectionFindings = [{
    id: 'finding-1', severity: 'MINOR', homeSystem: 'PLUMBING', subsystem: null,
    inspectorDescription: 'Minor drip under sink.',
  }];
  const first = await PropertySaleCaseService.getCase('user-1', 'prop-1');
  const item = first.readinessItems.find((i) => i.sourceEntityId === 'finding-1');
  await PropertySaleCaseService.setItemDecision('user-1', 'prop-1', item.id, 'WAIVE');
  const reopened = await PropertySaleCaseService.setItemDecision('user-1', 'prop-1', item.id, 'REOPEN');
  assert.equal(reopened.status, 'OPEN');
  assert.equal(reopened.waivedByUserId, null);
});

test('transitionStatus only allows the next forward step, or cancellation before CLOSED', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');

  // Skipping straight to CLOSED from PREPARING is invalid.
  await assert.rejects(
    () => PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CLOSED'),
    /Cannot move sale case/,
  );

  const listed = await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'LISTED');
  assert.equal(listed.status, 'LISTED');
  assert.ok(listed.listedAt);

  const underContract = await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'UNDER_CONTRACT');
  assert.ok(underContract.underContractAt);

  const closed = await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CLOSED');
  assert.ok(closed.closedAt);

  // A closed case can never be cancelled.
  await assert.rejects(
    () => PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CANCELLED'),
    /Cannot move sale case/,
  );
});

test('transitionStatus allows cancellation from an in-progress (non-CLOSED) state', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  const cancelled = await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CANCELLED');
  assert.equal(cancelled.status, 'CANCELLED');
});

test('recordTransition persists a PropertyTransition row scoped to the sale case', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {
    sellerRetentionDecision: 'SHARE_SELECTED_HISTORY',
    sellerRetentionNotes: 'Retaining insurance claim history',
  });
  assert.equal(transition.saleCaseId, 'case-1');
  assert.equal(transition.sellerRetentionDecision, 'SHARE_SELECTED_HISTORY');
  assert.equal(transition.sellerRetentionNotes, 'Retaining insurance claim history');
});

test('recordTransition and updateTransition reject a buyerPackageId that is not an active PROSPECTIVE_BUYER share on this property', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  briefShares = [
    { id: 'share-wrong-purpose', propertyId: 'prop-1', status: 'ACTIVE', acceptedAt: null, brief: { purpose: 'CONTRACTOR_SERVICE_PROFESSIONAL' } },
  ];
  await assert.rejects(
    () => PropertySaleCaseService.recordTransition('user-1', 'prop-1', { buyerPackageId: 'share-wrong-purpose' }),
    /SALE_TRANSITION_BUYER_PACKAGE_INVALID|PROSPECTIVE_BUYER/,
  );
});

test('recordTransition mirrors acceptedAt from an already-accepted buyer package share', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  const acceptedAt = new Date('2026-01-01T00:00:00Z');
  briefShares = [
    { id: 'share-1', propertyId: 'prop-1', status: 'ACTIVE', acceptedAt, brief: { purpose: 'PROSPECTIVE_BUYER' } },
  ];
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', { buyerPackageId: 'share-1' });
  assert.equal(transition.acceptedAt, acceptedAt);
});

test('updateTransition refuses to edit a transition that has already been completed', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {
    sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY',
  });
  transitions.find((t) => t.id === transition.id).completedAt = new Date();
  await assert.rejects(
    () => PropertySaleCaseService.updateTransition('user-1', 'prop-1', transition.id, { sellerRetentionDecision: 'SHARE_SELECTED_HISTORY' }),
    /SALE_TRANSITION_ALREADY_COMPLETE|already been completed|cannot be edited/,
  );
});

test('completeTransition requires the sale case to already be CLOSED', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1'); // status: PREPARING
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {
    sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY',
  });
  await assert.rejects(
    () => PropertySaleCaseService.completeTransition('user-1', 'prop-1', transition.id),
    /SALE_TRANSITION_CASE_NOT_CLOSED|must be CLOSED/,
  );
});

test('completeTransition requires a seller retention decision on file', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {});
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'LISTED');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'UNDER_CONTRACT');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CLOSED');
  await assert.rejects(
    () => PropertySaleCaseService.completeTransition('user-1', 'prop-1', transition.id),
    /SALE_TRANSITION_RETENTION_DECISION_MISSING|retention decision is required/,
  );
});

test('completeTransition requires the linked buyer package share to actually be accepted, not just sent', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  briefShares = [
    { id: 'share-1', propertyId: 'prop-1', status: 'ACTIVE', acceptedAt: null, brief: { purpose: 'PROSPECTIVE_BUYER' } },
  ];
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {
    sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY',
    buyerPackageId: 'share-1',
  });
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'LISTED');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'UNDER_CONTRACT');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CLOSED');
  await assert.rejects(
    () => PropertySaleCaseService.completeTransition('user-1', 'prop-1', transition.id),
    /SALE_TRANSITION_BUYER_PACKAGE_NOT_ACCEPTED|has not been accepted/,
  );
});

test('completeTransition succeeds once the case is closed, retention is decided, and the buyer package is accepted — and revokes requested professional shares', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  const acceptedAt = new Date('2026-02-01T00:00:00Z');
  briefShares = [
    { id: 'share-buyer', propertyId: 'prop-1', status: 'ACTIVE', acceptedAt, brief: { purpose: 'PROSPECTIVE_BUYER', id: 'brief-buyer' }, briefId: 'brief-buyer' },
    { id: 'share-contractor', propertyId: 'prop-1', status: 'ACTIVE', acceptedAt: null, brief: { purpose: 'CONTRACTOR_SERVICE_PROFESSIONAL' }, briefId: 'brief-contractor' },
  ];
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {
    sellerRetentionDecision: 'SHARE_SELECTED_HISTORY',
    buyerPackageId: 'share-buyer',
  });
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'LISTED');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'UNDER_CONTRACT');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CLOSED');

  const result = await PropertySaleCaseService.completeTransition('user-1', 'prop-1', transition.id, {
    revokeShareIds: ['share-contractor'],
  });
  assert.ok(result.transition.completedAt);
  assert.deepEqual(result.transition.acceptedAt, acceptedAt);
  assert.equal(result.revokeResults.length, 1);
  assert.equal(result.revokeResults[0].revoked, true);
  assert.equal(briefShares.find((s) => s.id === 'share-contractor').status, 'REVOKED');

  // Idempotent: calling again returns the same completed transition without re-running revokes.
  revokeCalls = [];
  const second = await PropertySaleCaseService.completeTransition('user-1', 'prop-1', transition.id, {
    revokeShareIds: ['share-contractor'],
  });
  assert.ok(second.transition.completedAt);
  assert.equal(revokeCalls.length, 0);
});

test('completeTransition reports a failed revoke per-share instead of aborting the whole completion', async () => {
  resetFixtures();
  await PropertySaleCaseService.createCase('user-1', 'prop-1');
  briefShares = [
    { id: 'share-other-owner', propertyId: 'prop-1', status: 'ACTIVE', acceptedAt: null, brief: { purpose: 'CONTRACTOR_SERVICE_PROFESSIONAL' }, briefId: 'brief-x' },
  ];
  revokeShouldFail.add('share-other-owner');
  const transition = await PropertySaleCaseService.recordTransition('user-1', 'prop-1', {
    sellerRetentionDecision: 'RETAIN_PRIVATE_ONLY',
  });
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'LISTED');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'UNDER_CONTRACT');
  await PropertySaleCaseService.transitionStatus('user-1', 'prop-1', 'CLOSED');

  const result = await PropertySaleCaseService.completeTransition('user-1', 'prop-1', transition.id, {
    revokeShareIds: ['share-other-owner'],
  });
  assert.ok(result.transition.completedAt, 'transition should still complete despite the failed revoke');
  assert.equal(result.revokeResults[0].revoked, false);
  assert.match(result.revokeResults[0].error, /not found/i);
});
