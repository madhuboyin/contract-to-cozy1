// Regenerates apps/frontend/e2e/ask/workEvidenceFixtures.ts from the REAL HOME_WORK_ITEM_COMMAND handlers (FRD 1.402): the same forms, option values and
// labels, review cards and receipts production builds, with only Prisma and the document inventory faked. Run: TS_NODE_TRANSPILE_ONLY=1 node scripts/generate-work-evidence-fixtures.js
require('ts-node/register');
const fs = require('node:fs');
const path = require('node:path');
const sharpPath = require.resolve('sharp');
require.cache[sharpPath] = { id: sharpPath, filename: sharpPath, loaded: true, exports: () => { throw new Error('sharp is stubbed'); }, children: [], paths: [] };

const propertyAccess = require('../src/services/propertyAccess.service.ts');
const { capabilityInvoke } = require('../src/services/ask/capabilityHandlerRegistry.ts');
const { confirmCapabilityInvoke } = require('../src/services/ask/confirmCapabilityHandlerRegistry.ts');
const { getAskDomainCommandByOperation } = require('../src/services/ask/askDomainCommandRegistry.ts');
const executeOperation = require('../src/services/ask/execution/executeOperation.ts');
require('../src/services/ask/askOrchestrator.service.ts');
const getUse = require('../src/modules/homeOperations/application/getWorkItem.usecase.ts');
const recordUse = require('../src/modules/homeOperations/application/recordEvidence.usecase.ts');
const removeUse = require('../src/modules/homeOperations/application/removeEvidence.usecase.ts');
const docs = require('../src/services/propertyDocuments/propertyDocumentInventory.service.ts');
const { prisma } = require('../src/lib/prisma.ts');
const command = require('../src/services/ask/support/homeWorkItemCommand.ts');
const { workItemCommandResult } = require('../src/services/ask/handlers/homeWorkItemCommands.handler.ts');
const { AskPresentationBlockSchema, AskCaptureRequestSchema } = require('../src/productFramework/ask/ask.contract.ts');

const OP = 'HOME_WORK_ITEM_COMMAND';
const WORK = { id: 'work-1', propertyId: 'acceptance-home', title: 'Chimney cleaning and inspection', state: 'ACCEPTED', safetyTier: 'LOW_CONSEQUENCE', obligationType: 'MAINTENANCE', dueAt: new Date('2026-11-03T12:00:00Z'), dueWindowStart: null, dueWindowEnd: null, snoozedUntil: null, supersededByWorkItemId: null, ownerUserId: null, isRoutine: false };

function install({ role = 'CONTRIBUTOR', attached = [], removable = [], withRecords = true, manyDocs = false }) {
  propertyAccess.resolvePropertyAccess = async () => ({ role, userId: 'u1', propertyId: 'acceptance-home' });
  getUse.getWorkItem = async (id) => (id === WORK.id ? WORK : null);
  executeOperation.reconcileAskExecutionSideEffects = async () => ({ attemptedAndFailed: false, refreshedExecutions: [] });
  recordUse.recordEvidence = async () => ({});
  removeUse.removeEvidence = async () => ({ removed: true });
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `doc-${i + 1}`, title: `Record ${i + 1}.pdf` }));
  docs.listPropertyDocuments = async () => ({ items: manyDocs ? many : withRecords ? [{ id: 'doc-1', title: 'Chimney invoice.pdf' }, { id: 'doc-2', title: 'Sweep photo.jpg' }, { id: 'doc-3', title: 'Already attached.pdf' }] : [] });
  docs.resolvePropertyDocuments = async ({ ids }) => ids.filter((id) => manyDocs || ['doc-1', 'doc-2'].includes(id)).map((id) => ({ id, title: manyDocs ? `Record ${id.slice(4)}.pdf` : id === 'doc-1' ? 'Chimney invoice.pdf' : 'Sweep photo.jpg' }));
  prisma.operationalWorkEvidence = { findMany: async (q) => (q.where.evidenceType ? removable : attached), findFirst: async () => null };
  prisma.homeEvent = { findMany: async () => (withRecords ? [{ id: 'ev-1', title: 'Annual inspection', occurredAt: new Date('2026-09-02T00:00:00Z') }] : []), findFirst: async ({ where }) => (where.id === 'ev-1' ? { title: 'Annual inspection' } : null) };
  prisma.propertyFactEvidence = { findMany: async () => (withRecords ? [{ id: 'pf-1', factKey: 'chimney.lastSweepYear', observedAt: new Date() }] : []), findFirst: async ({ where }) => (where.id === 'pf-1' ? { factKey: 'chimney.lastSweepYear' } : null) };
  prisma.document = { findMany: async () => [{ id: 'doc-9', name: 'Old photo.jpg' }] };
}

const stage = (r) => ({
  status: r.status, reasonCode: r.reasonCode, contextVersion: r.contextVersion ?? null,
  blocks: r.blocks.map((block) => AskPresentationBlockSchema.parse(block)),
  captureRequests: (r.captureRequests ?? []).map((request) => AskCaptureRequestSchema.parse(request)),
  confirmation: r.confirmation ?? null, suggestions: r.suggestions ?? [],
});
const launch = { operationId: OP, surface: 'ASK_PAGE', entityType: command.WORK_ITEM_ENTITY_TYPE, entityId: WORK.id };
const ctx = (parameters) => ({ userId: 'u1', execution: { id: 'exec-1', propertyId: 'acceptance-home', createdAt: new Date() }, access: { role: 'CONTRIBUTOR' }, parameters, command: getAskDomainCommandByOperation(OP) });

async function flow(kind, answer, opts = {}) {
  install(opts);
  const form = await capabilityInvoke(OP, { userId: 'u1', propertyId: 'acceptance-home', message: command.WORK_ITEM_MESSAGES[kind], launchContext: launch });
  if (!answer || form.status !== 'NEEDS_CONTEXT') return { form: stage(form) };
  const review = await workItemCommandResult('u1', 'acceptance-home', { kind, entityId: WORK.id, sourceExecutionId: null }, answer);
  const done = await confirmCapabilityInvoke(OP, ctx(review.parameters));
  return { form: stage(form), review: stage(review), done: stage(done.result) };
}

(async () => {
  const out = {
    messages: command.WORK_ITEM_MESSAGES,
    attach: await flow('ATTACH_EXISTING', { record: 'DOCUMENT:doc-1' }, { attached: [{ evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-3' }] }),
    attachMany: await flow('ATTACH_EXISTING', { record: 'DOCUMENT:doc-7' }, { manyDocs: true }),
    submit: await flow('SUBMIT_COMPLETION_EVIDENCE', { record: 'HOME_EVENT:ev-1' }, { attached: [{ evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-3' }] }),
    remove: await flow('REMOVE_EVIDENCE', { evidence: 'row-1' }, { removable: [{ id: 'row-1', evidenceType: 'DOCUMENT', evidenceEntityId: 'doc-9', observedAt: new Date() }] }),
    emptyAttach: await flow('ATTACH_EXISTING', null, { withRecords: false }),
    emptyRemove: await flow('REMOVE_EVIDENCE', null, { removable: [] }),
    viewer: await flow('ATTACH_EXISTING', null, { role: 'VIEWER' }),
  };
  const target = path.join(__dirname, '../../frontend/e2e/ask/workEvidenceFixtures.ts');
  fs.writeFileSync(target, `// Generated by apps/backend/scripts/generate-work-evidence-fixtures.js from the real HOME_WORK_ITEM_COMMAND handlers (FRD 1.402). Do not hand-edit.\nexport const WORK_EVIDENCE = ${JSON.stringify(out, null, 1)} as const;\n`);
  console.log('wrote', target, Object.keys(out).join(','));
  process.exit(0);
})().catch((error) => { console.error(error); process.exit(1); });
