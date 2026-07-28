const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  calculatePropertyTaxDeadline,
  PropertyTaxRuleService,
} = require('../../src/services/propertyTax/propertyTaxRule.service');
const {
  PropertyTaxRuleControlService,
} = require('../../src/services/propertyTax/propertyTaxRuleControl.service');
const {
  NYC_DOF_BRONX_CLASS_1_RULE_V1,
} = require('../../src/services/propertyTax/reviewedPropertyTaxRules');
const {
  upsertReviewedPropertyTaxRuleProfiles,
} = require('../../src/scripts/seedReviewedTaxPilots');

function fixedRule() {
  return {
    id: 'deadline-1',
    code: 'TC_CLASS_1_ASSESSMENT_APPEAL_FY2027',
    type: 'ASSESSMENT_APPEAL',
    label: 'Tax Commission assessment appeal',
    trigger: 'FIXED_INSTANT',
    fixedDeadlineAt: new Date('2026-03-16T21:00:00.000Z'),
    daysAfterNotice: null,
    cutoffLocalTime: '17:00',
    timezone: 'America/New_York',
    submissionRequirement: 'Must be received.',
    officialUrl: 'https://www.nyc.gov/site/taxcommission/',
    formCode: 'TC108',
    qualificationJson: { taxClass: '1' },
  };
}

test('fixed reviewed deadline preserves the official New York local cutoff', () => {
  const result = calculatePropertyTaxDeadline(
    fixedRule(),
    {},
    new Date('2026-03-01T12:00:00.000Z'),
  );

  assert.equal(result.status, 'DUE_SOON');
  assert.equal(result.dueAt, '2026-03-16T21:00:00.000Z');
  assert.equal(result.dueLocalDate, '2026-03-16');
  assert.equal(result.timezone, 'America/New_York');
});

test('relative revised-notice deadline requires both notice date and qualification', () => {
  const rule = {
    ...fixedRule(),
    id: 'deadline-2',
    code: 'TC_REVISED_NOTICE_INCREASE_20_DAYS',
    trigger: 'DAYS_AFTER_NOTICE',
    fixedDeadlineAt: null,
    daysAfterNotice: 20,
  };

  assert.equal(
    calculatePropertyTaxDeadline(rule, {}, new Date()).availability,
    'NEEDS_NOTICE_DATE',
  );
  assert.equal(
    calculatePropertyTaxDeadline(
      rule,
      { revisedNoticeDate: '2026-02-25' },
      new Date(),
    ).availability,
    'NEEDS_QUALIFICATION_CONFIRMATION',
  );
  const calculated = calculatePropertyTaxDeadline(
    rule,
    {
      revisedNoticeDate: '2026-02-25',
      revisedNoticeQualifies: true,
    },
    new Date('2026-03-01T12:00:00.000Z'),
  );
  assert.equal(calculated.dueLocalDate, '2026-03-17');
  assert.equal(calculated.dueAt, '2026-03-17T21:00:00.000Z');
});

test('rules fail closed without a source-backed official assessment match', async () => {
  let profileQueries = 0;
  const service = new PropertyTaxRuleService({
    property: {
      async findFirst() {
        return { id: 'property-1', taxAssessmentRecords: [] };
      },
    },
    propertyTaxRuleProfile: {
      async findFirst() {
        profileQueries += 1;
        return null;
      },
    },
  });

  const result = await service.getForProperty('property-1', 'user-1');

  assert.equal(result.coverage, 'UNAVAILABLE');
  assert.match(result.reason, /official assessment match/);
  assert.equal(profileQueries, 0);
});

test('active reviewed profile exposes citations and governed deadlines', async () => {
  const release = NYC_DOF_BRONX_CLASS_1_RULE_V1;
  const service = new PropertyTaxRuleService({
    property: {
      async findFirst() {
        return {
          id: 'property-1',
          taxAssessmentRecords: [{
            id: 'assessment-1',
            jurisdictionId: 'jurisdiction-1',
            dataSource: {
              slug: 'nyc-dof-bronx-tax-class-1',
              queryFilterJson: { curtaxclass: '1' },
            },
          }],
        };
      },
    },
    propertyTaxRuleProfile: {
      async findFirst() {
        return {
          id: 'profile-1',
          jurisdictionId: 'jurisdiction-1',
          ...release.profile,
          assessmentRatio: { toNumber: () => 0.06 },
          disabledReason: null,
          citations: release.citations.map((citation, index) => ({
            id: `citation-${index}`,
            ...citation,
          })),
          deadlineRules: release.deadlines.map((deadline, index) => ({
            id: `deadline-${index}`,
            ...deadline,
          })),
        };
      },
    },
  });

  const result = await service.getForProperty(
    'property-1',
    'user-1',
    {},
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(result.coverage, 'REVIEWED');
  assert.equal(result.profile.propertyClass, '1');
  assert.equal(result.profile.assessmentRatio, 0.06);
  assert.equal(result.profile.citations.length, 3);
  assert.ok(result.deadlines.every((deadline) => deadline.officialUrl));
  assert.equal(
    result.deadlines.find((deadline) =>
      deadline.code === 'TC_REVISED_NOTICE_INCREASE_20_DAYS'
    ).status,
    'INPUT_REQUIRED',
  );
});

test('emergency disable is immediate and produces an operator audit event', async () => {
  const calls = { update: [], event: [] };
  const tx = {
    propertyTaxRuleProfile: {
      async update(input) {
        calls.update.push(input);
        return { id: input.where.id, status: input.data.status };
      },
    },
    propertyTaxRuleControlEvent: {
      async create(input) {
        calls.event.push(input);
        return { id: 'event-1' };
      },
    },
  };
  const service = new PropertyTaxRuleControlService({
    async $transaction(callback) {
      return callback(tx);
    },
  });

  const result = await service.emergencyDisable(
    'profile-1',
    'admin-1',
    'Official deadline source changed unexpectedly',
    new Date('2026-07-27T12:00:00.000Z'),
  );

  assert.equal(result.status, 'DISABLED');
  assert.equal(calls.update[0].data.disabledByUserId, 'admin-1');
  assert.equal(calls.event[0].data.action, 'EMERGENCY_DISABLED');
});

test('reviewed Bronx rule seeding is idempotent across profiles, citations, and deadlines', async () => {
  const calls = {
    jurisdiction: [],
    profile: [],
    citation: [],
    deadline: [],
    control: [],
  };
  const db = {
    propertyTaxJurisdiction: {
      async upsert(input) {
        calls.jurisdiction.push(input);
        return { id: 'jurisdiction-1' };
      },
    },
    propertyTaxRuleProfile: {
      async upsert(input) {
        calls.profile.push(input);
        return { id: 'profile-1' };
      },
    },
    propertyTaxRuleCitation: {
      async upsert(input) {
        calls.citation.push(input);
        return { id: 'citation-1' };
      },
    },
    propertyTaxDeadlineRule: {
      async upsert(input) {
        calls.deadline.push(input);
        return { id: 'deadline-1' };
      },
    },
    propertyTaxRuleControlEvent: {
      async upsert(input) {
        calls.control.push(input);
        return { id: 'control-1' };
      },
    },
  };

  const count = await upsertReviewedPropertyTaxRuleProfiles(db);

  assert.equal(count, 1);
  assert.equal(calls.profile[0].create.status, 'ACTIVE');
  assert.equal(calls.profile[0].create.propertyClass, '1');
  assert.equal(calls.citation.length, 3);
  assert.equal(calls.deadline.length, 3);
  assert.ok(calls.deadline.every((call) => call.create.officialUrl));
  assert.equal(calls.control.length, 1);
  assert.equal(calls.control[0].create.action, 'ACTIVATED');
});

test('Slice 3 schema and API require governed rules and add no migration', () => {
  const root = path.resolve(__dirname, '../../..');
  const read = (relativePath) => fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
  const schema = read('backend/prisma/schema.prisma');
  const routes = read('backend/src/routes/propertyTax.routes.ts');
  const client = read(
    'frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );

  for (const model of [
    'PropertyTaxRuleProfile',
    'PropertyTaxRuleCitation',
    'PropertyTaxDeadlineRule',
    'PropertyTaxRuleControlEvent',
  ]) {
    assert.match(schema, new RegExp(`model ${model}\\s*\\{`));
  }
  assert.match(routes, /property-tax\/rules/);
  assert.match(routes, /emergency-disable/);
  assert.match(routes, /rollback/);
  assert.match(client, /Filing information appears only from an active reviewed rule release/);

  const migrationsDirectory = path.join(root, 'backend/prisma/migrations');
  const taxMigrations = fs.existsSync(migrationsDirectory)
    ? fs.readdirSync(migrationsDirectory)
      .filter((name) => /property.tax|tax.appeal/i.test(name))
    : [];
  assert.deepEqual(taxMigrations, []);
});
