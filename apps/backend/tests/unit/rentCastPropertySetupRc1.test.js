const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const propertyService = fs.readFileSync(path.resolve(process.cwd(), 'src/services/property.service.ts'), 'utf8');
const assemblers = fs.readFileSync(
  path.resolve(process.cwd(), 'src/modules/propertyContext/infrastructure/prismaAssemblers.ts'),
  'utf8',
);

test('RC-1 schema stores unit-aware versioned provider identity', () => {
  assert.match(schema, /model Property \{[\s\S]*?unit\s+String\?[\s\S]*?addressIdentityVersion\s+Int\s+@default\(1\)/);
  assert.match(schema, /enum PropertyExternalMatchStatus \{[\s\S]*?PENDING[\s\S]*?MATCHED[\s\S]*?NO_MATCH[\s\S]*?AMBIGUOUS[\s\S]*?FAILED[\s\S]*?STALE[\s\S]*?NOT_CONFIGURED/);
  assert.match(schema, /model PropertyExternalIdentity \{[\s\S]*?@@unique\(\[propertyId, provider\]\)[\s\S]*?@@unique\(\[provider, externalId\]\)[\s\S]*?@@index\(\[provider, matchStatus, nextRefreshAt\]\)/);
});

test('RC-1 address changes atomically advance identity and stale provider state', () => {
  assert.match(propertyService, /addressIdentityChanged \? \{ addressIdentityVersion: \{ increment: 1 \} \} : \{\}/);
  assert.match(propertyService, /tx\.propertyExternalIdentity\.updateMany\([\s\S]*?matchStatus: 'STALE'/);
});

test('RC-1 location assembler projects county and county FIPS', () => {
  assert.match(assemblers, /county: true/);
  assert.match(assemblers, /countyFips: true/);
  assert.match(assemblers, /'location\.county': property\.county/);
  assert.match(assemblers, /'location\.countyFips': property\.countyFips/);
});
