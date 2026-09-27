import fs from 'fs';
import path from 'path';
import { SELECTABLE_RECORD_VISIBILITIES } from '@/app/(dashboard)/dashboard/properties/[id]/tools/home-records/types';

// RECIPIENT_SELECTED has no recipient model behind it (no recipient, grant, acceptance, expiry or revocation) and reads as owner-only, so a new
// record must not be able to choose it: the uploader could lock themselves out while no intended recipient could ever see it.
const clientPath = path.resolve(__dirname, '../app/(dashboard)/dashboard/properties/[id]/tools/home-records/HomeRecordsClient.tsx');
const source = fs.readFileSync(clientPath, 'utf8');

describe('Home Records visibility options', () => {
  it('offers only household and owner-only for a new record', () => {
    expect([...SELECTABLE_RECORD_VISIBILITIES]).toEqual(['HOUSEHOLD', 'OWNER_ONLY']);
  });

  it('builds both upload forms\' visibility selects from the selectable list, never from every label', () => {
    expect(source.match(/SELECTABLE_RECORD_VISIBILITIES\.map\(/g)).toHaveLength(2);
    expect(source).not.toMatch(/Object\.entries\(VISIBILITY_LABELS\)/);
  });

  it('still labels an existing recipient-selected record honestly, as owners-only for now', () => {
    expect(source).toMatch(/RECIPIENT_SELECTED: 'Recipient-selected \(owners only for now\)'/);
  });
});
