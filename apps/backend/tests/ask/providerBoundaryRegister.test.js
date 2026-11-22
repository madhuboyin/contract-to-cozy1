const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

const {
  PROVIDER_BOUNDARY_REGISTER,
  validateProviderBoundaryRegister,
  flowsLackingRealDataApproval,
} = require('../../src/services/ask/modelRouting/providerBoundaryRegister.ts');

const backendRoot = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const clone = (entry, patch) => ({ ...entry, ...patch });

function walk(directory, files = []) {
  for (const name of fs.readdirSync(directory, { withFileTypes: true })) {
    if (name.name === 'graphify-out' || name.name === 'node_modules') continue;
    const full = path.join(directory, name.name);
    if (name.isDirectory()) walk(full, files);
    else if (name.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

// BICC-OPS-006: every external model call path is registered with the fields the FRD requires.
test('the provider-boundary register is complete and well formed (OPS-006)', () => {
  assert.deepEqual(validateProviderBoundaryRegister(), []);
  const ids = PROVIDER_BOUNDARY_REGISTER.map((entry) => entry.id);
  for (const required of ['CAPTURE_EXTRACTION', 'SEMANTIC_REQUEST_PLAN', 'DOCUMENT_EVIDENCE_EXTRACTION', 'VISION_OBSERVATION_EXTRACTION', 'SENSITIVE_DOCUMENT_CLASSIFIER', 'EVALUATION_JUDGE', 'RESULT_SYNTHESIS']) {
    assert.ok(ids.includes(required), `${required} must be registered`);
  }
});

// BICC-0.2 scope: the inventory fails if a call site exists that the register does not describe.
test('every model call site under the Ask paths is registered, and every registered site still exists', () => {
  const registeredFiles = new Set(PROVIDER_BOUNDARY_REGISTER.flatMap((entry) => entry.callSites));
  const askFiles = [...walk(path.join(backendRoot, 'src/services/ask')), path.join(backendRoot, 'src/services/gemini.service.ts'), path.join(backendRoot, 'src/services/groundedAsk.service.ts')];
  const callers = askFiles
    .filter((file) => /\.models\.generateContent\(|\.chats\.create\(|\bexecuteGovernedAIRequest\s*[<(]/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(backendRoot, file).split(path.sep).join('/'))
    // The governed request wrapper itself and its definitions are the boundary, not a caller.
    .filter((file) => !file.endsWith('aiRequest.ts'));
  const unregistered = callers.filter((file) => !registeredFiles.has(file));
  assert.deepEqual(unregistered, [], `Unregistered model call site(s): ${unregistered.join(', ')}. Add a provider-boundary register entry (BICC-OPS-006).`);
  for (const entry of PROVIDER_BOUNDARY_REGISTER.filter((item) => item.status === 'ACTIVE_CODE')) {
    const texts = entry.callSites.map((file) => read(file));
    // Every site exists, and every marker is still present in at least one of the entry's sites.
    for (const marker of entry.callSiteMarkers) assert.ok(texts.some((text) => text.includes(marker)), `${entry.id}: no call site still contains "${marker}"`);
  }
});

test('every geminiService method that Ask reaches is covered by a registered marker', () => {
  const markers = PROVIDER_BOUNDARY_REGISTER.flatMap((entry) => entry.callSiteMarkers);
  const askFiles = [...walk(path.join(backendRoot, 'src/services/ask')), path.join(backendRoot, 'src/services/groundedAsk.service.ts')];
  const used = new Set();
  for (const file of askFiles) for (const match of fs.readFileSync(file, 'utf8').matchAll(/geminiService\.([A-Za-z]+)\(/g)) used.add(match[1]);
  for (const method of used) assert.ok(markers.includes(method), `geminiService.${method} is called from Ask but not registered`);
});

test('model-backed result synthesis is retired and no reference remains (BICC-0.3)', () => {
  const retired = PROVIDER_BOUNDARY_REGISTER.find((entry) => entry.id === 'RESULT_SYNTHESIS');
  assert.equal(retired.status, 'RETIRED');
  const offenders = walk(path.join(backendRoot, 'src')).filter((file) => /synthesizeAskResult|askResultSynthesis|ASK_RESULT_SYNTHESIS/.test(fs.readFileSync(file, 'utf8'))).map((file) => path.relative(backendRoot, file));
  assert.deepEqual(offenders, []);
});

// BICC-OPS-008 / OPS-009: approvals are per flow and never inherited; the evaluator never sees real data.
test('the validator rejects inherited approvals, an approval without evidence, a real-data judge and unrecorded terms', () => {
  const [first] = PROVIDER_BOUNDARY_REGISTER;
  const judge = PROVIDER_BOUNDARY_REGISTER.find((entry) => entry.id === 'EVALUATION_JUDGE');
  assert.match(validateProviderBoundaryRegister([clone(first, { realHomeownerData: 'APPROVED', approval: { forFlowId: 'SOMETHING_ELSE', evidence: 'ticket-1' } })]).join(' '), /exact flow/);
  assert.match(validateProviderBoundaryRegister([clone(first, { realHomeownerData: 'APPROVED', approval: { forFlowId: first.id, evidence: '' } })]).join(' '), /exact flow/);
  assert.match(validateProviderBoundaryRegister([clone(first, { realHomeownerData: 'APPROVED', approval: { forFlowId: first.id, evidence: 'ticket-1' } })]).join(' '), /provider terms are UNRECORDED/);
  assert.match(validateProviderBoundaryRegister([clone(judge, { dataClass: 'REAL_HOMEOWNER' })]).join(' '), /synthetic-only/);
  assert.match(validateProviderBoundaryRegister([clone(judge, { transmits: { ...judge.transmits, homeFacts: true } })]).join(' '), /synthetic-only/);
  assert.match(validateProviderBoundaryRegister([clone(first, { purpose: '' })]).join(' '), /purpose is required/);
  assert.match(validateProviderBoundaryRegister([clone(first, { callSites: [] })]).join(' '), /call sites and markers/);
  assert.match(validateProviderBoundaryRegister([first, first]).join(' '), /duplicate id/);
});

test('no flow is approved for real homeowner data today, so each live path is listed as lacking an approval', () => {
  assert.ok(PROVIDER_BOUNDARY_REGISTER.every((entry) => entry.realHomeownerData === 'NOT_APPROVED'));
  assert.deepEqual(flowsLackingRealDataApproval().sort(), ['CAPTURE_EXTRACTION', 'LEGACY_GEMINI_CHAT', 'REMOTE_FALLBACK_TYPED_CLAIM_SELECTION', 'SEMANTIC_REQUEST_PLAN', 'SEMANTIC_STAGED_UNDERSTANDING']);
});

// BICC-OPS-007: captured-payload evidence. The provider client is replaced, the real serializer runs, and the outbound request
// is inspected. Only the registered fields may leave, and prohibited identifiers are redacted before the call.
test('captured outbound payloads contain only registered fields and no raw identifiers (OPS-007)', async () => {
  const { geminiService } = require('../../src/services/gemini.service.ts');
  const captured = [];
  const original = geminiService.getAI;
  geminiService.getAI = () => ({ models: { generateContent: async (request) => { captured.push(request); return { text: JSON.stringify({ claims: [], domains: [], dispositions: [], candidates: [], disposition: 'NO_MATCH' }) }; } } });
  try {
    const signal = new AbortController().signal;
    await geminiService.selectAskRemoteFallbackTypedClaims({
      purpose: 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS',
      question: 'Email me at owner@example.com or call 415-555-0199 about my roof',
      candidates: [{ id: 'fact:roof.age', claimType: 'FACT_STATEMENT', facts: [{ key: 'roof.age', value: '12' }] }],
    }).catch(() => undefined);
    await geminiService.planAskUnderstanding({ text: 'When was the roof replaced?', operations: [{ id: 'OP', description: 'd' }], dataPoints: [{ id: 'DP', description: 'd', domain: 'ROOF' }], signal }).catch(() => undefined);
    await geminiService.selectAskUnderstandingDomains({ text: 'When was the roof replaced?', domains: [{ id: 'ROOF', description: 'Roof' }], signal }).catch(() => undefined);
  } finally {
    geminiService.getAI = original;
  }
  assert.equal(captured.length, 3, 'all three Gemini-service Ask calls must have been captured');
  const bodies = captured.map((request) => JSON.parse(request.contents));
  const allowedKeys = {
    ASK_COZY_REMOTE_FALLBACK_SYNTHESIS: ['purpose', 'question', 'instruction', 'candidates'],
    ASK_COZY_REQUEST_PLAN: ['purpose', 'message', 'instruction', 'operations', 'dataPoints'],
    ASK_COZY_DOMAIN_SELECTION: ['purpose', 'message', 'domains', 'instruction'],
  };
  for (const body of bodies) {
    assert.ok(allowedKeys[body.purpose], `unregistered purpose ${body.purpose}`);
    assert.deepEqual(Object.keys(body).sort(), [...allowedKeys[body.purpose]].sort(), `${body.purpose} sent an unregistered field`);
  }
  const fallback = bodies.find((body) => body.purpose === 'ASK_COZY_REMOTE_FALLBACK_SYNTHESIS');
  assert.doesNotMatch(JSON.stringify(fallback), /owner@example\.com|415-555-0199/);
  assert.match(fallback.question, /\[email redacted\]/);
  assert.match(fallback.question, /\[phone redacted\]/);
});

test('the capture-extraction request carries only the registered context fields (OPS-007)', async () => {
  const genai = require('@google/genai');
  const captured = [];
  const realCtor = genai.GoogleGenAI;
  const previousKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-key';
  Object.defineProperty(genai, 'GoogleGenAI', { configurable: true, writable: true, value: class { constructor() { this.models = { generateContent: async (request) => { captured.push(request); return { text: JSON.stringify({ candidates: [] }) }; } }; } } });
  try {
    delete require.cache[require.resolve('../../src/services/ask/conversationalUnderstanding/extractionContract.ts')];
    const { runStructuredExtraction } = require('../../src/services/ask/conversationalUnderstanding/extractionContract.ts');
    await runStructuredExtraction('We replaced the water heater last week', [{ id: 'evt-1', title: 'Water heater', occurredAt: '2026-01-01', amount: 900 }], [{ id: 'doc-1', title: 'Receipt', type: 'RECEIPT' }], null, '2026-02-01T00:00:00.000Z', 'UTC').catch(() => undefined);
  } finally {
    Object.defineProperty(genai, 'GoogleGenAI', { configurable: true, writable: true, value: realCtor });
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previousKey;
    delete require.cache[require.resolve('../../src/services/ask/conversationalUnderstanding/extractionContract.ts')];
  }
  assert.equal(captured.length, 1);
  const text = captured[0].contents[0].parts[0].text;
  assert.match(text, /We replaced the water heater last week/);
  assert.match(text, /evt-1/);
  // Only the registered context is present: no address, owner name, email, or database identifiers outside the supplied lists.
  assert.doesNotMatch(text, /@|userId|propertyId|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  assert.deepEqual(Object.keys(captured[0].config), ['responseMimeType']);
});
