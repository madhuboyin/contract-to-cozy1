import { CANDIDATE_FIELDS, changedFields, homeSummaryLine, parseCandidateForm, toForm } from '../candidateHomes';

// BICC-4.1: the form keeps "not entered" distinct from zero, stores dollars as cents and years as months, and refuses what is not a sensible number.
describe('candidate home form', () => {
  const filled = { label: 'Maple St', listPriceCents: 40000000, annualPropertyTaxCents: 600050, hoaMonthlyCents: 0, bedrooms: 3, bathrooms: 2.5, livingAreaSqFt: 1800, yearBuilt: 1995, downPaymentPercent: 20, mortgageRatePercent: 6.25, mortgageTermMonths: 360, closingCostPercent: 3, city: 'Austin', state: 'TX' };

  it('shows a stored home as strings, a missing fact as empty (never "0"), and zero as "0"', () => {
    const form = toForm({ label: 'A', hoaMonthlyCents: 0, listPriceCents: null, annualInsuranceCents: undefined });
    expect(form.hoaMonthlyCents).toBe('0');
    expect(form.listPriceCents).toBe('');
    expect(form.annualInsuranceCents).toBe('');
    expect(toForm(filled).listPriceCents).toBe('400000');
    expect(toForm(filled).annualPropertyTaxCents).toBe('6000.50');
    expect(toForm(filled).mortgageTermMonths).toBe('30');
    expect(toForm(null).label).toBe('');
  });

  it('round-trips a stored home without changing a number', () => {
    const parsed = parseCandidateForm(toForm(filled));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      for (const key of ['listPriceCents', 'annualPropertyTaxCents', 'hoaMonthlyCents', 'bedrooms', 'bathrooms', 'livingAreaSqFt', 'yearBuilt', 'downPaymentPercent', 'mortgageRatePercent', 'mortgageTermMonths', 'closingCostPercent'] as const) {
        expect(parsed.payload[key]).toBe(filled[key]);
      }
    }
  });

  it('converts dollars to whole cents, years to months, and treats a blank as not entered (null)', () => {
    const parsed = parseCandidateForm({ label: 'Oak', listPriceCents: '$350,000', mortgageTermMonths: '7.5', downPaymentPercent: '20%', hoaMonthlyCents: '0', bedrooms: '' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.listPriceCents).toBe(35000000);
      expect(parsed.payload.mortgageTermMonths).toBe(90);
      expect(parsed.payload.downPaymentPercent).toBe(20);
      expect(parsed.payload.hoaMonthlyCents).toBe(0);
      expect(parsed.payload.bedrooms).toBeNull();
      expect(parsed.payload.annualInsuranceCents).toBeNull();
    }
  });

  it('refuses what is not a sensible fact, naming the field, and requires only the name', () => {
    const parsed = parseCandidateForm({ label: '', listPriceCents: 'cheap', bedrooms: '2.5', downPaymentPercent: '101', mortgageRatePercent: '31', mortgageTermMonths: '7.3', yearBuilt: '1200', listingUrl: 'ftp://x', bathrooms: '-1', livingAreaSqFt: '0' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(Object.keys(parsed.issues).sort()).toEqual(['bathrooms', 'bedrooms', 'downPaymentPercent', 'label', 'listPriceCents', 'listingUrl', 'livingAreaSqFt', 'mortgageRatePercent', 'mortgageTermMonths', 'yearBuilt']);
      expect(parsed.issues.label).toMatch(/required/);
      expect(parsed.issues.listPriceCents).toMatch(/must be a number/);
      expect(parsed.issues.mortgageTermMonths).toMatch(/whole number of months/);
    }
    expect(CANDIDATE_FIELDS.filter((field) => field.required).map((field) => field.key)).toEqual(['label']);
    expect(parseCandidateForm({ label: 'Only a name' }).ok).toBe(true);
  });

  it('limits text lengths the way the server does', () => {
    expect(parseCandidateForm({ label: 'x'.repeat(121) }).ok).toBe(false);
    expect(parseCandidateForm({ label: 'ok', notes: 'n'.repeat(2001) }).ok).toBe(false);
    expect(parseCandidateForm({ label: 'ok', city: 'c'.repeat(301) }).ok).toBe(false);
  });

  it('on an edit sends only what changed, so an untouched fact keeps its source and date; clearing a field sends null', () => {
    const stored = { label: 'Maple St', listPriceCents: 40000000, bedrooms: 3, city: null };
    const parsed = parseCandidateForm({ ...toForm(stored), listPriceCents: '390000', bedrooms: '' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(changedFields(stored, parsed.payload)).toEqual({ listPriceCents: 39000000, bedrooms: null });
    const same = parseCandidateForm(toForm(stored));
    if (same.ok) expect(changedFields(stored, same.payload)).toEqual({});
  });

  it('identifies a home in a list by name, place and price, and says when the price is not entered', () => {
    expect(homeSummaryLine({ label: 'Maple St', city: 'Austin', state: 'TX', listPriceCents: 40000000 })).toBe('Maple St · Austin, TX · $400,000');
    expect(homeSummaryLine({ label: 'Oak Ave', listPriceCents: null })).toBe('Oak Ave · Price not entered');
  });
});
