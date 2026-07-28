import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'src/app/(dashboard)/dashboard/properties/[id]/tools/home-digital-twin/HomeDigitalTwinClient.tsx',
  ),
  'utf8',
);

describe('Home Upgrade Planner accessibility and outcome contract', () => {
  it('keeps the outcome-first introduction visible at desktop breakpoints', () => {
    const intro = source.slice(
      source.indexOf('<MobilePageIntro'),
      source.indexOf('<MobilePageIntro') + 700,
    );
    expect(intro).toContain('title="Home Upgrade Planner"');
    expect(intro).not.toContain('lg:hidden');
  });

  it('announces stale and validation state to assistive technology', () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('id="scenario-assumptions-error"');
    expect(source).toContain('role="alert"');
  });

  it('provides named controls for editing assumptions and recording decisions', () => {
    expect(source).toContain("label: 'Project estimate ($)'");
    expect(source).toContain("label: 'Expected incentive ($)'");
    expect(source).toContain("label: 'Financing APR (%)'");
    expect(source).not.toContain('Scenario assumptions as JSON');
    expect(source).toContain('aria-label={`Mark this option as');
    expect(source).toContain('aria-label="Decision reason"');
  });

  it('makes preserved evidence and recomputation changes inspectable', () => {
    expect(source).toContain('Changed since the previous run');
    expect(source).toContain("['Inputs and assumptions', computationRuns[0].inputSnapshot]");
    expect(source).toContain("['Source facts', computationRuns[0].sourceSnapshot]");
    expect(source).toContain("['Outputs', computationRuns[0].outputSnapshot]");
  });

  it('does not expose technology-first compute-engine copy', () => {
    expect(source).not.toMatch(/compute engine/i);
    expect(source).not.toMatch(/model initialization/i);
  });

  it('treats asynchronous scenario work as queued until the durable run finishes', () => {
    expect(source).toMatch(/Calculation queued/);
    expect(source).toMatch(/Calculating this option/);
    expect(source).toMatch(/refetchInterval/);
    expect(source).toMatch(/isActiveScenarioRun/);
    expect(source).toMatch(/ACTIVE_COMPUTATION_WINDOW_MS/);
    expect(source).not.toMatch(/title: 'Scenario computed'/);
  });
});
