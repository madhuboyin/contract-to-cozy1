import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// An appliance's classification lives in system-managed tags. The drawer has no tag control and used to send
// `tags: []` on every save, which overwrote them (FRD v1.174). Updates must never carry tags.

const source = readFileSync(join(__dirname, '../InventoryItemDrawer.tsx'), 'utf8');

test('no update passes the full shared payload, and both full-form saves use the tag-free one', () => {
  const updateCalls = source.match(/await updateInventoryItem\([^;]*\);/g) ?? [];
  // Partial patches (e.g. { warrantyId }) never carried tags; only the full-form payload did.
  for (const call of updateCalls) expect(call).not.toMatch(/,\s*payload\s*\)/);
  expect(updateCalls.filter((call) => call.includes('updatePayload'))).toHaveLength(2);
});

test('the update payload is derived by removing tags from the shared payload', () => {
  expect(source).toContain('const { tags: _systemManagedTags, ...updatePayload } = payload;');
});

test('create still sends the shared payload, whose default tag list is empty', () => {
  expect(source).toContain('createInventoryItem(props.propertyId, payload)');
});
