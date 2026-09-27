const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// S5c: the workflows whose document references are plain ids and that do not depend on a legacy foreign key convert reader and writer together:
// the Service Price Radar's linked document and the onboarding activation evidence. What is NOT converted here is pinned too, with the reason,
// so a well-meaning change cannot break a foreign key: claims, hazard evidence and coverage-comparison sources hold real foreign keys to
// `documents`, Ask's recent-document context feeds HomeEventDocument.documentId (a foreign key), and Ask's evidence attach writes the legacy
// link columns that the inventory and warranty screens read (converts with S5d).
const backendRoot = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const readFrontend = (relative) => fs.readFileSync(path.resolve(backendRoot, '../frontend/src', relative), 'utf8');

test('the Service Price Radar resolves a linked document as a Home Record with the caller\'s role, and its picker lists Home Records', () => {
  const service = read('src/services/servicePriceRadar.service.ts');
  assert.match(service, /resolvePropertyDocuments\(\{ propertyId, role: access\.role, ids: \[linkedEntityId\] \}\)/);
  assert.doesNotMatch(service, /prisma\.document\./);
  const client = readFrontend('app/(dashboard)/dashboard/properties/[id]/tools/service-price-radar/ServicePriceRadarClient.tsx');
  assert.match(client, /listRecords\(propertyId, \{ lifecycleStatus: 'ACTIVE' \}\)/);
  assert.doesNotMatch(client, /listPropertyDocuments/);
});

test('onboarding activation evidence is a Home Record the caller added, and the upload goes to Home Records', () => {
  const service = read('src/services/entryContext.service.ts');
  assert.match(service, /prisma\.propertyRecord\.findFirst\(\{\s*where: \{ id: input\.documentId, propertyId, createdByUserId: userId, lifecycleStatus: \{ not: 'TRASHED' \} \}/);
  assert.doesNotMatch(service, /prisma\.document\./);
  assert.match(service, /countPropertyDocuments\(\{ propertyId, includeLegacy: true \}\)/);
  const page = readFrontend('app/onboarding/first-value/page.tsx');
  assert.match(page, /uploadRecordForWorkflow\(/);
  assert.doesNotMatch(page, /api\.uploadDocument\(/);
});

test('the pieces that still depend on the legacy table are pinned, with the reason they cannot move yet', () => {
  // Foreign key: ClaimDocument.documentId -> documents (cascade).
  assert.match(read('prisma/schema.prisma'), /model ClaimDocument \{[\s\S]*?document Document @relation\(fields: \[documentId\], references: \[id\], onDelete: Cascade\)/);
  // Ask's recent-document context feeds a foreign key, and says so.
  const capture = read('src/services/ask/conversationalUnderstanding/conversationalCapture.ts');
  assert.match(capture, /prisma\.document\.findMany/);
  assert.match(capture, /HomeEventDocument\.documentId, a foreign key to `documents`/);
  assert.match(read('prisma/schema.prisma'), /model HomeEventDocument \{[\s\S]*?document Document\s+@relation\(fields: \[documentId\], references: \[id\], onDelete: Cascade\)/);
  // Evidence attach writes the legacy link columns the inventory and warranty screens read.
  assert.match(read('src/services/ask/handlers/captureConfirm.handler.ts'), /prisma\.document\.updateMany/);
});
