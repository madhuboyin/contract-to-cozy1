import fs from 'node:fs';
import path from 'node:path';

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('RentCast Property setup RC-5 frontend boundary', () => {
  it('submits onboarding without an arbitrary-address property lookup', () => {
    const addressPage = read('src/app/onboarding/address/page.tsx');
    const client = read('src/lib/api/client.ts');

    expect(addressPage).not.toMatch(/lookupProperty\(/);
    expect(addressPage).not.toContain('/api/properties/lookup');
    expect(addressPage).toMatch(/addressOnlyPropertyData\(submittedAddress\)/);
    expect(client).not.toMatch(/async lookupProperty\(/);
  });

  it('exposes only calm property-scoped status and active fact provenance', () => {
    const client = read('src/lib/api/client.ts');
    const editPage = read('src/app/(dashboard)/dashboard/properties/[id]/edit/page.tsx');

    expect(client).toContain('/api/properties/${propertyId}/enrichment-status');
    expect(editPage).toContain('Public record · RentCast · Retrieved');
    expect(editPage).not.toMatch(/verified by RentCast/i);
    for (const factKey of [
      'core.dwellingType',
      'core.propertySizeSqFt',
      'core.yearBuilt',
      'core.bedrooms',
      'core.bathrooms',
      'exterior.lotSizeSqFt',
    ]) {
      expect(editPage).toContain(`factKey="${factKey}"`);
    }
    expect(editPage).toContain('queryKey: ["property-enrichment-status", propertyId]');
  });
});
