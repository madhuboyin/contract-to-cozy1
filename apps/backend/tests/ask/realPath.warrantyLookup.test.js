// FR-GATE-2 real-path evidence for WARRANTY_LOOKUP: the real handler, run through capabilityInvoke for each variant this file can drive, against a fake prisma (the boundary the existing warranty tests use).
// Review screenshot (2026-11-20): "show appliances that have open recalls and no active warranty" was withheld when the answer was "Recall check incomplete" (appliances with no model number), because the operation had
// no runtime answer contract and the text-similarity check judged the recall wording to belong to another operation.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register');
const prismaModule = require('../../src/lib/prisma.ts');
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const { matchesOperationAnswerContract } = require('../../src/services/ask/answerContract/operationAnswerContract.ts');
const { validateAskAnswerTrustPipeline } = require('../../src/services/ask/askAnswerTrustValidator.ts');
const { attachAskAuthoritativeSourceEvidence, completedAskAuthoritativeSourceEvidence } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { conformRealPath } = require('./support/realPathContract');

const realPrisma = prismaModule.prisma; const originalAccess = propertyAccess.resolvePropertyAccess;
const day = (offset) => new Date(Date.now() + offset * 86_400_000);
const warrantyRow = (id, inventoryItemId, startOffset, expiryOffset) => ({ id, propertyId: 'p1', providerName: `Provider ${id}`, category: 'APPLIANCE', coverageDetails: null, startDate: day(startOffset), expiryDate: day(expiryOffset), updatedAt: day(-1), inventoryItemId, inventoryItem: inventoryItemId ? { name: inventoryItemId } : null, documents: [] });
const item = (id, name, modelNumber) => ({ id, name, category: 'APPLIANCE', modelNumber });
let data;
function install(next) {
  data = next;
  prismaModule.prisma = new Proxy({}, { get(_t, model) {
    if (model === 'then') return undefined;
    if (model === 'inventoryItem') return { findMany: async () => data.items };
    if (model === 'recallMatch') return { findMany: async () => data.recalls };
    if (model === 'warrantyApplicability') return { findMany: async () => [] };
    if (model === 'warranty') return { findMany: async () => data.warranties };
    throw new Error(`Unexpected prisma.${String(model)} access`);
  } });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
}
test.afterEach(() => { prismaModule.prisma = realPrisma; propertyAccess.resolvePropertyAccess = originalAccess; });
const invoke = (message) => capabilityInvoke('WARRANTY_LOOKUP', { userId: 'u1', propertyId: 'p1', message });
const QUESTION = 'show appliances that have open recalls and no active warranty';

test('WARRANTY_LOOKUP: every variant this file drives conforms, the runtime contract accepts each, and none is withheld by the answer-trust check', async () => {
  const variants = {};
  const modelled = [item('fridge', 'Refrigerator', 'R1'), item('washer', 'Washer', 'W1')];
  install({ items: modelled, recalls: [{ inventoryItemId: 'fridge', status: 'OPEN' }, { inventoryItemId: 'washer', status: 'OPEN' }], warranties: [warrantyRow('w-fridge', 'fridge', -300, 300), warrantyRow('w-washer', 'washer', -900, -30)] });
  variants.recallWarrantyCombined = await invoke(QUESTION);
  install({ items: [item('fridge', 'Refrigerator', null), item('washer', 'Washer', ''), item('dryer', 'Dryer', null)], recalls: [], warranties: [] });
  variants.recallWarrantyCheckIncomplete = await invoke(QUESTION);
  install({ items: modelled, recalls: [], warranties: [] });
  variants.recallWarrantyNoneMatching = await invoke(QUESTION);
  install({ items: modelled, recalls: [], warranties: [warrantyRow('w-fridge', 'fridge', -300, 300)] });
  variants.warrantyList = await invoke('Show my warranties');
  install({ items: modelled, recalls: [], warranties: [] });
  variants.warrantyEmpty = await invoke('Show my warranties');

  assert.equal(variants.recallWarrantyCombined.reasonCode, 'RECALL_WARRANTY_COMBINED');
  assert.equal(variants.recallWarrantyCheckIncomplete.reasonCode, 'RECALL_WARRANTY_CHECK_INCOMPLETE');
  for (const [name, result] of Object.entries(variants)) {
    assert.ok(['ANSWERED', 'READY_WITH_LIMITATIONS'].includes(result.status), `${name}: ${result.status}`);
    if (process.env.ASK_REAL_PATH_UPDATE !== '1') assert.equal(matchesOperationAnswerContract('WARRANTY_LOOKUP', result), true, `${name}: the runtime variant contract rejects the handler's own answer`);
  }
  // The screenshot case: the incomplete-check answer is delivered, not replaced by a clarification or "I'm not sure that answers your question".
  const { result } = validateAskAnswerTrustPipeline({ question: QUESTION, operationId: 'WARRANTY_LOOKUP', result: attachAskAuthoritativeSourceEvidence(variants.recallWarrantyCheckIncomplete, [completedAskAuthoritativeSourceEvidence('WARRANTY_LOOKUP')]), semanticEnabled: true, propertyId: 'p1' });
  assert.equal(result.reasonCode, 'RECALL_WARRANTY_CHECK_INCOMPLETE');
  assert.equal(result.blocks[0].id, 'warranty-summary');
  conformRealPath('WARRANTY_LOOKUP', variants, __filename);
});
