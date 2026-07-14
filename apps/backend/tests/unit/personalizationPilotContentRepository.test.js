const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function loadRepository(result) {
  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = {
    id: prismaPath,
    filename: prismaPath,
    loaded: true,
    exports: {
      prisma: {
        recommendationContentVersion: {
          findFirst: async (query) => {
            assert.deepEqual(query.where, { definitionId: 'def-1', locale: 'en-US', status: 'ACTIVE' });
            assert.deepEqual(query.orderBy, { version: 'desc' });
            return result;
          },
        },
      },
    },
  };
  const repoPath = require.resolve('../../src/modules/personalization/infrastructure/pilotContentRepository.ts');
  delete require.cache[repoPath];
  return require('../../src/modules/personalization/infrastructure/pilotContentRepository.ts');
}

test('loads only the latest ACTIVE en-US content version', async () => {
  const expected = { version: 2, title: 'Title', body: 'Why this matters' };
  const { loadActivePilotContent } = loadRepository(expected);
  assert.deepEqual(await loadActivePilotContent('def-1'), expected);
});
test('returns null when reviewed active content does not exist', async () => {
  const { loadActivePilotContent } = loadRepository(null);
  assert.equal(await loadActivePilotContent('def-1'), null);
});
