const test = require('node:test');
const assert = require('node:assert/strict');

const databaseUrl = process.env.PHASE3_ACCEPTANCE_DATABASE_URL;

test('owner-applied database supports Phase 3 verified closure integrity', { skip: !databaseUrl }, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const requiredColumns = {
      project_records: ['outcomeStatus', 'verifiedAt', 'followUpHealth', 'followUpCompletedAt', 'writeBackAppliedAt'],
      documents: ['projectId', 'projectProofKey'],
      expenses: ['projectId'],
      warranties: ['projectId'],
      home_events: ['projectId', 'guidanceJourneyId'],
      reviews: ['projectId', 'guidanceJourneyId', 'verifiedOutcome', 'priceVarianceCents'],
      property_maintenance_tasks: ['completionMetadata'],
    };
    const schemaRows = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `, [Object.keys(requiredColumns)]);
    const present = new Set(schemaRows.rows.map((row) => `${row.table_name}.${row.column_name}`));
    for (const [table, columns] of Object.entries(requiredColumns)) {
      for (const column of columns) assert.ok(present.has(`${table}.${column}`), `Missing owner-applied column ${table}.${column}`);
    }

    const integrity = await client.query(`
      SELECT p.id
      FROM project_records p
      LEFT JOIN home_events h ON h."projectId" = p.id
      LEFT JOIN expenses e ON e."projectId" = p.id
      WHERE p."outcomeStatus" = 'VERIFIED_SUCCESS'
        AND p."writeBackAppliedAt" IS NOT NULL
        AND (h.id IS NULL OR e.id IS NULL)
      LIMIT 20
    `);
    assert.deepEqual(integrity.rows, [], 'Verified closure has missing HomeEvent or expense write-back');

    const duplicateProof = await client.query(`
      SELECT "projectProofKey", COUNT(*)::int AS count
      FROM documents
      WHERE "projectProofKey" IS NOT NULL
      GROUP BY "projectProofKey"
      HAVING COUNT(*) > 1
    `);
    assert.deepEqual(duplicateProof.rows, [], 'Project proof idempotency keys are duplicated');
  } finally {
    await client.end();
  }
});
