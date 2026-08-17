const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '../..');
const service = fs.readFileSync(path.join(backendRoot, 'src/services/buyerAcquisition.service.ts'), 'utf8');
const schema = fs.readFileSync(path.join(backendRoot, 'prisma/schema.prisma'), 'utf8');
const contract = fs.readFileSync(path.join(backendRoot, 'src/productFramework/buyerAcquisition.contract.ts'), 'utf8');
const frontendTypes = fs.readFileSync(path.resolve(backendRoot, '../frontend/src/types/index.ts'), 'utf8');

test('buyer tasks retain the canonical Home Operations obligation identity', () => {
  assert.match(schema, /canonicalWorkItemId\s+String\?/);
  assert.match(schema, /canonicalWorkItem\s+OperationalWorkItem\?\s+@relation\("BuyerTaskCanonicalWorkItem"/);
  assert.match(schema, /buyerTasks\s+HomeBuyerTask\[\]\s+@relation\("BuyerTaskCanonicalWorkItem"\)/);
  assert.match(contract, /canonicalWorkItemId: z\.string\(\)\.nullable\(\)/);
  assert.match(frontendTypes, /canonicalWorkItemId: string \| null/);
});

test('finding disposition resolves one work item and links both guidance branches', () => {
  const method = service.slice(
    service.indexOf('static async dispositionFinding'),
    service.indexOf('static async ensureRecurringHandoff'),
  );

  assert.match(method, /inspectionFindingSourceAdapter\.propose\(\{ \.\.\.finding, status: 'OPEN' \}, propertyId\)/);
  assert.match(method, /resolveAndUpsertWorkItem\(proposal\)/);
  assert.match(method, /workItem\.state === 'CANDIDATE'/);
  assert.match(method, /to: 'ACCEPTED'/);
  assert.match(method, /canonicalWorkItemId,/);
  assert.match(method, /executionType: 'GUIDANCE'/);
  assert.match(method, /guidanceExecutions\.set\(journeyId, 'SUPPORTING'\)/);
  assert.match(method, /guidanceExecutions\.set\(repairJourneyId, 'PRIMARY'\)/);
  assert.match(method, /tx\.operationalWorkExecution\.upsert/);
});

test('buyer handoff reuses an existing execution before creating maintenance', () => {
  const helper = service.slice(
    service.indexOf('private static async materializeHandoffTask'),
    service.indexOf('static async updateLifecycle'),
  );
  const recurring = service.slice(
    service.indexOf('static async ensureRecurringHandoff'),
    service.indexOf('static async getAcceptanceStatus'),
  );

  assert.match(helper, /tx\.operationalWorkExecution\.findMany/);
  assert.match(helper, /executionType === 'MAINTENANCE_TASK'/);
  assert.match(helper, /\['PROJECT', 'GUIDANCE'\]\.includes\(execution\.executionType\)/);
  assert.match(helper, /tx\.propertyMaintenanceTask\.upsert/);
  assert.match(helper, /executionType: 'MAINTENANCE_TASK'/);
  assert.match(recurring, /this\.materializeHandoffTask/);
  assert.doesNotMatch(recurring, /tx\.propertyMaintenanceTask\.upsert/);
});
