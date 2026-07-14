const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

require('ts-node/register');

const testDatabaseUrl = process.env.PERSONALIZATION_TEST_DATABASE_URL;

test('real PostgreSQL rolls back a failed personalization-style transaction', { skip: !testDatabaseUrl }, async () => {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } });
  const key = `test.personalization.rollback.${randomUUID()}`;
  try {
    await assert.rejects(
      prisma.$transaction(async (db) => {
        await db.systemSetting.create({ data: { key, value: { temporary: true } } });
        throw new Error('force rollback');
      }),
      /force rollback/,
    );
    assert.equal(await prisma.systemSetting.findUnique({ where: { key } }), null);
  } finally {
    await prisma.systemSetting.deleteMany({ where: { key } });
    await prisma.$disconnect();
  }
});
