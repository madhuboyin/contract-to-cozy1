// FR-REC-1: a clarification routing decision never carries fewer than two candidates. Swept over every phrase in the routing corpora.
const test = require('node:test'); const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const OPTIONS = [{ localRoutingEnabled: true, classifierEnabled: true, embeddingRetrievalEnabled: true, propertyId: 'p' }, { localRoutingEnabled: true, classifierEnabled: false, embeddingRetrievalEnabled: true, propertyId: 'p' }];
test('no routed phrase in the corpora yields a one-option clarification', () => {
  const bad = [];
  for (const file of ['askRoutingCorpus.js', 'askRoutingHoldoutCorpus.js', 'askRoutingHoldoutCorpus2.js']) {
    for (const prompts of Object.values(require(`../fixtures/${file}`))) for (const m of prompts) for (const o of OPTIONS) {
      const d = resolveAskRoutingCascade(m, o);
      if (d.requiresClarification && d.stage === 'CLARIFICATION' && d.candidates.length < 2) bad.push(m);
    }
  }
  assert.deepEqual(bad, []);
});
