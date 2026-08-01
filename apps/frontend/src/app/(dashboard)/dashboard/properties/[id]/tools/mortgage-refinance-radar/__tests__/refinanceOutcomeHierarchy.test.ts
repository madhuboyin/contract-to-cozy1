import fs from 'node:fs';
import path from 'node:path';

const clientSource = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'src/app/(dashboard)/dashboard/properties/[id]/tools/mortgage-refinance-radar/MortgageRefinanceRadarClient.tsx',
  ),
  'utf8',
);

describe('Mortgage Refinance Radar outcome-first hierarchy', () => {
  it('orders the journey from understanding through a tracked decision', () => {
    const understand = clientSource.indexOf('id="refinance-understand"');
    const explore = clientSource.indexOf('id="refinance-explore"');
    const compare = clientSource.indexOf('id="refinance-compare"');
    const decide = clientSource.indexOf('id="refinance-decide-track"');
    const evidence = clientSource.indexOf('id="refinance-evidence-settings"');

    expect(understand).toBeGreaterThan(-1);
    expect(understand).toBeLessThan(explore);
    expect(explore).toBeLessThan(compare);
    expect(compare).toBeLessThan(decide);
    expect(decide).toBeLessThan(evidence);
  });

  it('keeps official-offer entry and secondary evidence behind progressive disclosure', () => {
    expect(clientSource).toContain('function ProgressiveDisclosure');
    expect(clientSource).toContain('title="I have Loan Estimates to compare"');
    expect(clientSource).toContain('title="Monitoring, sources, assumptions, and settings"');
  });

  it('uses homeowner-facing actions and explicit mortgage fact readiness', () => {
    expect(clientSource).toContain('Refresh estimate');
    expect(clientSource).toContain('Explore my options');
    expect(clientSource).toContain('Known facts');
    expect(clientSource).toContain('Missing facts');
    expect(clientSource).toContain('Optional facts');
    expect(clientSource).toContain('Stale balance');
    expect(clientSource).not.toContain('Re-evaluate radar');
    expect(clientSource).not.toContain('Save & Enable Radar');
    expect(clientSource).not.toContain('internal rollout cohort');
    expect(clientSource).not.toContain('delivery rollout');
  });
});
