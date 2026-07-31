const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('inspection actions use confirmed reports and visual output stays provisional', () => {
  const hub = source('../../src/services/inspectionHub.service.ts');
  const visual = source('../../src/services/visualInspector.service.ts');
  assert.match(hub, /report: \{ status: 'CONFIRMED' \}/);
  assert.match(hub, /REPORT_NOT_CONFIRMED/);
  assert.ok((hub.match(/report\.status !== 'CONFIRMED'/g) ?? []).length >= 4);
  assert.match(visual, /PROVISIONAL_VISUAL_ASSESSMENT/);
  assert.match(visual, /requiresConfirmation: true/);
});

test('recall follow-ups require confirmation or verified exact item identity', () => {
  const matcher = source('../../../workers/src/recalls/recallMatching.service.ts');
  const followups = source('../../../workers/src/recalls/recallFollowups.service.ts');
  assert.match(matcher, /scored\.status === 'OPEN' && !c\.isVerified/);
  assert.match(followups, /confirmedAt: \{ not: null \}/);
  assert.match(followups, /isVerified: true/);
  assert.match(followups, /recall: \{ status: 'ACTIVE' \}/);
  assert.match(followups, /inspectionFindings/);
});

test('event radar enforces validity and replay is retired behind the canonical hazard view', () => {
  const radar = source('../../src/services/homeEventRadar.service.ts');
  const replayRoutes = source('../../src/routes/homeRiskReplay.routes.ts');
  const pastHazard = source('../../src/propertyIntelligence/pastHazardExposure.service.ts');
  assert.match(radar, /status: \{ in: \['active', 'updated'\] \}/);
  assert.match(radar, /visibleUntil: \{ gt: now \}/);
  assert.match(radar, /decisions\.eventRadar/);
  assert.match(replayRoutes, /LEGACY_RISK_REPLAY_RETIRED/);
  assert.match(pastHazard, /getPropertyIntelligenceCoverage/);
});
