const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

require('ts-node/register');

// Project Create parity (continuation FRD section 29): the Desktop controller and Ask create a project through ONE shared service that owns the gates, the guidance proof,
// the analytics and the first-milestone lifecycle event, and the idempotency rule. No database, browser or native module.

const { prisma } = require('../../src/lib/prisma.ts');
const projectService = require('../../src/services/projectTracker.service.ts');
const featureContext = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const compliance = require('../../src/services/projectCompliance/context.ts');
const analytics = require('../../src/services/analytics/index.ts');
const toolLifecycle = require('../../src/services/analytics/toolLifecycle.ts');
const reporting = require('../../src/services/guidanceEngine/projectJourneyReporting.ts');
const { createProjectWithEffects } = require('../../src/services/projectTrackerOperations.ts');
const { APIError } = require('../../src/middleware/error.middleware.ts');

let calls; let canExecute; let complianceRefuses; let existing; let saved;
const BODY = { name: 'New roof', projectType: 'ROOF_REPLACEMENT', serviceCategory: 'ROOFING', fulfillmentMode: 'PROVIDER', contractorName: 'Acme', contractAmountCents: 1850000, startDate: '2026-11-01',
  milestones: [{ name: 'Tear off', milestoneType: 'STANDARD', requiresPhotoEvidence: false, position: 0 }] };

test.beforeEach(() => {
  calls = { order: [], create: [], track: [], lifecycle: [], report: [] }; canExecute = true; complianceRefuses = false; existing = null;
  saved = { create: projectService.createProject, evalCtx: featureContext.evaluateFeatureContext, compliance: compliance.assertProjectComplianceApplicable, track: analytics.analyticsEmitter.track,
    lifecycle: toolLifecycle.recordToolLifecycleEvents, report: reporting.reportProjectCreated, project: prisma.projectRecord };
  featureContext.evaluateFeatureContext = async (...args) => { calls.order.push('feature'); calls.feature = args; return { canExecute }; };
  compliance.assertProjectComplianceApplicable = async (...args) => { calls.order.push('compliance'); calls.compliance = args; if (complianceRefuses) throw new APIError('Local rules need review first.', 409, 'COMPLIANCE_REQUIRED'); return { contextVersion: 'ctx' }; };
  projectService.createProject = async (propertyId, data) => { calls.order.push('create'); calls.create.push([propertyId, data]); return { id: 'proj-1', milestones: [{ id: 'm1', name: 'Tear off', scheduledDate: new Date('2026-11-02T00:00:00Z') }] }; };
  analytics.analyticsEmitter.track = (event) => { calls.track.push(event); };
  toolLifecycle.recordToolLifecycleEvents = async (input) => { calls.lifecycle.push(input); };
  reporting.reportProjectCreated = async (...args) => { calls.report.push(args); return true; };
  prisma.projectRecord = { findFirst: async (args) => { calls.reuse = args.where; return existing; } };
});
test.afterEach(() => {
  projectService.createProject = saved.create; featureContext.evaluateFeatureContext = saved.evalCtx; compliance.assertProjectComplianceApplicable = saved.compliance;
  analytics.analyticsEmitter.track = saved.track; toolLifecycle.recordToolLifecycleEvents = saved.lifecycle; reporting.reportProjectCreated = saved.report; prisma.projectRecord = saved.project;
});

test('the property-responsibility gate and the compliance applicability check run first, with the same inputs, and a refusal creates nothing', async () => {
  const out = await createProjectWithEffects('p1', 'u1', BODY);
  assert.deepEqual(calls.order.slice(0, 3), ['feature', 'compliance', 'create']);
  assert.deepEqual(calls.feature, ['p1', 'u1', { featureKey: 'PROJECTS', operationKey: 'CREATE_PROJECT', operationInput: { projectType: 'ROOF_REPLACEMENT', serviceCategory: 'ROOFING', homeSystemsAffected: [] } }]);
  assert.deepEqual(calls.compliance.slice(0, 2), ['p1', 'u1']);
  assert.equal(calls.compliance[2], 'PROJECT_TRACKER');
  assert.equal(calls.compliance[4], 'ownerProjectExecution');
  assert.equal(out.project.id, 'proj-1');
  calls.order.length = 0; calls.create.length = 0; canExecute = false;
  await assert.rejects(() => createProjectWithEffects('p1', 'u1', BODY), (e) => e instanceof APIError && e.code === 'PROPERTY_CONTEXT_INCOMPLETE' && e.statusCode === 409);
  canExecute = true; complianceRefuses = true;
  await assert.rejects(() => createProjectWithEffects('p1', 'u1', BODY), (e) => e.code === 'COMPLIANCE_REQUIRED');
  assert.equal(calls.create.length, 0, 'a refused gate creates nothing, on either surface');
});

test('the create analytics event and the first-milestone lifecycle event are emitted once, from the service', async () => {
  await createProjectWithEffects('p1', 'u1', { ...BODY, sourceActionId: 'act-1' });
  assert.deepEqual(calls.track.map((e) => [e.eventType, e.userId, e.propertyId, e.metadataJson.actionType, e.metadataJson.projectId]), [['ACTION_COMPLETED', 'u1', 'p1', 'create_project', 'proj-1']]);
  assert.equal(calls.lifecycle.length, 1);
  assert.equal(calls.lifecycle[0].userId, 'u1');
  assert.equal(calls.lifecycle[0].events[0].projectId ?? calls.lifecycle[0].events[0].metadata?.projectId ?? 'proj-1', 'proj-1');
  assert.equal(JSON.stringify(calls.lifecycle[0].events[0]).includes('act-1'), true, 'the originating action is carried');
});

test('a journey named on the project is reported through the shared reporter, and its result is returned; none named, nothing reported', async () => {
  const out = await createProjectWithEffects('p1', 'u1', { ...BODY, guidanceJourneyId: 'j1', inventoryItemId: 'item-1', fundingMode: 'CASH' });
  assert.deepEqual([calls.report[0][0], calls.report[0][1], calls.report[0][2].projectId, calls.report[0][2].journeyId, calls.report[0][2].inventoryItemId, calls.report[0][2].fundingMode], ['p1', 'u1', 'proj-1', 'j1', 'item-1', 'CASH']);
  assert.equal(out.guidanceReported, true);
  calls.report.length = 0;
  assert.equal((await createProjectWithEffects('p1', 'u1', BODY)).guidanceReported, null);
  assert.equal(calls.report.length, 0);
});

test('idempotency is one rule: with an anchor, a project of the same name created since it is the operation\'s own earlier write and nothing happens again; the page passes none', async () => {
  existing = { id: 'proj-0' };
  const since = new Date('2026-10-24T00:00:00Z');
  const out = await createProjectWithEffects('p1', 'u1', BODY, { reuseCreatedSince: since });
  assert.deepEqual([out.reused, out.project.id, calls.create.length, calls.track.length, calls.lifecycle.length], [true, 'proj-0', 0, 0, 0]);
  assert.deepEqual({ ...calls.reuse, createdAt: calls.reuse.createdAt.gte.toISOString() }, { propertyId: 'p1', name: 'New roof', createdAt: since.toISOString() });
  calls.order.length = 0;
  const fresh = await createProjectWithEffects('p1', 'u1', BODY);
  assert.equal(fresh.reused, false);
  assert.equal(calls.create.length, 1);
});

test('both surfaces create through the service: the controller and the Ask confirmation no longer call the project service\'s create directly or repeat its side effects', () => {
  const controller = fs.readFileSync(require.resolve('../../src/controllers/projectTracker.controller.ts'), 'utf8');
  const handler = fs.readFileSync(require.resolve('../../src/services/ask/handlers/projectTracker.handler.ts'), 'utf8');
  for (const [name, source] of [['controller', controller], ['ask handler', handler]]) {
    assert.match(source, /createProjectWithEffects\(/, name);
    assert.equal(/\bsvc\.createProject\(|[^A-Za-z]createProject\(ctx\.execution/.test(source), false, `${name} must not create directly`);
    assert.equal(/evaluateFeatureContext\(/.test(source), false, `${name} must not run the gate itself`);
    assert.equal(/actionType: 'create_project'/.test(source), false, `${name} must not emit the create event itself`);
  }
});
