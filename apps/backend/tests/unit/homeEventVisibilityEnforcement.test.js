const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const backendRoot = path.resolve(__dirname, '../..');
const repositoryRoot = path.resolve(backendRoot, '../..');
const readBackend = (relativePath) => fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
const readRepository = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');

// HomeEventVisibility (PRIVATE/HOUSEHOLD/SHARE_LINK/RESALE_PACK) has existed
// in schema since an earlier slice with zero enforcement anywhere AND no
// homeowner-facing way to ever set it — a two-sided gap. These tests lock
// down both halves: a real Timeline UI control, and real enforcement in
// Property Brief's VERIFIED_HISTORY assembly.

test('setVisibility is a plain in-place update, not the supersede-with-a-new-revision correction flow', () => {
  const service = readBackend('src/services/homeEvents.service.ts');
  const fnStart = service.indexOf('async setVisibility(');
  assert.ok(fnStart > 0, 'expected HomeEventsService.setVisibility to exist');
  const fnBody = service.slice(fnStart, service.indexOf('async addEvidence(', fnStart));
  assert.match(fnBody, /prisma\.homeEvent\.updateMany/);
  assert.doesNotMatch(fnBody, /revision:/, 'must not bump revision like a correction');
  assert.doesNotMatch(fnBody, /supersedesEventId/, 'must not supersede/create a new event row');
  assert.doesNotMatch(fnBody, /verificationStatus/, 'must not touch verification status');
});

test('the visibility route requires CONTRIBUTOR+ and restricts to the three settable choices (SHARE_LINK stays reserved)', () => {
  const routes = readBackend('src/routes/homeEvents.routes.ts');
  const routeIndex = routes.indexOf("'/properties/:propertyId/home-events/:eventId/visibility'");
  assert.ok(routeIndex > 0);
  const block = routes.slice(routeIndex, routes.indexOf(');', routeIndex));
  assert.match(block, /requireHouseholdRole\('CONTRIBUTOR'\)/);
  assert.match(block, /setHomeEventVisibilityBodySchema/);

  const validators = readBackend('src/validators/homeEvents.validators.ts');
  const schemaIndex = validators.indexOf('export const setHomeEventVisibilityBodySchema');
  const schemaBlock = validators.slice(schemaIndex, validators.indexOf('});', schemaIndex));
  assert.match(schemaBlock, /z\.enum\(\['PRIVATE', 'HOUSEHOLD', 'RESALE_PACK'\]\)/);
  assert.doesNotMatch(schemaBlock, /SHARE_LINK/);
});

test("Property Brief's VERIFIED_HISTORY assembly excludes PRIVATE events for most purposes, but requires RESALE_PACK specifically for the two resale-safe purposes", () => {
  const service = readBackend('src/propertyBrief/propertyBrief.service.ts');
  assert.match(
    service,
    /RESALE_SAFE_PURPOSES = new Set<PropertyBriefPurposeInput>\(\['PROSPECTIVE_BUYER', 'LISTING_AGENT'\]\)/,
  );
  const sectionIndex = service.indexOf("input.selectedSections.includes('VERIFIED_HISTORY')");
  assert.ok(sectionIndex > 0);
  const queryBlock = service.slice(sectionIndex, service.indexOf('orderBy:', sectionIndex));
  assert.match(
    queryBlock,
    /visibility:\s*RESALE_SAFE_PURPOSES\.has\(input\.purpose\)\s*\?\s*'RESALE_PACK'\s*:\s*\{\s*not:\s*'PRIVATE'\s*\}/,
  );

  // assembleSections must actually receive purpose for this to work at all.
  assert.match(service, /async function assembleSections\(input: \{[\s\S]{0,120}purpose: PropertyBriefPurposeInput/);
  assert.match(service, /assembleSections\(\{[\s\S]{0,120}purpose: input\.purpose/);
});

test('a real Timeline UI control exists to mark an event for resale/buyer packages specifically, not just private/household', () => {
  const page = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx',
  );
  assert.match(page, /RESALE_PACK/);
  assert.match(page, /Include in buyer\/resale packages/);

  const api = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi.ts',
  );
  assert.match(api, /visibility: 'PRIVATE' \| 'HOUSEHOLD' \| 'RESALE_PACK'/);
});

test('a real Timeline UI control exists to set an event private — not just backend enforcement', () => {
  const page = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/page.tsx',
  );
  assert.match(page, /setHomeEventVisibility/);
  assert.match(page, /Keep this private/);
  assert.match(page, /logPrivate/);

  const api = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/homeEventsApi.ts',
  );
  assert.match(api, /export async function setHomeEventVisibility/);
  assert.match(api, /visibility\?:\s*HomeEventVisibility/);

  const timelineClient = readRepository(
    'apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/timeline/TimelineClient.tsx',
  );
  assert.match(timelineClient, /event\.visibility === 'PRIVATE'/);
});

// --- HomeEventsService.setVisibility behavioral test ---

let updateManyCalls = [];
let updateManyResult = { count: 1 };

const prismaPath = require.resolve('../../src/lib/prisma.ts');
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      homeEvent: {
        updateMany: async (args) => {
          updateManyCalls.push(args);
          return updateManyResult;
        },
      },
    },
  },
};

const { HomeEventsService } = require('../../src/services/homeEvents.service.ts');
const service = new HomeEventsService();

test('setVisibility scopes the update to the current, non-deleted event on this property and sets the requested value', async () => {
  updateManyCalls = [];
  updateManyResult = { count: 1 };
  await service.setVisibility({ propertyId: 'prop-1', eventId: 'event-1', visibility: 'PRIVATE' });
  assert.equal(updateManyCalls.length, 1);
  assert.deepEqual(updateManyCalls[0].where, {
    id: 'event-1', propertyId: 'prop-1', isCurrent: true, deletedAt: null,
  });
  assert.deepEqual(updateManyCalls[0].data, { visibility: 'PRIVATE' });
});

test('setVisibility accepts RESALE_PACK, the value assembleSections now requires for resale-safe purposes', async () => {
  updateManyCalls = [];
  updateManyResult = { count: 1 };
  await service.setVisibility({ propertyId: 'prop-1', eventId: 'event-1', visibility: 'RESALE_PACK' });
  assert.deepEqual(updateManyCalls[0].data, { visibility: 'RESALE_PACK' });
});

test('setVisibility throws 404 when the event does not exist (or is not current/is deleted) on this property', async () => {
  updateManyCalls = [];
  updateManyResult = { count: 0 };
  await assert.rejects(
    () => service.setVisibility({ propertyId: 'prop-1', eventId: 'missing', visibility: 'HOUSEHOLD' }),
    /HOME_EVENT_NOT_FOUND|Home event not found/,
  );
});
