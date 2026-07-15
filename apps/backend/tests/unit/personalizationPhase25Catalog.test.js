const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const { PERSONALIZATION_DEFINITIONS } = require('../../src/modules/personalization/catalog/personalizationDefinitions.ts');

test('focused Phase 2.5 catalog has five code-owned journeys with explicit safety classes', () => {
  assert.equal(PERSONALIZATION_DEFINITIONS.length, 5);
  const byCode = new Map(PERSONALIZATION_DEFINITIONS.map((definition) => [definition.code, definition]));
  assert.equal(byCode.get('smoke_detector_installation_review').safetyClass, 'SAFETY_SENSITIVE');
  assert.equal(byCode.get('aging_roof_condition_review').safetyClass, 'ROUTINE');
  assert.equal(byCode.get('aging_roof_condition_review').profileRanking.agingInPlaceBoost, 5);
  assert.equal(byCode.get('hvac_filter_replacement_check_proof').profileRanking.budgetSensitiveBoost, 6);
});

test('canonical pgAdmin bootstrap contains DRAFT rule/content rows for both Phase 2.5 additions', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../prisma/seedPersonalization.sql'), 'utf8');
  for (const code of ['smoke_detector_installation_review', 'aging_roof_condition_review']) {
    assert.ok(sql.match(new RegExp(code, 'g')).length >= 4, `${code} should appear in definition, rule, content and verification sections`);
  }
  assert.match(sql, /'smoke_detector_installation_review'[\s\S]*"key":"smokeDetectorMissing"/);
  assert.match(sql, /'aging_roof_condition_review'[\s\S]*"key":"roofReplacementOverdue"/);
  assert.match(sql, /'DRAFT'/);
});
