import fs from 'node:fs';
import path from 'node:path';

const confirmPage = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/onboarding/confirm/page.tsx'),
  'utf8',
);
const addressPage = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/onboarding/address/page.tsx'),
  'utf8',
);

describe('buyer onboarding home profile capture', () => {
  it('asks for the compact property facts that tailor buyer guidance', () => {
    for (const source of [addressPage, confirmPage]) {
      expect(source).toContain('Home type');
      expect(source).toContain('Approximate year built');
      expect(source).toContain('Bedrooms');
      expect(source).toContain('Bathrooms');
      expect(source).toContain('I’m not sure');
    }
    expect(addressPage).toContain('Help us tailor your first checklist');
    expect(confirmPage).toContain('A few details for better guidance');
  });

  it('carries address-page profile facts into the review session', () => {
    expect(addressPage).toContain('dwellingType,');
    expect(addressPage).toContain('{ yearBuilt: parsedYearBuilt }');
    expect(addressPage).toContain('{ bedrooms: parsedBedrooms }');
    expect(addressPage).toContain('{ bathrooms: parsedBathrooms }');
  });

  it('writes confirmed profile facts through canonical property creation', () => {
    const createPayload = (confirmPage.split('api.createProperty({')[1] ?? '')
      .split('});')[0];

    expect(createPayload).toContain('dwellingType: homeProfile.dwellingType');
    expect(createPayload).toContain('yearBuilt');
    expect(createPayload).toContain('bedrooms');
    expect(createPayload).toContain('bathrooms');
  });
});
