const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  assertPartnerHandoffGovernance,
  isCanonicalActionTransitionAllowed,
} = require('../../src/services/savingsBenefitsCanonical.service.ts');
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

test('benefit amount periods retain their exact one-time, monthly, or annual basis', () => {
  assert.equal(valueBasisForBenefitPeriod('ONE_TIME'), 'ONE_TIME');
  assert.equal(valueBasisForBenefitPeriod('MONTHLY'), 'MONTHLY');
  assert.equal(valueBasisForBenefitPeriod('ANNUAL'), 'ANNUAL');
  assert.equal(valueBasisForBenefitPeriod('UNKNOWN'), 'UNKNOWN');
});

test('partner handoffs fail closed unless recipient, disclosure, rank basis, and field preview agree', () => {
  const input = {
    externalOwner: 'partner-1',
    sharedFields: { email: 'homeowner@example.com' },
    consent: {
      partnerId: 'partner-1',
      disclosureAcknowledged: true,
      consentVersion: 'partner-handoff-v1',
      consentedAt: '2026-07-29T12:00:00.000Z',
      compensationMayOccur: true,
      rankingInfluenced: false,
      selectionCriteria: ['Licensed in the property state', 'Relevant service category'],
      nonCommercialAlternative: 'Contact the official program administrator directly.',
      sharedFieldNames: ['email'],
    },
  };
  assert.doesNotThrow(() => assertPartnerHandoffGovernance(input, ['partner-1']));
  assert.throws(
    () => assertPartnerHandoffGovernance(input, []),
    /not approved/,
  );
  assert.throws(
    () => assertPartnerHandoffGovernance({
      ...input,
      sharedFields: { email: 'homeowner@example.com', phone: '555-0100' },
    }, ['partner-1']),
    /do not match the consent preview/,
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
});
