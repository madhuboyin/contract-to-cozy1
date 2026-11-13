// FR-NRM-1 / FR-PRV-1 wiring: the authorised property's known names reach the routing cascade and the model payload. The model call is exercised through the real runtime bridge with a recording provider (no network).
const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path');
require('ts-node/register/transpile-only');
const calibration = require('../../src/services/ask/modelRouting/calibration.ts');
const { planRuntimeUnderstanding } = require('../../src/services/ask/modelRouting/runtimeUnderstanding.ts');

test('the runtime bridge hands the property known names to the minimiser: the provider sees a typed placeholder, never the name', async (t) => {
  const real = calibration.isUnderstandingStratumCertified; calibration.isUnderstandingStratumCertified = () => true; t.after(() => { calibration.isUnderstandingStratumCertified = real; });
  const seen = [];
  const provider = { name: 'recording', plan: async (input) => { seen.push(input.text); return { disposition: 'NONE', candidates: [], slots: {}, selfAssessment: 'LOW' }; } };
  const controls = { enabled: true, providerTermsRecorded: true, homeownerTextApproved: true };
  const base = { message: 'when did Hendersen Plumbing last service my furnace', eligibleOperationIds: new Set(['INVENTORY_LOOKUP']), eligibleDataPointIds: new Set(['item.lastServicedOn']), controls, provider };
  await planRuntimeUnderstanding({ ...base, knownNames: [{ name: 'Hendersen Plumbing', role: 'CONTRACTOR' }] });
  assert.equal(seen.length, 1); assert.match(seen[0], /\[CONTRACTOR\]/); assert.doesNotMatch(seen[0], /Hendersen/);
  // without the names the minimiser cannot know it is a contractor: the bridge must be given them
  seen.length = 0; await planRuntimeUnderstanding(base);
  assert.doesNotMatch(seen[0] ?? '', /\[CONTRACTOR\]/);
});
test('createAskExecution loads the names only after the property is authorised and passes them to every routing call and to the planner', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/services/ask/execution/createAskExecution.ts'), 'utf8');
  assert.match(src, /const knownNames = executionPropertyId && initialPropertyAccess \? await loadKnownNames\(executionPropertyId\) : \[\];/);
  assert.ok(src.indexOf('initialPropertyAccess = executionPropertyId') < src.indexOf('await loadKnownNames('), 'names are loaded after the property access check');
  assert.match(src, /resolveAskRoutingCascade\(input\.message, \{ knownNames \}\)/);
  assert.match(src, /launchEntityId: input\.launchContext\?\.entityId,\n\s+knownNames,/);
  assert.match(src, /provider: new GeminiUnderstandingProvider\(\),\n\s+knownNames,/);
});
