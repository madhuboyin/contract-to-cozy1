const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('ts-node/register');

// The pgAdmin SQL twin of scripts/measure-asset-identity-conflicts.ts (FRD v1.178).
const { ASSET_DISPLAY_LABELS } = require('../../src/productFramework/homeAssetDisplay.ts');
const { riskRowIdentity, isRiskActionable } = require('../../src/services/riskRowIdentity.ts');

const SQL_PATH = path.resolve(__dirname, '../../scripts/2026-09-30-measure-asset-identity-conflicts.sql');
const sql = fs.readFileSync(SQL_PATH, 'utf8');
const code = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const queries = code.split(/^WITH amap/m).slice(1).map((body) => `WITH amap${body}`);

test('the file is three self-contained queries that share one identical WITH block', () => {
  assert.equal(queries.length, 3);
  const withBlock = (query) => query.slice(0, query.search(/\nSELECT\n/));
  assert.ok(withBlock(queries[0]).length > 1000);
  assert.equal(withBlock(queries[1]), withBlock(queries[0]));
  assert.equal(withBlock(queries[2]), withBlock(queries[0]));
});

test('it is read-only: no statement other than SELECT/WITH, and nothing that creates or changes anything', () => {
  assert.doesNotMatch(code, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY|VACUUM|REINDEX|LOCK)\b/i);
  assert.equal((code.match(/;/g) ?? []).length, 3, 'exactly three statements');
  for (const query of queries) assert.match(query.trimStart(), /^WITH /);
});

test('its label table is exactly the TypeScript one, in both directions', () => {
  const block = queries[0].slice(queries[0].indexOf('VALUES'), queries[0].indexOf('), rows AS'));
  const pairs = [...block.matchAll(/\('([^']+)',\s*'([^']+)'\)/g)].map((match) => [match[1], match[2]]);
  assert.deepEqual(Object.fromEntries(pairs), ASSET_DISPLAY_LABELS);
  assert.equal(pairs.length, Object.keys(ASSET_DISPLAY_LABELS).length, 'no duplicate or missing rows');
});

test('it uses the same trimming, key normalisation and fallbacks as the TypeScript predicate', () => {
  const q = queries[0];
  // identifierKey: camelCase split, non-alphanumerics to "_", edge "_" trimmed, upper-cased.
  assert.ok(q.includes("'([a-z0-9])([A-Z])', '\\1_\\2', 'g'"));
  assert.ok(q.includes("'[^a-zA-Z0-9]+', '_', 'g'"));
  assert.ok(q.includes("'^_+|_+$', '', 'g'"));
  // The feed's fallbacks: systemType ?? assetName ?? 'Unknown', and title = assetName || systemType.
  assert.ok(q.includes("COALESCE(rows.d->>'systemType', rows.d->>'assetName', 'Unknown')"));
  assert.ok(q.includes("NULLIF(rows.d->>'assetName', '')"));
  // The hash/prefix literal: '_' is a LIKE wildcard, so the inert check uses left() with the real length.
  assert.ok(q.includes("left(system_type, 16) = 'MAJOR_APPLIANCE_'"));
  assert.equal('MAJOR_APPLIANCE_'.length, 16);
  assert.doesNotMatch(q, /LIKE\s+'MAJOR_APPLIANCE/i);
  // actionable must never be NULL ("false OR false OR NULL" is NULL).
  assert.match(q, /COALESCE\(\s*upper\([\s\S]*?,\s*false\s*\) AS actionable/);
});

// Opt-in: execute the SQL on a real Postgres and compare every row with the TypeScript functions.
// Run with RUN_SQL_PARITY=1 (and Postgres binaries on PATH, or PG_BIN=/path/to/bin). Skipped otherwise.
const PG_BIN = process.env.PG_BIN || '/usr/local/opt/postgresql@15/bin';
const pgAvailable = fs.existsSync(path.join(PG_BIN, 'initdb')) && fs.existsSync(path.join(PG_BIN, 'psql')) && fs.existsSync(path.join(PG_BIN, 'pg_ctl'));

test('executed on a real Postgres, every row agrees with the TypeScript functions, and the file writes nothing', { skip: !(process.env.RUN_SQL_PARITY === '1' && pgAvailable) && 'set RUN_SQL_PARITY=1 with Postgres binaries available' }, () => {
  const bin = (name) => path.join(PG_BIN, name);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c2c-sql-parity-'));
  const port = String(55400 + Math.floor(Math.random() * 500));
  const run = (command, args, input) => spawnSync(bin(command), args, { input, encoding: 'utf8' });
  const psql = (input, extra = []) => {
    const result = run('psql', ['-h', '127.0.0.1', '-p', port, '-U', 'scratch', '-d', 'scratchdb', '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra], input);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    assert.equal(run('initdb', ['-D', path.join(dir, 'data'), '-A', 'trust', '-U', 'scratch']).status, 0);
    const started = run('pg_ctl', ['-D', path.join(dir, 'data'), '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=''`, '-l', path.join(dir, 'server.log'), '-w', 'start']);
    assert.equal(started.status, 0, started.stderr);
    assert.equal(run('psql', ['-h', '127.0.0.1', '-p', port, '-U', 'scratch', '-d', 'postgres', '-X', '-q', '-c', 'create database scratchdb']).status, 0);

    const identities = [
      { assetName: 'WASHER', systemType: 'DISHWASHER' }, { assetName: 'FRIDGE', systemType: 'REFRIGERATOR' }, { assetName: 'clothesWasher', systemType: 'DRYER' },
      { assetName: 'Washer', systemType: 'Dryer' }, { assetName: ' washer ', systemType: 'Stove' }, { assetName: '', systemType: 'DISHWASHER' }, { assetName: null, systemType: 'OVEN' },
      { assetName: 'WASHER' }, {}, { assetName: 'MY_DRYER', systemType: 'MAJOR_APPLIANCE_REFRIGERATOR' }, { assetName: 'HVAC Furnace', systemType: 'HVAC_FURNACE' },
      { assetName: 'Smoke & CO Detector Check', systemType: 'SAFETY_SMOKE_CO_DETECTORS' }, { assetName: 'hvac-heat-pump', systemType: 'ROOF_SHINGLE' },
      { assetName: 'Water Heater', systemType: 'WATER_HEATER_TANKLESS' }, { assetName: 'Clothes Dryer', systemType: 'CLOTHES_DRYER' }, { assetName: '__range__', systemType: 'stove' },
      { assetName: 'HVACFilter', systemType: 'HVAC_FILTER_CHECK' }, { systemType: 'DISHWASHER', assetName: 'washing machine' },
    ];
    const actions = [{}, { riskLevel: 'high' }, { riskLevel: ' critical ' }, { severity: 'HIGH' }, { status: 'needs_review' }, { recommendedAction: '  ' }, { recommendedAction: 'Service it' }, { riskLevel: null, severity: 'CRITICAL' }, { riskLevel: 'LOW', status: 'OK' }];
    const fixtures = identities.flatMap((identity) => actions.map((action) => ({ ...identity, ...action })));
    const esc = (value) => value.replace(/'/g, "''");
    psql(`CREATE TABLE risk_assessment_reports ("propertyId" text PRIMARY KEY, details jsonb NOT NULL, "lastCalculatedAt" timestamp NOT NULL);\n`
      + fixtures.map((detail, index) => `INSERT INTO risk_assessment_reports VALUES ('r${index}', '${esc(JSON.stringify([detail]))}'::jsonb, now());`).join('\n'));

    // The file's own WITH block, with a per-row SELECT in place of the summary.
    const withBlock = queries[0].slice(0, queries[0].search(/\nSELECT\n/));
    const output = psql(`${withBlock}\nSELECT property_id, coalesce(named_label,'~'), coalesce(typed_label,'~'), conflict, actionable, system_type, title FROM flagged ORDER BY length(property_id), property_id;`, ['-At', '-F', '|']);
    const sqlRows = output.trim().split('\n').map((line) => { const [, named, typed, conflict, actionable, systemType, title] = line.split('|'); return { named, typed, conflict, actionable, systemType, title }; });
    assert.equal(sqlRows.length, fixtures.length);
    fixtures.forEach((detail, index) => {
      const identity = riskRowIdentity(detail);
      assert.deepEqual(sqlRows[index], {
        named: identity.namedLabel ?? '~', typed: identity.typedLabel ?? '~', conflict: identity.conflict ? 't' : 'f',
        actionable: isRiskActionable(detail) ? 't' : 'f', systemType: identity.systemType, title: identity.title,
      }, JSON.stringify(detail));
    });

    // The whole file, unmodified, inside a READ ONLY transaction: any write would fail the run.
    const wrapper = path.join(dir, 'wrapper.sql');
    fs.writeFileSync(wrapper, `BEGIN READ ONLY;\n\\i ${SQL_PATH}\nROLLBACK;\n`);
    assert.match(psql(undefined, ['-f', wrapper]), /actionable_conflicts/);
  } finally {
    run('pg_ctl', ['-D', path.join(dir, 'data'), '-m', 'immediate', 'stop']);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
