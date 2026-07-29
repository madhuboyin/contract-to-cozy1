const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  assertPartnerHandoffGovernance,
  isCanonicalIntentActionType,
  isCanonicalActionTransitionAllowed,
} = require('../../src/services/savingsBenefitsCanonical.service.ts');
const {
  assertSavingsBenefitPartnerDeliveryGovernance,
} = require('../../src/services/savingsBenefitsPartner.service.ts');
const {
  valueBasisForBenefitPeriod,
} = require('../../src/services/savingsBenefitsUnified.service.ts');

test('canonical savings actions only leave STARTED for a terminal state', () => {
  assert.equal(isCanonicalActionTransitionAllowed('STARTED', 'STARTED'), true);
  assert.equal(isCanonicalActionTransitionAllowed('STARTED', 'COMPLETED'), true);
  assert.equal(isCanonicalActionTransitionAllowed('STARTED', 'CANCELLED'), true);
  assert.equal(isCanonicalActionTransitionAllowed('COMPLETED', 'STARTED'), false);
  assert.equal(isCanonicalActionTransitionAllowed('CANCELLED', 'COMPLETED'), false);
  assert.equal(isCanonicalActionTransitionAllowed('UNKNOWN', 'COMPLETED'), false);
});

test('outcome stages cannot be authored as canonical intent actions', () => {
  assert.equal(isCanonicalIntentActionType('PREPARE'), true);
  assert.equal(isCanonicalIntentActionType('EXTERNALLY_SUBMITTED'), true);
  assert.equal(isCanonicalIntentActionType('APPROVED'), false);
  assert.equal(isCanonicalIntentActionType('DENIED'), false);
  assert.equal(isCanonicalIntentActionType('RECEIVED'), false);
});

test('benefit amount periods retain their exact one-time, monthly, or annual basis', () => {
  assert.equal(valueBasisForBenefitPeriod('ONE_TIME'), 'ONE_TIME');
  assert.equal(valueBasisForBenefitPeriod('MONTHLY'), 'MONTHLY');
  assert.equal(valueBasisForBenefitPeriod('ANNUAL'), 'ANNUAL');
  assert.equal(valueBasisForBenefitPeriod('UNKNOWN'), 'UNKNOWN');
});

test('partner handoffs fail closed unless recipient, disclosure, rank basis, and field preview agree', () => {
  const sharedFields = {
    opportunityId: 'match-1',
    opportunityFamily: 'BENEFIT',
    opportunityTitle: 'State energy rebate',
    category: 'REBATE',
  };
  const input = {
    externalOwner: 'partner-1',
    sharedFields,
    consent: {
      partnerId: 'partner-1',
      disclosureAcknowledged: true,
      consentVersion: 'partner-handoff-v1',
      consentedAt: '2026-07-29T12:00:00.000Z',
      compensationMayOccur: true,
      rankingInfluenced: false,
      selectionCriteria: ['Licensed in the property state', 'Relevant service category'],
      nonCommercialAlternative: 'Contact the official program administrator directly.',
      sharedFieldNames: Object.keys(sharedFields),
    },
  };
  assert.doesNotThrow(() => assertPartnerHandoffGovernance(
    input,
    { id: 'partner-1', disclosureVersion: 'partner-handoff-v1', compensationMayOccur: true },
    sharedFields,
  ));
  assert.throws(
    () => assertPartnerHandoffGovernance(
      input,
      { id: 'partner-2', disclosureVersion: 'partner-handoff-v1', compensationMayOccur: true },
      sharedFields,
    ),
    /not approved/,
  );
  assert.throws(
    () => assertPartnerHandoffGovernance({
      ...input,
      sharedFields: { ...sharedFields, email: 'homeowner@example.com' },
    }, {
      id: 'partner-1',
      disclosureVersion: 'partner-handoff-v1',
      compensationMayOccur: true,
    }, sharedFields),
    /approved consent contract/,
  );
  assert.throws(
    () => assertPartnerHandoffGovernance({
      ...input,
      consent: { ...input.consent, compensationMayOccur: false },
    }, {
      id: 'partner-1',
      disclosureVersion: 'partner-handoff-v1',
      compensationMayOccur: true,
    }, sharedFields),
    /explicit consent contract/,
  );
  assert.throws(
    () => assertPartnerHandoffGovernance({
      ...input,
      sharedFields: { ...sharedFields, opportunityTitle: 'Tampered title' },
    }, {
      id: 'partner-1',
      disclosureVersion: 'partner-handoff-v1',
      compensationMayOccur: true,
    }, sharedFields),
    /server-derived opportunity data/,
  );
});

test('partner delivery revalidates live approval and the exact consented terms', () => {
  const sharedFields = {
    category: 'REBATE',
    opportunityFamily: 'BENEFIT',
    opportunityId: 'match-1',
    opportunityTitle: 'State energy rebate',
  };
  const action = {
    partnerId: 'partner-1',
    property: { state: 'NJ' },
    partner: {
      id: 'partner-1',
      status: 'ACTIVE',
      supportedJurisdictions: ['NJ'],
      disclosureVersion: 'v1',
      compensationMayOccur: true,
      effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
      expiresAt: null,
    },
    consentJson: {
      partnerId: 'partner-1',
      disclosureAcknowledged: true,
      consentVersion: 'v1',
      consentedAt: '2026-07-29T11:30:00.000Z',
      compensationMayOccur: true,
      rankingInfluenced: false,
      selectionCriteria: ['Licensed in the property state'],
      nonCommercialAlternative: 'Apply directly through the official program.',
      sharedFieldNames: Object.keys(sharedFields),
    },
    sharedFieldsJson: sharedFields,
  };
  const now = new Date('2026-07-29T12:00:00.000Z');

  assert.doesNotThrow(() => assertSavingsBenefitPartnerDeliveryGovernance(action, now));
  assert.throws(
    () => assertSavingsBenefitPartnerDeliveryGovernance({
      ...action,
      partner: { ...action.partner, status: 'PAUSED' },
    }, now),
    /approval changed/,
  );
  assert.throws(
    () => assertSavingsBenefitPartnerDeliveryGovernance({
      ...action,
      partner: { ...action.partner, disclosureVersion: 'v2' },
    }, now),
    /terms or shared fields changed/,
  );
  assert.throws(
    () => assertSavingsBenefitPartnerDeliveryGovernance({
      ...action,
      partner: { ...action.partner, compensationMayOccur: false },
    }, now),
    /terms or shared fields changed/,
  );
  assert.throws(
    () => assertSavingsBenefitPartnerDeliveryGovernance({
      ...action,
      property: { state: 'CA' },
    }, now),
    /no longer supports/,
  );
});

test('canonical action persistence and route contracts require idempotency and expose lifecycle updates', () => {
  const schema = fs.readFileSync(
    path.resolve(__dirname, '../../prisma/schema.prisma'),
    'utf8',
  );
  const routes = fs.readFileSync(
    path.resolve(__dirname, '../../src/routes/savingsBenefitsUnified.routes.ts'),
    'utf8',
  );
  const service = fs.readFileSync(
    path.resolve(__dirname, '../../src/services/savingsBenefitsCanonical.service.ts'),
    'utf8',
  );

  assert.match(schema, /idempotencyKey\s+String/);
  assert.match(schema, /@@unique\(\[propertyId, idempotencyKey\]\)/);
  assert.match(schema, /checklistJson\s+Json\?/);
  assert.match(routes, /idempotencyKey:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(160\)/);
  assert.match(routes, /actions\/:actionId/);
  assert.match(service, /error\.code === 'P2002'/);
  assert.match(service, /idempotency key was already used for a different action/);
  assert.match(service, /required: rule\.kind !== 'OPTIONAL'/);
  assert.match(service, /Attach evidence before completing/);
  assert.match(service, /Complete every required checklist item/);
  assert.match(service, /select:\s*\{\s*id:\s*true,\s*homeownerProfileId:\s*true\s*\}/);
  assert.match(service, /uploadedBy:\s*property\.homeownerProfileId/);
});
