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

// Date with precision and conditional fields (FRD v1.394).
const APPROX = { key: 'when', label: 'When', kind: 'APPROX_DATE', section: 's', required: true };
const TYPE = { key: 'type', label: 'Type', kind: 'SELECT', section: 's', required: true, options: [{ label: 'Repair', value: 'REPAIR' }, { label: 'Note', value: 'NOTE' }] };
const AMOUNT = { key: 'amount', label: 'Amount', kind: 'MONEY', section: 's', required: false, visibleWhen: { field: 'type', in: ['REPAIR'] } };

test('a date with precision validates each precision, keeps an unanswered one empty, and displays a range plainly', () => {
  const ok = (value) => contract.editorFieldError(APPROX, value);
  assert.equal(ok('EXACT_DATE|2026-08-15'), null);
  assert.equal(ok('MONTH|2026-08'), null);
  assert.equal(ok('YEAR|2026'), null);
  assert.equal(ok('RANGE|2026-08-01|2026-08-15'), null);
  assert.ok(ok('EXACT_DATE|2026-02-31'));
  assert.ok(ok('MONTH|2026-13'));
  assert.ok(ok('YEAR|26'));
  assert.ok(ok('RANGE|2026-08-15|2026-08-01'));
  assert.ok(ok('RANGE|2026-08-15|'));
  assert.ok(ok('WEEK|2026'));
  assert.equal(contract.normalizeEditorValue(APPROX, 'EXACT_DATE|'), '', 'only a precision chosen is not an answer');
  assert.equal(contract.normalizeEditorValue(APPROX, ' MONTH|2026-08 '), 'MONTH|2026-08');
  assert.equal(contract.editorValueDisplay(APPROX, 'RANGE|2026-08-01|2026-08-15'), '2026-08-01 to 2026-08-15');
  assert.equal(contract.editorValueDisplay(APPROX, 'YEAR|2025'), '2025');
  assert.match(contract.readEditorAnswer([APPROX], { when: '' }).errors.when, /required/);
});

test('a dependent field is read as empty while its trigger value does not apply, and is validated when it does', () => {
  const fields = [TYPE, AMOUNT];
  assert.deepEqual(contract.readEditorAnswer(fields, { type: 'NOTE', amount: '99' }).values, { type: 'NOTE', amount: '' });
  assert.deepEqual(contract.readEditorAnswer(fields, { type: 'NOTE', amount: 'junk' }).errors, {}, 'a hidden field is never validated');
  assert.deepEqual(contract.readEditorAnswer(fields, { type: 'REPAIR', amount: '99' }).values, { type: 'REPAIR', amount: '99.00' });
  assert.ok(contract.readEditorAnswer(fields, { type: 'REPAIR', amount: 'junk' }).errors.amount);
});

test('event add: the server owns which details matter for which event type, and the date round-trips', () => {
  const add = require('../../src/services/ask/support/homeEventAddEditor.ts');
  const fields = add.eventAddEditorFields();
  const byKey = Object.fromEntries(fields.map((field) => [field.key, field]));
  assert.ok(byKey.amount.visibleWhen.in.includes('PURCHASE') && !byKey.amount.visibleWhen.in.includes('INSPECTION'));
  assert.ok(byKey.providerName.visibleWhen.in.includes('INSPECTION') && !byKey.providerName.visibleWhen.in.includes('VALUE_UPDATE'));
  assert.deepEqual(add.EVENT_ADD_EDITOR_SECTIONS.map((section) => [section.id, Boolean(section.collapsed)]), [['event', false], ['details', false], ['more', true]]);
  assert.equal(add.encodeApproxDate({ precision: 'RANGE', value: '2026-08-01', rangeEnd: '2026-08-15' }), 'RANGE|2026-08-01|2026-08-15');
  assert.equal(add.encodeApproxDate('2026-08-15'), 'EXACT_DATE|2026-08-15');
  assert.deepEqual(add.decodeApproxDate('MONTH|2026-08'), { precision: 'MONTH', value: '2026-08' });
  assert.equal(add.decodeApproxDate('EXACT_DATE|'), null);
  const typed = add.eventAddAnswerFromEditor({ title: 'x', type: 'REPAIR', occurredAt: 'EXACT_DATE|2026-08-15', summary: '', amount: '12.50', providerName: '', importance: 'HIGH', visibility: 'PRIVATE', roomId: '', inventoryItemId: '' });
  assert.deepEqual([typed.amount, typed.summary, typed.roomId, typed.importance, typed.visibility, typed.occurredAt], [12.5, null, null, 'HIGH', 'PRIVATE', { precision: 'EXACT_DATE', value: '2026-08-15' }]);
});
