const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({ transpileOnly: true });

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');
const { AskPresentationBlockSchema, ASK_PRESENTATION_FAMILIES } = require('../../src/productFramework/ask/ask.contract.ts');

// UI review 2026-11-21, slice 2 (and item 9 of the implementation priorities): every cross-domain answer selects one presentation family, and a list of a record type that has a
// canonical renderer declares its kind, so the client never infers either from a block id. Every block must also pass the real contract schema, so the new fields survive persistence.
const PROMPTS = [
  'what claims are open?',
  'which active projects still need a permit?',
  'what claims are open and which active projects still need a permit?',
  'how long until owning beats renting?',
  'would refinancing break even within three years?',
  'which appliances have no warranty?',
  'show maintenance tasks due next month',
  'how many appliances do I have?',
  'show recent repairs',
  'what is on my seller readiness checklist?',
];

const KIND_OF_SOURCE = { InventoryItem: 'INVENTORY_ITEM', Claim: 'CLAIM', PropertyPermitRecord: 'PERMIT', Warranty: 'WARRANTY', HomeEvent: 'HOME_EVENT', PropertyMaintenanceTask: 'MAINTENANCE_TASK' };

const run = async (rawText) => {
  const snapshot = buildSeededCrossDomainSnapshot();
  const execution = await X.executeCrossDomainSnapshot({ rawText, snapshot, role: 'OWNER', propertyAuthorized: true });
  return { execution, operation: X.buildOperationResultFromCrossDomainExecution(execution) };
};

for (const prompt of PROMPTS) {
  test(`"${prompt}": every block passes the contract, the answer declares a family, and typed lists declare their kind`, async () => {
    const { execution, operation } = await run(prompt);
    if (execution.status !== 'ANSWERED' && execution.status !== 'PARTIAL') return; // clarifications and boundaries are covered by their own suites
    for (const block of operation.blocks) {
      const parsed = AskPresentationBlockSchema.safeParse(block);
      assert.ok(parsed.success, `${block.id}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 2))}`);
    }
    const summaries = operation.blocks.filter((b) => b.type === 'SUMMARY');
    assert.ok(summaries.length > 0);
    for (const summary of summaries) {
      if (summary.id === operation.parameters?.semanticExecutionReceipt?.answerVariantId || summary.id === 'cross-domain-summary') {
        assert.ok(ASK_PRESENTATION_FAMILIES.includes(summary.presentationFamily), `${summary.id} declares no presentation family`);
      }
    }
    for (const facet of execution.facetResults) {
      const sourceType = facet.receipt?.provenance.sourceType;
      const list = (facet.blocks ?? []).find((b) => b.type === 'GROUPED_LIST' && !b.id.endsWith('-needs-confirmation'));
      if (list && KIND_OF_SOURCE[sourceType]) assert.equal(list.recordKind, KIND_OF_SOURCE[sourceType], `${prompt}: ${list.id} is a ${sourceType} list without its record kind`);
    }
  });
}

test('analyses and comparisons declare their family; a count is a direct answer', async () => {
  const own = await run('how long until owning beats renting?');
  assert.equal(own.execution.facetResults[0].blocks.find((b) => b.type === 'SUMMARY').presentationFamily, 'ANALYSIS');
  const refi = await run('would refinancing break even within three years?');
  assert.equal(refi.execution.facetResults[0].blocks.find((b) => b.type === 'SUMMARY').presentationFamily, 'ANALYSIS');
  const count = await run('how many appliances do I have?');
  const facet = count.execution.facetResults[0];
  if (facet.receipt?.projection === 'COUNT') assert.equal(facet.blocks.find((b) => b.type === 'SUMMARY').presentationFamily, 'DIRECT_ANSWER');
});

test('a compound claims and permits answer keeps the canonical ids and declares both kinds', async () => {
  const { operation } = await run('what claims are open and which active projects still need a permit?');
  const kinds = Object.fromEntries(operation.blocks.filter((b) => b.type === 'GROUPED_LIST').map((b) => [b.id, b.recordKind]));
  assert.equal(kinds['incident-claim-list'], 'CLAIM');
  assert.ok(operation.blocks.find((b) => b.type === 'SUMMARY').presentationFamily);
});
