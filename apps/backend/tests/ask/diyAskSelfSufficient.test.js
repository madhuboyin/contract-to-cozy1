const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('ts-node/register');

// Product rule (owner, 2026-10-07): Ask must be self-sufficient. No DIY answer, receipt, refusal or card sends a person to the classic desktop UI ("Open DIY Project Center",
// "Open this project", "/dashboard/..." links, "on the project page" copy). Something Ask cannot do is said plainly, never hidden behind a link. This is the guard:
// a static scan of every DIY Ask source file, plus the real builders' output.
const root = path.join(__dirname, '../../src/services');
const FILES = ['diy/projectGuide.ts', 'diy/askStepPolicy.ts', ...fs.readdirSync(path.join(root, 'ask/handlers')).filter((name) => /^diy.*\.ts$/.test(name)).map((name) => `ask/handlers/${name}`)];
const FORBIDDEN_COPY = /project page|DIY Project Center|on the page\b|\/dashboard\//i;

test('no DIY Ask source file builds a link to the desktop UI or points people at it in copy', () => {
  assert.ok(FILES.length >= 8, `found the DIY Ask files: ${FILES.join(', ')}`);
  for (const file of FILES) {
    // Comments may name the old behaviour; only code and string literals are checked.
    const code = fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n');
    assert.doesNotMatch(code, FORBIDDEN_COPY, `${file} points people at the desktop UI`);
    assert.doesNotMatch(code, /\bhref\s*[:=]/, `${file} builds an href`);
  }
});

test('the real builders emit no href and no desktop wording', () => {
  const { diyProjectsFromView } = require('../../src/services/ask/handlers/diyProjectCenter.handler.ts');
  const { diyTemplateBrowseFromItems } = require('../../src/services/ask/handlers/diyProjectStart.handler.ts');
  const guide = require('../../src/services/diy/projectGuide.ts');
  const project = { id: 'p1', title: 'Repaint', category: 'PAINTING', status: 'IN_PROGRESS', completedStepCount: 1, requiredStepCount: 4, decisionVerdict: null, templateId: 't1', templateRevisionId: 'r1', aiGuideId: null };
  const template = { id: 't1', title: 'Repaint a hallway', shortDescription: 'Paint.', category: 'PAINTING', difficultyLevel: 'EASY', estimatedMinutes: 120, safetyLevel: 'LOW', revisionId: 'r1', stepCount: 4, toolCount: 3 };
  const outputs = {
    centerEmpty: diyProjectsFromView({ items: [], nextCursor: null }, 'p1'),
    centerFull: diyProjectsFromView({ items: [project], nextCursor: 'n' }, 'p1'),
    browseEmpty: diyTemplateBrowseFromItems({ items: [], hasMore: false }, 'p1', true),
    browseFull: diyTemplateBrowseFromItems({ items: [{ ...template, openProjectId: null }, { ...template, id: 't2', openProjectId: 'p9' }], hasMore: true }, 'p1', true),
    notFound: guide.projectNotFoundBlocks('p1'),
    refusals: Object.keys(guide.GUIDE_REFUSAL_COPY).map((reason) => guide.refusalBlocks(reason, null, 'p1', 'p1')),
    withdrawn: guide.GUIDE_WITHDRAWN_COPY,
  };
  for (const [name, output] of Object.entries(outputs)) {
    const text = JSON.stringify(output);
    assert.doesNotMatch(text, /"href"/, `${name} carries an href`);
    assert.doesNotMatch(text, FORBIDDEN_COPY, `${name} points at the desktop UI`);
  }
});
