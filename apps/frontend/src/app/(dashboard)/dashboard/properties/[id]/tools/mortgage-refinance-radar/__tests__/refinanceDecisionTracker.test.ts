import fs from 'node:fs';
import path from 'node:path';

const clientSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/MortgageRefinanceRadarClient.tsx',
  ),
  'utf8',
);
const apiSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/mortgageRefinanceRadarApi.ts',
  ),
  'utf8',
);

describe('Mortgage Refinance Radar decision and completion loop', () => {
  it('offers the three primary homeowner-controlled decisions', () => {
    expect(clientSource).toContain('Keep current loan');
    expect(clientSource).toContain('Decide later');
    expect(clientSource).toContain('Proceed with this option');
  });

  it('tracks application outcomes and requires confirmed mortgage writeback', () => {
    expect(clientSource).toContain('Mark application started');
    expect(clientSource).toContain('Confirm closed and update Financing');
    expect(clientSource).toContain("transition('DECLINED')");
    expect(clientSource).toContain("transition('ABANDONED')");
  });

  it('loads durable history through the property-scoped decision API', () => {
    expect(apiSource).toContain('getRefinanceDecision');
    expect(apiSource).toContain('recordRefinanceDecision');
    expect(apiSource).toContain('/refinance-radar/decision');
    expect(clientSource).toContain('Decision history');
  });
});
