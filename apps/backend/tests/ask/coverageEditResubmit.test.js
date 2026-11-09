const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

const propertyAccess = require('../../src/services/propertyAccess.service.ts');
const coverageGap = require('../../src/services/coverageGap.service.ts');
const evaluateModule = require('../../src/modules/propertyContext/application/evaluateFeatureContext.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
require('../../src/services/ask/handlers/coverage.handler.ts');

// Owner screenshot 2026-11-09: "Continue to review" on the coverage editor for a Dish Washer answered "An unexpected error occurred".
// The editor is opened with editCoverageEvidence + preferredCaptureKey (that is what makes the coverage-evidence requirement active for an item that
// already records coverage), but the submit evaluated the requirement without them, so it was "no longer active", and that plain Error reached the
// homeowner as the generic message.

const reviewItem = { inventoryItemId: 'item-1', itemName: 'Dish Washer', group: 'COVERAGE_UNCLEAR', responsibilityScope: 'OWNER', replacementValueSource: 'ESTIMATED', coverageSources: [], missingContext: [], exposureCents: null, currency: 'USD', updatedAt: new Date('2026-01-01T00:00:00Z'), expiryDate: null, itemCategory: 'APPLIANCE', roomName: 'Kitchen', detail: 'd' };

async function openEditor(entityId) {
  const originals = { access: propertyAccess.resolvePropertyAccess, items: coverageGap.getCoverageReviewItems, evaluate: evaluateModule.evaluateFeatureContext };
  const seen = [];
  propertyAccess.resolvePropertyAccess = async () => ({ propertyId: 'p1', userId: 'u1', role: 'OWNER', isOwner: true });
  coverageGap.getCoverageReviewItems = async () => [reviewItem];
  evaluateModule.evaluateFeatureContext = async (propertyId, userId, input) => {
    seen.push(input.operationInput);
    return { contextVersion: 'ctx-1', requirements: [{ requirementId: 'req-1', classification: 'ENHANCEMENT_ACCURACY', state: 'STALE', capture: { captureKey: 'INVENTORY_ITEM_COVERAGE_EVIDENCE', title: 't', question: 'q', helpText: null, inputSchema: { type: 'RELATIONAL_UPDATE', entityType: 'INVENTORY_ITEM', entityId: 'item-1', updateLabel: 'Save', currentValues: {}, fields: [] }, allowNotSure: false, sensitivity: 'FINANCIAL', actionKey: 'UPDATE_INVENTORY_ITEM_COVERAGE_EVIDENCE' } }] };
  };
  try {
    const result = await capabilityInvoke('COVERAGE_GAPS', { userId: 'u1', propertyId: 'p1', sessionId: 's1', executionId: 'e1', message: 'Update the coverage information for "Dish Washer".', ...(entityId ? { launchContext: { entityType: 'INVENTORY_ITEM', entityId } } : {}) });
    return { result, seen };
  } finally {
    propertyAccess.resolvePropertyAccess = originals.access; coverageGap.getCoverageReviewItems = originals.items; evaluateModule.evaluateFeatureContext = originals.evaluate;
  }
}

test('an item-scoped coverage edit stores the same evaluation input the form was opened with', async () => {
  const { result, seen } = await openEditor('item-1');
  assert.equal(seen[0].editCoverageEvidence, true);
  assert.equal(seen[0].preferredCaptureKey, 'INVENTORY_ITEM_COVERAGE_EVIDENCE');
  assert.deepEqual(result.parameters, {
    inventoryItemId: 'item-1', responsibilityScope: 'OWNER', hasDisclosedEstimate: true,
    editCoverageEvidence: true, preferredCaptureKey: 'INVENTORY_ITEM_COVERAGE_EVIDENCE',
  });
});

test('an unscoped coverage read stores no edit flags, so its optional card is unchanged', async () => {
  const { result, seen } = await openEditor(null);
  assert.equal(seen[0].editCoverageEvidence, undefined);
  assert.deepEqual(Object.keys(result.parameters).sort(), ['hasDisclosedEstimate', 'inventoryItemId', 'responsibilityScope']);
});

test('wiring: the submit forwards the stored flags, and a stale requirement is a typed 400, not a generic 500', () => {
  const capture = readFileSync(resolve(__dirname, '../../src/services/ask/execution/askCapture.ts'), 'utf8');
  assert.match(capture, /parameters\.editCoverageEvidence === true \? \{ editCoverageEvidence: true \} : \{\}/);
  assert.match(capture, /typeof parameters\.preferredCaptureKey === 'string' \? \{ preferredCaptureKey: parameters\.preferredCaptureKey \} : \{\}/);
  const context = readFileSync(resolve(__dirname, '../../src/modules/propertyContext/application/captureFeatureContext.ts'), 'utf8');
  assert.match(context, /active\.capture\.captureKey !== input\.captureKey\) throw new PropertyContextCaptureValidationError\('Capture requirement is no longer active\.'\)/);
});
