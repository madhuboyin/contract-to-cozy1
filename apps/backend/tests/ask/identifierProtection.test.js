// FR-NRM-1 / FR-PRV-1: identifier and known-name protection runs on the raw message BEFORE spelling correction, so a name or identifier is never "corrected" into a vocabulary word; routing otherwise reads what was typed.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { normalizeForRouting, correctToken } = require('../../src/services/ask/support/routingNormalization.ts');
const { maskProtectedSpans, minimizePrompt } = require('../../src/services/ask/privacy/promptMinimizer.ts');
const { ROUTING_VOCABULARY } = require('../../src/services/ask/support/routingVocabulary.generated.ts');
const { normalizeKnownNames, loadKnownNames } = require('../../src/services/ask/privacy/knownNames.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const { prisma } = require('../../src/lib/prisma.ts');

// A real vocabulary word (>= 8 letters, so a missing letter is trusted) with one letter dropped: spelling correction WOULD repair it, which is exactly what must not happen to a name.
const word = Object.keys(ROUTING_VOCABULARY).find((w) => ROUTING_VOCABULARY[w] >= 2 && w.length >= 9 && /^[a-z]+$/.test(w) && correctToken(w.slice(0, 4) + w.slice(5)) === w);
const nameLike = word.slice(0, 4) + word.slice(5);

test('control: without protection the lookalike is corrected to the vocabulary word', () => {
  assert.ok(word, 'a correctable vocabulary word exists');
  assert.equal(correctToken(nameLike), word);
  assert.match(normalizeForRouting(`when did ${nameLike} call me`), new RegExp(word));
});
test('a server-known contractor, insurer, lender or household name is left exactly as typed', () => {
  for (const role of ['CONTRACTOR', 'INSURER', 'LENDER', 'PERSON']) {
    const out = normalizeForRouting(`when did ${nameLike} call me`, [{ name: nameLike, role }]);
    assert.match(out, new RegExp(nameLike), role); assert.doesNotMatch(out, new RegExp(`\\b${word}\\b`), role);
  }
  // ordinary text around the protected name is still normalised
  assert.equal(normalizeForRouting(`please when did ${nameLike} call me`, [{ name: nameLike, role: 'CONTRACTOR' }]), `when did ${nameLike} call me`);
});
test('identifiers (email, phone, address, claim number) are masked during normalisation and restored exactly', () => {
  const raw = 'Hey, status of claim ABC-12345 for 123 Main Street? mail me at jo@example.com or 555-123-4567 please';
  const { masked, restore, protectedCount } = maskProtectedSpans(raw);
  assert.ok(protectedCount >= 4); assert.doesNotMatch(masked, /jo@example|555-123|Main Street|ABC-12345/);
  assert.equal(restore(masked), raw);
  const out = normalizeForRouting(raw);
  for (const kept of ['ABC-12345', '123 Main Street', 'jo@example.com', '555-123-4567']) assert.ok(out.includes(kept), kept);
});
test('nothing changes for a message with no names or identifiers, and the typed role placeholders still belong to the model path only', () => {
  assert.equal(normalizeForRouting('how old is my water heater?'), 'how old is my water heater?');
  assert.equal(normalizeForRouting('Hey Cozy, when does my warranty expire please'), 'when does my warranty expire');
  const m = minimizePrompt('call State Farm about my roof', [{ name: 'State Farm', role: 'INSURER' }]);
  assert.match(m.text, /\[INSURER\]/); // the outbound payload carries the typed placeholder; routing text above is never rewritten to it
  assert.doesNotMatch(normalizeForRouting('call State Farm about my roof', [{ name: 'State Farm', role: 'INSURER' }]), /\[INSURER\]/);
});
test('the cascade accepts the property known names and routes the same question the same way', () => {
  const plain = resolveAskRoutingCascade('when does my warranty expire?', { localRoutingEnabled: true });
  const named = resolveAskRoutingCascade('when does my warranty expire?', { localRoutingEnabled: true, knownNames: [{ name: 'Acme Roofing', role: 'CONTRACTOR' }] });
  assert.equal(named.operation?.operationId, plain.operation?.operationId);
});
test('known names: deduped, short names dropped, capped per role; the loader is property-scoped and survives a failing source', async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ name: `Roofer Number ${i}`, role: 'CONTRACTOR' }));
  const normalized = normalizeKnownNames([{ name: 'State  Farm', role: 'INSURER' }, { name: 'state farm', role: 'INSURER' }, { name: 'ab', role: 'PERSON' }, ...many]);
  assert.equal(normalized.filter((n) => n.role === 'INSURER').length, 1); assert.equal(normalized.some((n) => n.name === 'ab'), false); assert.equal(normalized.filter((n) => n.role === 'CONTRACTOR').length, 25);
  const calls = [];
  prisma.insurancePolicy = { findMany: async (a) => { calls.push(['policy', a.where]); return [{ carrierName: 'State Farm' }]; } };
  prisma.buyerPurchaseLoanOffer = { findMany: async (a) => { calls.push(['loan', a.where]); throw new Error('table unavailable'); } };
  prisma.booking = { findMany: async (a) => { calls.push(['booking', a.where]); return [{ providerProfile: { businessName: 'Hendersen Plumbing' } }]; } };
  prisma.householdMember = { findMany: async (a) => { calls.push(['member', a.where]); return [{ displayName: 'Jo', user: { firstName: 'Patricia', lastName: 'Lee' } }]; } };
  const names = await loadKnownNames('p1');
  assert.deepEqual(calls.map((c) => c[1]), [{ propertyId: 'p1' }, { propertyId: 'p1' }, { propertyId: 'p1' }, { propertyId: 'p1' }]);
  assert.deepEqual(names.map((n) => `${n.role}:${n.name}`).sort(), ['CONTRACTOR:Hendersen Plumbing', 'INSURER:State Farm', 'PERSON:Patricia Lee']); // 'Jo' is under the minimiser's minimum length
});
