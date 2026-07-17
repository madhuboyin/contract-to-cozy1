const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  buildRedactedReportSnapshot,
  REDACTED_FORBIDDEN_FIELD_NAMES,
} = require('../../src/services/planningContext/redaction.ts');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

const FULL_SNAPSHOT = {
  meta: { generatedAt: '2026-07-17T00:00:00.000Z', propertyId: 'prop-1', templateVersion: 3, contextVersion: 'ctx-1' },
  property: {
    id: 'prop-1',
    nickname: 'Our Home',
    addressLine1: '123 Main St',
    city: 'Austin',
    state: 'TX',
    zipCode: '78701',
    dwellingType: 'DETACHED_SINGLE_FAMILY',
    propertyUse: 'PRIMARY_RESIDENCE',
    yearBuilt: 1998,
    livingAreaSqft: 2100,
  },
  inventory: {
    rooms: [{ id: 'room-1', name: 'Kitchen' }],
    items: [{
      id: 'item-1',
      name: 'Furnace',
      category: 'HVAC',
      condition: 'GOOD',
      brand: 'Carrier',
      modelNumber: 'M-1000',
      serialNumber: 'SN-SECRET-1',
      purchaseCostCents: 450000,
      replacementCostCents: 720000,
      room: { id: 'room-1', name: 'Basement' },
      documents: [{ id: 'doc-1', name: 'Manual', type: 'OTHER', fileUrl: 'https://bucket/presigned' }],
    }],
  },
  maintenance: {
    tasks: [{
      id: 'task-1',
      title: 'Service HVAC',
      status: 'PENDING',
      priority: 'HIGH',
      frequency: 'ANNUAL',
      lastCompletedDate: '2026-01-01T00:00:00.000Z',
      estimatedCost: 250,
      actualCost: null,
    }],
  },
  coverage: {
    insurancePolicies: [{
      id: 'pol-1',
      providerName: 'Acme Insurance',
      policyNumber: 'POL-SECRET-9',
      startDate: '2026-01-01T00:00:00.000Z',
      expiryDate: '2027-01-01T00:00:00.000Z',
      premium: 1200,
      coverageAmount: 350000,
      documents: [{ id: 'doc-2', name: 'Policy', type: 'INSURANCE', fileUrl: 'https://bucket/policy' }],
    }],
    warranties: [{
      id: 'war-1',
      providerName: 'HomeShield',
      policyNumber: 'WAR-SECRET-2',
      startDate: '2026-01-01T00:00:00.000Z',
      expiryDate: '2027-01-01T00:00:00.000Z',
      documents: [],
    }],
  },
};

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key);
      collectKeys(entry, keys);
    }
  }
  return keys;
}

function collectStrings(value, out = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out);
  } else if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  } else if (typeof value === 'string') {
    out.push(value);
  }
  return out;
}

test('redacted projection contains no forbidden field anywhere', () => {
  const redacted = buildRedactedReportSnapshot(FULL_SNAPSHOT);
  const keys = collectKeys(redacted);
  for (const forbidden of REDACTED_FORBIDDEN_FIELD_NAMES) {
    assert.ok(!keys.has(forbidden), `redacted projection leaked field: ${forbidden}`);
  }
});

test('redacted projection contains no sensitive values from the full snapshot', () => {
  const redacted = buildRedactedReportSnapshot(FULL_SNAPSHOT);
  const values = collectStrings(redacted).join('\n');
  for (const secret of ['123 Main St', '78701', 'SN-SECRET-1', 'POL-SECRET-9', 'WAR-SECRET-2', 'presigned', 'prop-1', 'Our Home']) {
    assert.ok(!values.includes(secret), `redacted projection leaked value: ${secret}`);
  }
});

test('redacted projection keeps the approved shareable facts', () => {
  const redacted = buildRedactedReportSnapshot(FULL_SNAPSHOT);
  assert.equal(redacted.meta.redacted, true);
  assert.equal(redacted.meta.contextVersion, 'ctx-1');
  assert.equal(redacted.property.city, 'Austin');
  assert.equal(redacted.property.state, 'TX');
  assert.equal(redacted.property.dwellingType, 'DETACHED_SINGLE_FAMILY');
  assert.equal(redacted.inventory.items[0].name, 'Furnace');
  assert.equal(redacted.inventory.items[0].brand, 'Carrier');
  assert.equal(redacted.inventory.items[0].roomName, 'Basement');
  assert.equal(redacted.coverage.insurancePolicies[0].providerName, 'Acme Insurance');
  assert.equal(redacted.maintenance.tasks[0].title, 'Service HVAC');
});

test('share-token downloads serve only the redacted artifact and fail closed', () => {
  const controller = read('../../src/controllers/homeReportExport.controller.ts');
  const downloadSection = controller.slice(controller.indexOf('downloadHomeReportByShareToken'));
  assert.ok(downloadSection.includes('shareStorageBucket'), 'share download must use the redacted bucket');
  assert.ok(downloadSection.includes('shareStorageKey'), 'share download must use the redacted key');
  assert.ok(
    !/presignGetObject\(\{\s*bucket:\s*exp\.storageBucket/.test(downloadSection),
    'share download must never presign the full-report storage key',
  );
  assert.ok(controller.includes('prepareShareArtifacts'), 'share creation must prepare redacted artifacts');
});

test('backend and worker report generation use one authoritative snapshot builder', () => {
  const workerJob = read('../../../workers/src/jobs/generateHomeReportExport.job.ts');
  assert.ok(workerJob.includes('buildAuthoritativeReportSnapshot'), 'worker must use the shared builder');
  assert.ok(workerJob.includes('checkReportWorkerContext'), 'worker must recheck context before generating');
  assert.ok(!/async function buildReportSnapshot/.test(workerJob), 'worker must not keep a duplicate builder');

  const backendService = read('../../src/services/homeReportExport.service.ts');
  assert.ok(backendService.includes('buildAuthoritativeReportSnapshot'), 'backend must use the shared builder');
  assert.ok(!/async function buildReportSnapshot/.test(backendService), 'backend must not keep a duplicate builder');
});

test('report snapshots record canonical classification and context version', () => {
  const builder = read('../../src/services/planningContext/reportSnapshot.ts');
  assert.ok(builder.includes("knownContextValue<string>(context, 'core.dwellingType')"));
  assert.ok(builder.includes('contextVersion: planning.contextVersion'));
  assert.ok(!/property\.propertyType/.test(builder), 'report builder must not read the legacy enum');
});

test('phase 6 surfaces no longer read legacy classification enums', () => {
  const sellerPrep = read('../../src/sellerPrep/sellerPrep.service.ts');
  assert.ok(!/propertyType:\s*true/.test(sellerPrep), 'seller prep must not select legacy propertyType');
  assert.ok(sellerPrep.includes('dwellingType'));

  const neighborhoodMatch = read('../../src/neighborhoodIntelligence/neighborhoodPropertyMatchService.ts');
  assert.ok(!/ownershipType/.test(neighborhoodMatch), 'neighborhood match must not read ownershipType');
  assert.ok(neighborhoodMatch.includes('propertyUse'));
  assert.ok(neighborhoodMatch.includes('exteriorProfile'), 'drainage must come from the canonical exterior profile');

  const localUpdates = read('../../src/localUpdates/localUpdates.service.ts');
  assert.ok(!/propertyTypes/.test(localUpdates), 'local updates must target canonical dwelling types');
  assert.ok(localUpdates.includes('dwellingTypes'));

  const twinBuilder = read('../../src/services/homeDigitalTwinBuilder.service.ts');
  assert.ok(!/occupantsCount/.test(twinBuilder), 'twin must not read household occupant count');
});

test('local updates schema targets canonical dwelling types', () => {
  const schema = read('../../prisma/schema.prisma');
  const localUpdateModel = schema.slice(schema.indexOf('model LocalUpdate {'), schema.indexOf('model UserLocalUpdateDismissal'));
  assert.ok(localUpdateModel.includes('dwellingTypes DwellingType[]'));
  assert.ok(!localUpdateModel.includes('propertyTypes PropertyType[]'));
});

test('persisted planning outputs carry a generation context version', () => {
  const schema = read('../../prisma/schema.prisma');
  for (const model of ['model SellerPrepPlan {', 'model MovingPlan {', 'model HomeReportExport {', 'model HomeDigitalTwin {']) {
    const start = schema.indexOf(model);
    assert.ok(start >= 0, model);
    const section = schema.slice(start, schema.indexOf('model ', start + 10));
    assert.ok(section.includes('contextVersion'), `${model} must persist contextVersion`);
  }
});

test('neighborhood notifications recheck location relevance before sending', () => {
  const job = read('../../../workers/src/jobs/neighborhoodChangeNotification.job.ts');
  assert.ok(job.includes('isEventStillRelevantToProperty'));
  assert.ok(job.includes('haversineDistanceMiles'));
});
