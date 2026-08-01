const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(process.cwd(), '../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('functional, product, inventory, configuration, and runbook contracts agree', () => {
  const functional = read('docs/functional/mortgage-refinance-radar.md');
  const enhancement = read('docs/product/mortgage-refinance-radar-enhancement-plan.md');
  const audit = read('docs/product/MORTGAGE_REFINANCE_RADAR_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md');
  const inventory = JSON.parse(read('docs/product/capability-discovery/current-capability-inventory.json'));
  const acquisitionInventory = read('docs/acquisition/capability-inventory.csv');
  const config = read('infrastructure/kubernetes/base/configmap.yaml');
  const runbook = read('docs/operations/MORTGAGE_REFINANCE_RADAR_ALERT_ROLLOUT_AND_INCIDENT_RUNBOOK.md');

  for (const deliveredContract of [
    'worker evaluation',
    'multi-property',
    'Scenario planning',
    'Official Loan Estimate comparison',
    'Decision and verified outcome',
  ]) {
    assert.match(functional, new RegExp(deliveredContract, 'i'));
  }
  assert.doesNotMatch(functional, /## Future Enhancements|Refinance alerts.*Medium|Multi-property comparison.*Medium/);
  assert.match(enhancement, /No capability-audit implementation slice remains open/);
  assert.match(enhancement, /Automated lender transmission and commercial action remain unimplemented/);
  assert.match(audit, /Status \| Implemented; controlled external-alert rollout gated/);
  assert.match(audit, /\| 6 — Documentation and operational rollout alignment \| Complete \|/);
  assert.match(audit, /Final audit score \| 98 \/ 100/);

  const capability = inventory.capabilities.find((entry) => entry.id === 'mortgage-refinance-radar');
  assert.equal(capability.completionKind, 'DECISION_RECORDED');
  assert.equal(capability.recommendationDisposition, 'CATALOG_ONLY');
  assert.equal(capability.safetyTier, 'MATERIAL_FINANCIAL');
  assert.match(acquisitionInventory, /Mortgage refinance radar[\s\S]*RefinanceDecisionHistory/);
  assert.match(acquisitionInventory, /external channels gated/);

  assert.match(config, /REFINANCE_EXTERNAL_ALERTS_ENABLED: "false"/);
  assert.match(config, /REFINANCE_PUSH_ALERTS_ENABLED: "false"/);
  assert.match(config, /WEB_PUSH_DELIVERY_ENABLED: "false"/);
  assert.match(config, /REFINANCE_ALERT_ROLLOUT_MODE: "ALLOWLIST"/);
  assert.match(runbook, /Keep `REFINANCE_ALERT_ROLLOUT_MODE=ALLOWLIST` until every gate/);
  assert.match(runbook, /Automated lender transmission requires a separate product, privacy, compliance, security, and/);
  assert.match(runbook, /duplicate rate no greater than 5%/);
  assert.match(runbook, /helpful rate at least 60%/);
});

test('all implementation slices have recorded repository evidence', () => {
  const audit = read('docs/product/MORTGAGE_REFINANCE_RADAR_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md');
  for (const slice of ['0', '1', '2', '3', '4', '5', '6']) {
    assert.match(audit, new RegExp(`\\| ${slice} — [^|]+ \\| Complete \\|`));
  }
  for (const commit of ['695aa0a', '577faad', '8cd562f', '41d7acc', 'e157c53', 'c81625e']) {
    assert.match(audit, new RegExp(commit));
  }
});
