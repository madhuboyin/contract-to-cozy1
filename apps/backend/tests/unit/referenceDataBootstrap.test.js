const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
  path.resolve(__dirname, '../../prisma/reference-data-bootstrap.pgadmin.sql'),
  'utf8',
);

test('pgAdmin bootstrap is reference-only and non-destructive', () => {
  assert.match(sql, /BEGIN;[\s\S]*COMMIT;/);
  assert.doesNotMatch(sql, /\b(?:TRUNCATE|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE)\b/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+"?(?:users|properties|homeowner_profiles|provider_profiles)"?/i);
});

test('pgAdmin bootstrap is idempotent for keyed catalogs', () => {
  for (const table of [
    'service_category_config',
    'system_component_configs',
    'personalization_profile_questions',
    'seasonal_task_templates',
    'habit_templates',
  ]) {
    const section = sql.slice(sql.indexOf(`INSERT INTO "${table}"`));
    assert.match(section, /ON CONFLICT/, table);
  }
  assert.match(sql, /WHERE NOT EXISTS[\s\S]*"plant_catalog"/);
});

test('pgAdmin bootstrap includes all required baseline catalogs', () => {
  for (const table of [
    'service_category_config',
    'system_component_configs',
    'personalization_profile_questions',
    'plant_catalog',
    'seasonal_task_templates',
    'habit_templates',
  ]) {
    assert.match(sql, new RegExp(`INSERT INTO "${table}"`), table);
  }
  assert.match(sql, /'HOUSEHOLD_SIZE'/);
});
