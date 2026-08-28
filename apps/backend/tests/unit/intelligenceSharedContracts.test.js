const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  EVIDENCE_REF_FRESHNESS,
  EVIDENCE_REF_TYPES,
  EvidenceRefSchema,
  GUIDANCE_ISSUE_DOMAINS,
  INTELLIGENCE_ISSUE_DOMAINS,
  INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION,
  IntelligenceIssueDomainSchema,
} = require('../../src/productFramework/intelligence/index.ts');
const guidanceTypes = require('../../src/services/guidanceEngine/guidanceTypes.ts');
const { HomeActionSchema } = require('../../src/productFramework/homeAction.contract.ts');
const { goldenTestHomes } = require('../fixtures/productFramework/goldenTestHomes.js');

function prismaEnumValues(schema, enumName) {
  const match = schema.match(new RegExp(`enum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Prisma enum ${enumName} must exist`);
  return match[1]
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0]);
}

test('Guidance and derived intelligence share one issue-domain vocabulary', () => {
  assert.strictEqual(GUIDANCE_ISSUE_DOMAINS, INTELLIGENCE_ISSUE_DOMAINS);
  assert.strictEqual(guidanceTypes.GUIDANCE_ISSUE_DOMAINS, INTELLIGENCE_ISSUE_DOMAINS);
  assert.equal(INTELLIGENCE_ISSUE_DOMAIN_TAXONOMY_VERSION, '1.0');
  for (const domain of INTELLIGENCE_ISSUE_DOMAINS) {
    assert.equal(IntelligenceIssueDomainSchema.parse(domain), domain);
  }
  assert.equal(IntelligenceIssueDomainSchema.safeParse('ROOF').success, false);
  assert.equal(IntelligenceIssueDomainSchema.safeParse('HVAC').success, false);
});

test('shared issue-domain vocabulary stays in parity with the Prisma Guidance enum', () => {
  const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  assert.deepEqual(
    [...INTELLIGENCE_ISSUE_DOMAINS].sort(),
    prismaEnumValues(schema, 'GuidanceIssueDomain').sort(),
  );
});

test('shared evidence contract preserves the canonical Home Action evidence shape', () => {
  assert.deepEqual(EVIDENCE_REF_TYPES, [
    'PROPERTY_FACT',
    'DOCUMENT',
    'HOME_EVENT',
    'USER_INPUT',
    'EXTERNAL_SOURCE',
    'SYSTEM_DERIVATION',
  ]);
  assert.deepEqual(EVIDENCE_REF_FRESHNESS, ['CURRENT', 'STALE', 'UNKNOWN']);

  const fixture = structuredClone(goldenTestHomes[0].action);
  fixture.evidence[0].confidence = 85;
  const evidence = EvidenceRefSchema.parse(fixture.evidence[0]);
  const action = HomeActionSchema.parse(fixture);

  assert.equal(evidence.confidence, 0.85);
  assert.deepEqual(action.evidence[0], evidence);
  assert.equal(EvidenceRefSchema.safeParse({ ...fixture.evidence[0], type: 'UNREGISTERED' }).success, false);
});
