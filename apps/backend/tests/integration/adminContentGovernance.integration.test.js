const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

function createHarness(overrides = {}) {
  const state = {
    articles: [
      { id: 'art-1', slug: 'winterizing', title: 'Winterizing your home', status: 'DRAFT', articleType: 'EDUCATIONAL', readingMinutes: 5, publishedAt: null, updatedAt: new Date('2026-07-01') },
      { id: 'art-2', slug: 'roof-care', title: 'Roof care basics', status: 'REVIEW', articleType: 'EDUCATIONAL', readingMinutes: 7, publishedAt: null, updatedAt: new Date('2026-06-01') },
      { id: 'art-3', slug: 'gutters', title: 'Gutter guide', status: 'PUBLISHED', articleType: 'CHECKLIST_ARTICLE', readingMinutes: 4, publishedAt: new Date('2026-05-01'), updatedAt: new Date('2026-05-01') },
    ],
    auditLogs: [],
    ...overrides,
  };

  const prisma = {
    knowledgeArticle: {
      findUnique: async ({ where, select }) => {
        const a = state.articles.find((x) => x.id === where.id);
        if (!a) return null;
        if (!select) return { ...a };
        const out = {};
        for (const key of Object.keys(select)) out[key] = a[key];
        return out;
      },
      findMany: async ({ where, select }) => {
        return state.articles
          .filter((a) => a.status === where.status)
          .map((a) => {
            const out = {};
            for (const key of Object.keys(select)) out[key] = a[key];
            return out;
          });
      },
      update: async ({ where, data }) => {
        const index = state.articles.findIndex((a) => a.id === where.id);
        if (index < 0) throw new Error('not found');
        state.articles[index] = { ...state.articles[index], ...data };
        return { ...state.articles[index] };
      },
      count: async ({ where }) => state.articles.filter((a) => a.status === where.status).length,
    },
    auditLog: {
      create: async ({ data }) => {
        const record = { id: `audit-${state.auditLogs.length + 1}`, createdAt: new Date(), ...data };
        state.auditLogs.push(record);
        return record;
      },
    },
  };

  const prismaPath = require.resolve('../../src/lib/prisma.ts');
  require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma } };

  const loggerPath = require.resolve('../../src/lib/logger.ts');
  require.cache[loggerPath] = {
    id: loggerPath,
    filename: loggerPath,
    loaded: true,
    exports: { logger: { info: () => {}, warn: () => {}, error: () => {} }, auditLog: () => {}, redactEmail: (e) => e },
  };

  for (const relativePath of [
    '../../src/services/adminAudit.service.ts',
    '../../src/services/adminContentGovernance.service.ts',
  ]) {
    delete require.cache[require.resolve(relativePath)];
  }

  const governanceService = require('../../src/services/adminContentGovernance.service.ts');

  return { state, governanceService };
}

test('full lifecycle: draft → review → approved → published → archived → revived', async () => {
  const { governanceService, state } = createHarness();

  const submitted = await governanceService.transitionKnowledgeArticle({ articleId: 'art-1', actorId: 'author-1', action: 'SUBMIT_FOR_REVIEW', reason: 'ready' });
  assert.equal(submitted.status, 'REVIEW');

  const approved = await governanceService.transitionKnowledgeArticle({ articleId: 'art-1', actorId: 'reviewer-1', action: 'APPROVE', reason: 'reads well' });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(state.articles[0].publishedAt, null, 'approval must not publish');

  const published = await governanceService.transitionKnowledgeArticle({ articleId: 'art-1', actorId: 'publisher-1', action: 'PUBLISH', reason: 'go live' });
  assert.equal(published.status, 'PUBLISHED');
  assert.ok(state.articles[0].publishedAt, 'publish sets publishedAt');

  const archived = await governanceService.transitionKnowledgeArticle({ articleId: 'art-1', actorId: 'publisher-1', action: 'ARCHIVE', reason: 'outdated' });
  assert.equal(archived.status, 'ARCHIVED');

  const revived = await governanceService.transitionKnowledgeArticle({ articleId: 'art-1', actorId: 'author-1', action: 'REVIVE_TO_DRAFT', reason: 'refresh content' });
  assert.equal(revived.status, 'DRAFT');

  const audit = state.auditLogs.at(-1);
  assert.equal(audit.action, 'ADMIN_KNOWLEDGE_LIFECYCLE');
  assert.equal(audit.metadata.capability, 'CONTENT_AUTHOR');
  assert.equal(audit.metadata.disposition, 'REVIVE_TO_DRAFT');
});

test('invalid transitions are rejected', async () => {
  const { governanceService } = createHarness();

  await assert.rejects(
    () => governanceService.transitionKnowledgeArticle({ articleId: 'art-1', actorId: 'a', action: 'PUBLISH', reason: 'x' }),
    (err) => err.code === 'INVALID_TRANSITION',
    'cannot publish a draft'
  );

  await assert.rejects(
    () => governanceService.transitionKnowledgeArticle({ articleId: 'art-3', actorId: 'a', action: 'APPROVE', reason: 'x' }),
    (err) => err.code === 'INVALID_TRANSITION',
    'cannot approve a published article'
  );

  await assert.rejects(
    () => governanceService.transitionKnowledgeArticle({ articleId: 'missing', actorId: 'a', action: 'APPROVE', reason: 'x' }),
    (err) => err.code === 'ARTICLE_NOT_FOUND'
  );
});

test('unpublish returns to APPROVED and keeps publishedAt as history', async () => {
  const { governanceService, state } = createHarness();
  const result = await governanceService.transitionKnowledgeArticle({ articleId: 'art-3', actorId: 'publisher-1', action: 'UNPUBLISH', reason: 'legal review' });
  assert.equal(result.status, 'APPROVED');
  assert.ok(state.articles[2].publishedAt, 'publishedAt kept as last-publish history');
});

test('re-publishing keeps the original publishedAt', async () => {
  const { governanceService, state } = createHarness();
  const original = state.articles[2].publishedAt;

  await governanceService.transitionKnowledgeArticle({ articleId: 'art-3', actorId: 'p', action: 'UNPUBLISH', reason: 'x' });
  await governanceService.transitionKnowledgeArticle({ articleId: 'art-3', actorId: 'p', action: 'PUBLISH', reason: 'x' });
  assert.equal(state.articles[2].publishedAt, original);
});

test('getEditorialQueues returns review and approved queues', async () => {
  const { governanceService } = createHarness();
  const queues = await governanceService.getEditorialQueues();
  assert.equal(queues.reviewQueue.length, 1);
  assert.equal(queues.reviewQueue[0].id, 'art-2');
  assert.equal(queues.approvedQueue.length, 0);
});
