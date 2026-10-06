const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');
const canonical = JSON.parse(read('src/data/seasonalTaskTemplates.json'));
const retired = JSON.parse(read('src/data/retiredSeasonalTaskKeys.json'));
const canonicalKeys = canonical.map((t) => t.taskKey);

const seedSql = read('prisma/seasonalTaskTemplates.pgadmin.seed.sql');
const bootstrapSql = read('prisma/reference-data-bootstrap.pgadmin.sql');
const cleanupSql = read('prisma/seasonal-catalog-dedupe.pgadmin.sql');
const tsSeed = read('prisma/seasonalTasks.seed.ts');

// Task keys inserted by a SQL file's seasonal_task_templates VALUES rows.
function insertedKeys(sql) {
  const start = sql.indexOf('INSERT INTO "seasonal_task_templates"');
  const end = sql.indexOf('ON CONFLICT ("task_key")', start);
  return [...sql.slice(start, end).matchAll(/\(gen_random_uuid\(\)::text, '([A-Z_]+)'/g)].map((m) => m[1]);
}

test('canonical seasonal catalog has unique keys and none of the retired twin keys', () => {
  assert.equal(new Set(canonicalKeys).size, canonicalKeys.length);
  for (const key of retired) assert.ok(!canonicalKeys.includes(key), `${key} is retired but also canonical`);
});

test('both SQL seed paths carry exactly the canonical catalog', () => {
  assert.deepEqual([...insertedKeys(seedSql)].sort(), [...canonicalKeys].sort());
  assert.deepEqual([...insertedKeys(bootstrapSql)].sort(), [...canonicalKeys].sort());
});

test('every seed path deliberately retires every legacy twin key', () => {
  for (const key of retired) {
    assert.ok(seedSql.includes(`'${key}'`), `seed SQL does not retire ${key}`);
    assert.ok(bootstrapSql.includes(`'${key}'`), `bootstrap does not retire ${key}`);
    assert.ok(cleanupSql.includes(`'${key}'`), `cleanup script does not retire ${key}`);
  }
  // The TypeScript seed reads the shared list rather than repeating it.
  assert.match(tsSeed, /retiredSeasonalTaskKeys\.json/);
  assert.match(tsSeed, /updateMany\([\s\S]*isActive: false/);
  for (const sql of [seedSql, bootstrapSql]) {
    assert.match(sql, /UPDATE "seasonal_task_templates"\s+SET "is_active" = false/);
  }
});

test('the cleanup script dismisses items and cancels tasks, never the reverse, and deletes nothing', () => {
  assert.doesNotMatch(cleanupSql, /\b(?:TRUNCATE|DELETE\s+FROM|DROP\s+TABLE\s+(?!IF EXISTS))/i);
  assert.match(cleanupSql, /UPDATE "seasonal_checklist_items"[\s\S]*?"status" = 'DISMISSED', "dismissed_at" = now\(\)/);
  assert.match(cleanupSql, /UPDATE "property_maintenance_tasks"[\s\S]*?"status" = 'CANCELLED'/);
  // 'CANCELLED' is not a SeasonalTaskStatus; it must never be written to a checklist item.
  assert.doesNotMatch(cleanupSql, /UPDATE "seasonal_checklist_items"[^;]*'CANCELLED'/);
  // Conditional mappings never move an item onto the canonical template without a Property Context check.
  assert.match(cleanupSql, /m\."kind" = 'CONDITIONAL'\s+THEN 'KEEP_CANONICAL_NOT_VERIFIED'/);
});
