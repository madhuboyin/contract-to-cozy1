const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const X = require('../../src/services/ask/semantic/crossDomain/crossDomainExecutor.ts');
const { buildSeededCrossDomainSnapshot } = require('../../src/services/ask/semantic/crossDomain/index.ts');

// Live prompts #6, #8, #13: an absence of data must not read as a finding.
const answer = async (rawText, patch = {}) => {
  const snapshot = { ...buildSeededCrossDomainSnapshot(), ...patch };
  const execution = await X.executeCrossDomainSnapshot({ rawText, snapshot, role: 'OWNER', propertyAuthorized: true });
  return execution.facetResults.map((facet) => facet.summary).join(' | ');
};
const policy = (overrides = {}) => ({ id: 'pol-1', propertyId: 'prop-waves-1', carrierName: 'Chubb Home', policyNumber: 'P1', deductibleCents: 250000, annualPremiumCents: 0, expiryDate: '2027-06-01', ...overrides });
const claim = (id, requiredDocumentTypes) => ({ id, propertyId: 'prop-waves-1', title: `Claim ${id}`, slug: id, status: 'OPEN', requiredDocumentTypes });

test('#6 deductible: no policy is "cannot be determined", never an answer; a policy without a deductible is never shown as $0', async () => {
  assert.match(await answer('what is my deductible?', { insurancePolicies: [] }), /No insurance policy is recorded for this home, so no deductible can be determined\./);
  const none = await answer('what is my deductible?', { insurancePolicies: [policy({ deductibleCents: 0, deductibleRecorded: false })] });
  assert.match(none, /no deductible is recorded on it/);
  assert.ok(!/\$0\.00/.test(none));
  assert.match(await answer('what is my deductible?', { insurancePolicies: [policy()] }), /Insurance deductible: \$2500\.00 \(Chubb Home\)\./);
});

test('#6 several policies are all stated, not only the first', async () => {
  const text = await answer('what is my deductible?', { insurancePolicies: [policy(), policy({ id: 'pol-2', carrierName: 'Acme', deductibleCents: 0, deductibleRecorded: false })] });
  assert.match(text, /Deductibles by policy: Chubb Home \$2500\.00; Acme not recorded\./);
});

test('#8 claim documents: no claims, claims without requirements, and all-present are three different statements', async () => {
  const q = 'which claim documents are missing?';
  assert.match(await answer(q, { claims: [], claimDocLinks: [] }), /No claims are recorded, so there are no claim documents to check\./);
  assert.match(await answer(q, { claims: [claim('a', [])], claimDocLinks: [] }), /1 claim is recorded, but it lists no required documents, so I can’t tell/);
  assert.match(await answer(q, { claims: [claim('a', []), claim('b', [])], claimDocLinks: [] }), /2 claims are recorded, but none of them lists any required documents, so I can’t tell whether anything is missing\./);
  const links = buildSeededCrossDomainSnapshot().claimDocLinks.map((link) => ({ ...link, claimId: 'a' }));
  assert.match(await answer(q, { claims: [claim('a', ['PHOTO_EVIDENCE'])], claimDocLinks: links }), /Nothing is missing: every required document type listed for 1 claim has a linked document\./);
  const missing = await answer(q, { claims: [claim('a', ['ADJUSTER_ESTIMATE']), claim('b', [])], claimDocLinks: [] });
  assert.match(missing, /1 missing claim document requirement\(s\)/);
  assert.match(missing, /1 other claim lists no required documents, so it was not checked\./);
});

test('#13 recalls: "none" says what was checked and what could not be, and is not a guarantee', async () => {
  const text = await answer('are any of my appliances affected by recalls?', { recalls: [] });
  assert.match(text, /No open recall matches are recorded for your \d+ items?\./);
  assert.match(text, /not a guarantee that no recall exists/);
  assert.ok(!/No recalls affect visible inventory items/.test(text));
  assert.match(await answer('are any of my appliances affected by recalls?', { recalls: [], extendedItems: [] }), /No inventory items are recorded, so there is nothing to check recalls against\./);
});
