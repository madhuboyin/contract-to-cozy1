import fs from 'node:fs';
import path from 'node:path';

const read = (name: string) => fs.readFileSync(
  path.resolve(
    process.cwd(),
    `src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/${name}`,
  ),
  'utf8',
);

const clientSource = read('MortgageRefinanceRadarClient.tsx');
const comparisonSource = read('LoanEstimateComparisonCard.tsx');
const trustSource = read('refinanceTrustContent.ts');
const homeownerCopy = `${clientSource}\n${comparisonSource}\n${trustSource}`;

describe('Mortgage Refinance Radar material-financial copy governance', () => {
  it('qualifies self-selected credit context against lender-used scores', () => {
    expect(trustSource).toContain('consumer score can differ');
    expect(trustSource).toContain('score and scoring model a mortgage lender uses');
    expect(trustSource).toContain('consumerfinance.gov/consumer-tools/credit-reports-and-scores');
  });

  it('preserves official-disclosure and non-commercial boundaries', () => {
    expect(trustSource).toContain('does not endorse a lender');
    expect(trustSource).toContain('rank lenders for compensation');
    expect(trustSource).toContain('not an overall lender ranking or recommendation');
    expect(comparisonSource).toContain('CFPB Loan Estimate explainer');
    expect(comparisonSource).toContain('CFPB offer-comparison guidance');
  });

  it('does not include prohibited urgency, guarantee, or brand-recommendation copy', () => {
    expect(homeownerCopy).not.toMatch(/Credit Karma|guaranteed approval|guaranteed savings|act now|must act today/i);
  });
});
