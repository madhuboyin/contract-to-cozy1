const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// Regression for the production failure "I still couldn't verify this answer" on "Show my DIY projects" (2026-10-07): the EMPTY DIY projects card scored 0.38 for its own operation and
// 0.57 for RENOVATION_PERMIT_READINESS in the semantic answer validator, because no declared DIY_PROJECTS answer example described the empty state. The DIY handler tests never ran the real
// validator, so none of them could see it. This runs the real card builders through the real validator (pure: no database, no network).
const { validateAskSemanticAnswerRelevance } = require('../../src/services/ask/askSemanticAnswerValidator.ts');
const { diyProjectsFromView } = require('../../src/services/ask/handlers/diyProjectCenter.handler.ts');
const { diyTemplateBrowseFromItems } = require('../../src/services/ask/handlers/diyProjectStart.handler.ts');
const { DIY_TEMPLATE_BROWSE_ACTION } = require('../../src/services/diy/projectGuide.ts');

const PROPERTY = 'prop-1';
const project = (over = {}) => ({
  id: 'p1', title: 'Repaint the hallway', category: 'PAINTING', status: 'IN_PROGRESS', completedStepCount: 1, requiredStepCount: 4, decisionVerdict: null,
  templateId: 't1', templateRevisionId: 'r1', aiGuideId: null, ...over,
});
const template = (over = {}) => ({
  id: 't1', title: 'Repaint a hallway', shortDescription: 'Paint the walls and trim.', category: 'PAINTING', difficultyLevel: 'EASY', estimatedMinutes: 120, safetyLevel: 'LOW',
  revisionId: 'r1', stepCount: 4, toolCount: 3, openProjectId: null, ...over,
});
const verdict = (question, operationId, result) => validateAskSemanticAnswerRelevance({ question, operationId, result });

const LIST_QUESTIONS = ['Show my DIY projects', 'show my diy projects', 'Which DIY projects am I in the middle of?', 'Which steps are left on my DIY projects?', 'Open the DIY project center'];
// Typed wording of the browse button's own question: it routes to DIY_PROJECTS (whose card carries the browse action), so that card must pass the validator for it too.
const BROWSE_WORDING = ['Show the DIY projects I can start.', 'Show the DIY projects I can start', 'What DIY projects can I start?', 'Which DIY projects are available for my home?', 'Which reviewed DIY projects fit my home?'];

test('the EMPTY DIY projects card passes the semantic answer validator for every declared phrasing', () => {
  const empty = diyProjectsFromView({ items: [], nextCursor: null }, PROPERTY);
  assert.equal(empty.reasonCode, 'DIY_NO_ACTIVE_PROJECTS');
  for (const question of LIST_QUESTIONS) {
    const result = verdict(question, 'DIY_PROJECTS', empty);
    assert.equal(result.outcome, 'PASS', `${question}: ${JSON.stringify([result.outcome, result.reasonCodes, result.competingOperationId, result.selectedOperationScore, result.competingOperationScore])}`);
  }
});

test('the DIY projects card, empty and populated, passes the validator for the browse wording that routes to it', () => {
  for (const view of [{ items: [], nextCursor: null }, { items: [project()], nextCursor: null }, { items: [project(), project({ id: 'p2', title: 'Seal the deck', category: 'EXTERIOR', status: 'PLANNING', completedStepCount: 0, requiredStepCount: 3 })], nextCursor: null }]) {
    const card = diyProjectsFromView(view, PROPERTY);
    for (const question of BROWSE_WORDING) {
      const result = verdict(question, 'DIY_PROJECTS', card);
      assert.equal(result.outcome, 'PASS', `${question} (${view.items.length} items): ${JSON.stringify([result.reasonCodes, result.competingOperationId, result.selectedOperationScore, result.competingOperationScore])}`);
    }
  }
});

test('the POPULATED DIY projects card passes too (one project, several, and a truncated list)', () => {
  for (const view of [
    { items: [project()], nextCursor: null },
    { items: [project(), project({ id: 'p2', title: 'Seal the deck', category: 'EXTERIOR', status: 'PLANNING', completedStepCount: 0, requiredStepCount: 3 })], nextCursor: null },
    { items: [project(), project({ id: 'p2', status: 'PLANNING', decisionVerdict: 'HIRE_RECOMMENDED' })], nextCursor: 'next' },
  ]) {
    const card = diyProjectsFromView(view, PROPERTY);
    assert.equal(card.reasonCode, 'DIY_PROJECTS_READY');
    for (const question of LIST_QUESTIONS) {
      const result = verdict(question, 'DIY_PROJECTS', card);
      assert.equal(result.outcome, 'PASS', `${question} (${view.items.length} items): ${JSON.stringify([result.reasonCodes, result.competingOperationId, result.selectedOperationScore, result.competingOperationScore])}`);
    }
  }
});

test('the template browse card passes for its own question, empty and populated, as a contributor and as a viewer', () => {
  const questions = ['Show the DIY projects I can start.', 'Which reviewed DIY projects fit my home?', DIY_TEMPLATE_BROWSE_ACTION.message];
  for (const [name, view] of [['empty', { items: [], hasMore: false }], ['one', { items: [template()], hasMore: false }], ['started', { items: [template({ openProjectId: 'p1' })], hasMore: true }]]) {
    for (const canStart of [true, false]) {
      const card = diyTemplateBrowseFromItems(view, PROPERTY, canStart);
      for (const question of questions) {
        const result = verdict(question, 'DIY_TEMPLATE_BROWSE', card);
        assert.equal(result.outcome, 'PASS', `${name}/canStart=${canStart}/${question}: ${JSON.stringify([result.reasonCodes, result.competingOperationId, result.selectedOperationScore, result.competingOperationScore])}`);
      }
    }
  }
});
