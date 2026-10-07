const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register');

const { skillHandoffCandidates } = require('../../src/services/ask/suggestedActions/skillHandoffCandidates.ts');
const { SuggestedNextActionCandidateSchema } = require('../../src/services/ask/suggestedActions/suggestedNextActionCandidate.ts');

const handoff = (over = {}) => ({
  suggestedNextSkillId: 'maintenance', suggestedGoal: 'understand-maintenance-status', suggestedLabel: 'See the maintenance schedule',
  reasonCodes: ['HOME_RECORD_REVIEWED'], contextReferenceIds: [],
  continuity: { propertyId: 'p1', sourceEntityType: null, sourceEntityId: null, sourceHomeActionId: null, decisionThreadId: null, workItemId: null, journeyId: null, contextVersion: 'v1', returnDestination: null },
  ...over,
});

test('a verified Skill handoff becomes one deterministic typed target', () => {
  const candidates = skillHandoffCandidates({ result: { status: 'ANSWERED', blocks: [], suggestions: [], skillHandoff: handoff() }, sourceOperationId: 'PROPERTY_SUMMARY', propertyId: 'p1' });
  assert.equal(candidates.length, 1);
  assert.equal(SuggestedNextActionCandidateSchema.safeParse(candidates[0]).success, true);
  assert.equal(candidates[0].operationId, 'MAINTENANCE_STATUS');
  assert.equal(candidates[0].outcomeKey, 'HANDOFF_REVIEW_MAINTENANCE');
  assert.equal(candidates[0].message, 'Understand maintenance status');
  assert.equal(candidates[0].slotClass, 'GOVERNED_CAPABILITY');
});

test('forged or unmatched handoff metadata is not converted', () => {
  const result = { status: 'ANSWERED', blocks: [], suggestions: [], skillHandoff: handoff({ suggestedNextSkillId: 'coverage' }) };
  assert.deepEqual(skillHandoffCandidates({ result, sourceOperationId: 'PROPERTY_SUMMARY', propertyId: 'p1' }), []);
  assert.deepEqual(skillHandoffCandidates({ result: { ...result, skillHandoff: null }, sourceOperationId: 'PROPERTY_SUMMARY', propertyId: 'p1' }), []);
});
