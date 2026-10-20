const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Shared RecordEditor contract (FRD v1.385): normalisation, validation, changes-only diff and the honest GROUP fallback.
const contract = require('../../src/services/ask/recordEditor/recordEditor.contract.ts');
const { validateWarrantyEditorAnswer, warrantyEditorPatch, warrantyEditorChanges, warrantyEditorNotes, WARRANTY_EDITOR_FIELDS } = require('../../src/services/ask/support/warrantyEditor.ts');

const FIELDS = [
  { key: 'name', label: 'Name', kind: 'TEXT', section: 's', required: true, maxLength: 5 },
  { key: 'kind', label: 'Kind', kind: 'SELECT', section: 's', required: true, options: [{ label: 'Alpha', value: 'A' }] },
  { key: 'day', label: 'Day', kind: 'DATE', section: 's', required: false },
  { key: 'amount', label: 'Amount', kind: 'MONEY', section: 's', required: false },
];

test('values are trimmed, money is canonical, and every field must be present', () => {
  const { values, errors } = contract.readEditorAnswer(FIELDS, { name: ' Ann ', kind: 'A', day: '', amount: '5' });
  assert.deepEqual(values, { name: 'Ann', kind: 'A', day: '', amount: '5.00' });
  assert.deepEqual(errors, {});
  assert.deepEqual(Object.keys(contract.readEditorAnswer(FIELDS, { name: 'Ann' }).errors).sort(), ['amount', 'day', 'kind']);
});

test('required, option, date, money and length problems are reported per field; unknown keys are refused', () => {
  const { errors } = contract.readEditorAnswer(FIELDS, { name: 'toolong', kind: 'Z', day: '2026-02-31x', amount: '1.234', extra: 'x' });
  assert.deepEqual(Object.keys(errors).sort(), ['amount', 'day', 'extra', 'kind', 'name']);
  assert.match(contract.readEditorAnswer(FIELDS, { name: '', kind: 'A', day: '', amount: '' }).errors.name, /required/);
});

test('the diff lists only changed fields, in field order, with display strings', () => {
  const original = { name: 'Ann', kind: 'A', day: '', amount: '5.00' };
  assert.deepEqual(contract.diffEditorValues(FIELDS, original, { ...original }), []);
  assert.deepEqual(contract.diffEditorValues(FIELDS, original, { ...original, amount: '7.50', day: '2026-01-02' }).map((c) => [c.key, c.before, c.after]), [['day', 'Not recorded', '2026-01-02'], ['amount', '$5.00', '$7.50']]);
});

test('the GROUP fallback keeps every field and groups them by section', () => {
  const schema = contract.editorToGroupSchema({ fields: FIELDS, sections: [{ id: 's', title: 'S' }] });
  assert.deepEqual(schema.fields.map((f) => f.key), ['name', 'kind', 'day', 'amount']);
  assert.deepEqual(schema.groups, [{ id: 's', title: 'S', fieldKeys: ['name', 'kind', 'day', 'amount'] }]);
});

const base = { providerName: 'Acme', category: 'HVAC', policyNumber: '', coverageDetails: '', startDate: '2026-01-01', expiryDate: '2027-01-01', cost: '' };

test('warranty: date order is a cross-field error on the expiry date, and an equal date is refused', () => {
  assert.equal(validateWarrantyEditorAnswer({ ...base, expiryDate: '2026-01-01' }).errors.expiryDate, 'The expiration date must be after the start date.');
  assert.deepEqual(validateWarrantyEditorAnswer(base).errors, {});
});

test('warranty: the patch carries only the changed keys, dates as UTC days, blanks as null, cost as a number', () => {
  const patch = warrantyEditorPatch(['expiryDate', 'policyNumber', 'cost', 'category'], { ...base, expiryDate: '2028-02-03', cost: '12.50' });
  assert.deepEqual(Object.keys(patch), ['expiryDate', 'policyNumber', 'cost', 'category']);
  assert.equal(patch.expiryDate.toISOString(), '2028-02-03T00:00:00.000Z');
  assert.deepEqual([patch.policyNumber, patch.cost, patch.category], [null, 12.5, 'HVAC']);
});

test('warranty: a past expiry date is allowed and only produces a soft note', () => {
  assert.equal(validateWarrantyEditorAnswer({ ...base, startDate: '2020-01-01', expiryDate: '2021-01-01' }).errors.expiryDate, undefined);
  assert.equal(warrantyEditorNotes({ ...base, expiryDate: '2021-01-01' }, new Date('2026-10-20T00:00:00Z')).length, 1);
  assert.equal(warrantyEditorNotes(base, new Date('2026-10-20T00:00:00Z')).length, 0);
  assert.equal(warrantyEditorChanges({ ...base }, { ...base, category: 'ROOFING' })[0].after, 'Roofing');
});

test('warranty: coverage options carry friendly labels and the USD-only cost field', () => {
  const category = WARRANTY_EDITOR_FIELDS.find((f) => f.key === 'category');
  assert.ok(category.options.every((o) => /^[A-Z][a-zA-Z ]+$/.test(o.label)));
  assert.equal(WARRANTY_EDITOR_FIELDS.find((f) => f.key === 'cost').label, 'Cost (USD)');
});
