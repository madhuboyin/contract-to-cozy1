const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Slice 7 exposes seven focused stages and preserves inbound launch context', () => {
  const client = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );
  const redirect = read(
    'apps/frontend/src/app/(dashboard)/dashboard/tax-appeal/page.tsx',
  );
  const radar = read(
    'apps/backend/src/modules/homeEventRadar/domain/radarActionRegistry.ts',
  );

  for (const stage of [
    'overview',
    'bill',
    'changes',
    'exemptions',
    'review',
    'appeal',
    'history',
  ]) {
    assert.match(client, new RegExp(`id: '${stage}'`));
  }

  assert.match(client, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(client, /nextParams\.set\('stage', stage\)/);
  assert.match(client, /nextParams\.set\('caseId', caseId\)/);
  assert.match(redirect, /next\.set\('stage', 'appeal'\)/);
  assert.match(radar, /property-tax\?stage=changes/);
  assert.match(radar, /property-tax\?stage=appeal/);
});

test('Slice 7 makes authority, missing facts, changes, rules, and history explicit', () => {
  const client = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );

  assert.match(client, /How to read these values/);
  assert.match(client, /<strong className="block">Official<\/strong>/);
  assert.match(client, /<strong className="block">Confirmed<\/strong>/);
  assert.match(client, /<strong className="block">Estimated<\/strong>/);
  assert.match(client, /const missingFacts =/);
  assert.match(client, /These facts are missing from the sourced record/);
  assert.match(client, /Observed changes and conflicts/);
  assert.match(client, /does not infer a historical change/);
  assert.match(client, /Last source check/);
  assert.match(client, /Match context:/);
  assert.match(client, /Reviewed \{new Date\(rules\.profile\.reviewedAt\)/);
  assert.match(client, /Verify with official instructions/);
  assert.match(client, /Property-tax history/);
  assert.match(client, /Planning estimates are intentionally excluded/);
});

test('Slice 7 surfaces only material appeal case actions with event-specific outcomes', () => {
  const promotion = read(
    'apps/backend/src/services/homeActionSourcePromotion.service.ts',
  );

  assert.match(promotion, /loadPropertyTaxAppealCaseActions/);
  assert.match(promotion, /propertyTaxAppealCase\.findFirst/);
  assert.match(promotion, /Complete the appeal packet/);
  assert.match(promotion, /Track the authority response/);
  assert.match(promotion, /Prepare for the recorded appeal hearing/);
  assert.match(promotion, /Record the final refund or credit and close the case/);
  assert.match(promotion, /stage=appeal&caseId=/);
  assert.match(promotion, /no deadline is inferred/);
});

test('Slice 7 stage controls and content include keyboard and reduced-motion affordances', () => {
  const client = read(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/property-tax/PropertyTaxClient.tsx',
  );

  assert.match(client, /Skip to property-tax stage content/);
  assert.match(client, /aria-current=\{selected \? 'page'/);
  assert.match(client, /min-h-11/);
  assert.match(client, /focus-visible:ring-4/);
  assert.match(client, /tabIndex=\{-1\}/);
  assert.match(client, /stageHeadingRef\.current\?\.focus\(\)/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /motion-reduce:scroll-auto/);
});

test('Slice 7 does not add a property-tax migration', () => {
  const migrationRoot = path.join(root, 'apps/backend/prisma/migrations');
  const migrationNames = fs.existsSync(migrationRoot)
    ? fs.readdirSync(migrationRoot)
    : [];

  assert.equal(
    migrationNames.some((name) => /appeal|property.?tax/i.test(name)),
    false,
  );
});
