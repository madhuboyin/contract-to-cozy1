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
const firstValuePage = fs.readFileSync(
  path.resolve(process.cwd(), 'src/app/onboarding/first-value/page.tsx'),
  'utf8',
);

describe('buyer onboarding home profile capture', () => {
  it('asks for the compact property facts that tailor buyer guidance', () => {
    for (const source of [addressPage, confirmPage]) {
      expect(source).toContain('Home type');
      expect(source).toContain('Approximate year built');
      expect(source).toContain('Bedrooms');
      expect(source).toContain('Bathrooms');
      expect(source).toContain('Basement');
      expect(source).toContain('Pool or spa');
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
    expect(addressPage).toContain('basementConfiguration,');
    expect(addressPage).toContain("...(hasPoolOrSpa === 'UNKNOWN' ? {} : { hasPoolOrSpa: hasPoolOrSpa === 'YES' })");
  });

  it('writes confirmed profile facts through canonical property creation', () => {
    expect(confirmPage).toContain('buildConfirmedPropertyCreatePayload(data, {');
    expect(confirmPage).toContain('...homeProfile,');
    expect(confirmPage).toContain('yearBuilt,');
    expect(confirmPage).toContain('bedrooms,');
    expect(confirmPage).toContain('bathrooms,');
  });

  it('shows an immediate explanation of how the captured facts change guidance', () => {
    expect(firstValuePage).toContain('Your plan now fits this home');
    expect(firstValuePage).toContain('buyer.personalizedGuidance.map');
    expect(firstValuePage).toContain('About {buyer.homeSnapshot.propertyAgeYears} years old');
  });
});
