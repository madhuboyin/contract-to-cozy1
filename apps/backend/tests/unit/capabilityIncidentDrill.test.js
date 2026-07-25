const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const {
  runCapabilityIncidentDrill,
} = require('../../src/services/capabilityIncidentDrill.ts');

test('CAP-911 exercises support response from detection through closure', () => {
  const report = runCapabilityIncidentDrill(
    new Date('2026-07-25T12:00:00.000Z'),
  );

  assert.equal(report.contractVersion, 'capability-incident-drill-v1');
  assert.equal(report.passed, true);
  assert.deepEqual(
    report.scenarios.map(({ code }) => code),
    [
      'BROKEN_DESTINATION',
      'UNAUTHORIZED_EVIDENCE',
      'SYSTEMIC_INCORRECT_RECOMMENDATIONS',
      'LIFECYCLE_OVERCOUNT',
    ],
  );
  assert.equal(report.scenarios.every(({ passed }) => passed), true);
  assert.equal(
    report.scenarios.every(({ steps }) =>
      steps.map(({ step }) => step).join(',')
      === 'DETECT,CLASSIFY,CONTAIN,VERIFY_HOME_ACTION_CONTINUITY,ESCALATE,RECOVER,CLOSE'),
    true,
  );
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /userId|propertyId|accessToken|authorization/i);
});
