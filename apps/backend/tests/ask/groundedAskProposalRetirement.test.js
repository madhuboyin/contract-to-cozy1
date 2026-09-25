const test = require('node:test');
const { readAskOrchestratorSources } = require('../helpers/askOrchestratorSources.js');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

require('ts-node/register');

// Ask Cozy Stage 3 retirement, 2026-09-14 (implementation plan §8/§9; FRD
// §23). Replaces groundedAskProposalMapping.test.js: that file's own tests
// each asserted internal shapes of createGroundedAskProposal/
// confirmGroundedAskProposal/rejectGroundedAskProposal, which are now
// deleted along with the GroundedAskProposal/GroundedAskArtifact Prisma
// models, the /api/gemini/proposals* routes, and the frontend API-client
// methods that called them (confirmed by repo-wide grep to have zero current
// React component callers before deletion). This file instead verifies (a)
// the retirement is actually complete -- no stray references survive in the
// places that used to define them -- and (b) answerGroundedAsk, the one
// function from this service that IS still live (called directly by
// askOrchestrator.service.ts as the GROUNDED_GUIDANCE operation handler),
// was left untouched.
//
// Confirm/reject/retry/evidence-attachment coverage for the REPLACEMENT
// workflow already exists and is not duplicated here:
// - captureConfirmWriteSafety.test.js: CAPTURE_FACT_CONFIRM/CAPTURE_EVENT_CONFIRM
//   share confirmAskExecution's one claim/lease/retry/reject lifecycle, plus
//   idempotency and correction-safety coverage.
// - conversationalCapture.test.js: candidate persistence, warranty/evidence
//   sibling pairing, and the capture-confirm operation family end to end.
// - confirmCapabilityHandlerRegistry.test.js/capabilityHandlerRegistry.test.js/
//   askGovernance.test.js: all 4 capture-confirm operations (including
//   CAPTURE_EVIDENCE_CONFIRM) are registered and governed correctly.

const serviceSource = readFileSync(resolve(__dirname, '../../src/services/groundedAsk.service.ts'), 'utf8');
const contractSource = readFileSync(resolve(__dirname, '../../src/productFramework/groundedAsk.contract.ts'), 'utf8');
const controllerSource = readFileSync(resolve(__dirname, '../../src/controllers/gemini.controller.ts'), 'utf8');
const routesSource = readFileSync(resolve(__dirname, '../../src/routes/gemini.routes.ts'), 'utf8');
const schemaSource = readFileSync(resolve(__dirname, '../../prisma/schema.prisma'), 'utf8');
const clientSource = readFileSync(resolve(__dirname, '../../../frontend/src/lib/api/client.ts'), 'utf8');
const orchestratorSource = readAskOrchestratorSources();

test('the legacy proposal create/confirm/reject functions no longer exist', () => {
  assert.doesNotMatch(serviceSource, /export async function createGroundedAskProposal/);
  assert.doesNotMatch(serviceSource, /export async function confirmGroundedAskProposal/);
  assert.doesNotMatch(serviceSource, /export async function rejectGroundedAskProposal/);
  assert.doesNotMatch(serviceSource, /groundedAskProposal\.(create|findFirst|updateMany)/);
  assert.doesNotMatch(serviceSource, /groundedAskArtifact\.create/);
});

test('answerGroundedAsk -- the still-live GROUNDED_GUIDANCE handler -- was left untouched by the retirement', () => {
  assert.match(serviceSource, /export async function answerGroundedAsk/);
  assert.match(serviceSource, /GroundedAskResponseSchema\.parse/);
  assert.match(orchestratorSource, /answerGroundedAsk\(/);
});

test('the proposal-creation input contract is gone, but the still-live response contract is not', () => {
  assert.doesNotMatch(contractSource, /export const GroundedAskProposalInputSchema/);
  assert.match(contractSource, /export const GroundedAskResponseSchema/);
});

test('the controller no longer exposes createProposal/confirmProposal/rejectProposal', () => {
  assert.doesNotMatch(controllerSource, /createProposal|confirmProposal|rejectProposal/);
  assert.match(controllerSource, /sendMessageToChat/);
});

test('the /api/gemini/proposals* routes are gone, but /api/gemini/chat is not', () => {
  assert.doesNotMatch(routesSource, /\/proposals/);
  assert.match(routesSource, /\/chat/);
});

test('the frontend API client no longer exposes the proposal create/confirm/reject methods', () => {
  assert.doesNotMatch(clientSource, /createGroundedAskProposal|confirmGroundedAskProposal|rejectGroundedAskProposal/);
  assert.match(clientSource, /sendMessageToChat/);
});

test('the GroundedAskProposal/GroundedAskArtifact models and their enums are gone from the schema', () => {
  assert.doesNotMatch(schemaSource, /model GroundedAskProposal \{/);
  assert.doesNotMatch(schemaSource, /model GroundedAskArtifact \{/);
  assert.doesNotMatch(schemaSource, /enum GroundedAskProposalKind \{/);
  assert.doesNotMatch(schemaSource, /enum GroundedAskProposalStatus \{/);
  assert.doesNotMatch(schemaSource, /groundedAskProposals\s+GroundedAskProposal\[\]/);
  assert.doesNotMatch(schemaSource, /groundedAskArtifacts\s+GroundedAskArtifact\[\]/);
});

test('the replacement is a scope evolution, not a literal behavior mirror -- both intentional differences are the ones this retirement documented, not silently reintroduced', () => {
  // CAPTURE_EVIDENCE_CONFIRM requires a same-batch, paired EVENT candidate
  // (HomeEventEvidence.eventId is non-nullable) -- unlike the legacy
  // UPLOAD_EVIDENCE proposal, which linked a bare, unpaired Document.
  assert.match(orchestratorSource, /registerConfirmCapabilityHandler\('capture\.evidence\.confirm', confirmCaptureEvidence\)/);
  assert.match(orchestratorSource, /homeEventsServiceForCapture\.attachDocument/);
});
