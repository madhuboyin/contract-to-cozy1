const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const component = fs.readFileSync(path.resolve(
  __dirname,
  '../../../frontend/src/app/(dashboard)/dashboard/maintenance/PersonalizedMaintenanceSuggestions.tsx',
), 'utf8');
const page = fs.readFileSync(path.resolve(
  __dirname,
  '../../../frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx',
), 'utf8');

test('Maintenance consumes the shared personalization module placement', () => {
  assert.match(page, /<PersonalizedMaintenanceSuggestions propertyId=\{effectivePropertyId\}/);
  assert.match(component, /getModulePersonalizationRecommendations\(propertyId!, 'MAINTENANCE', 3\)/);
});

test('placement exposes reviewed explanation and capability-aware conversion controls', () => {
  assert.match(component, /\{item\.summary\}/);
  assert.match(component, /disabled=\{!action\.enabled \|\| added \|\| convert\.isPending\}/);
  assert.match(component, /convertPersonalizationRecommendationToTask/);
  assert.match(component, /min-h-\[44px\]/);
});

test('maintenance suggestions use a full-width action list with inline safety confirmation', () => {
  assert.doesNotMatch(component, /lg:grid-cols-3/);
  assert.match(component, /Suggested actions/);
  assert.match(component, /Review & confirm/);
  assert.match(component, /PropertyContextCapturePanel/);
  assert.match(component, /operationKey="REVIEW_SAFETY_DETECTOR_PROFILE"/);
  assert.match(component, /Add maintenance task/);
  assert.match(component, /Safety guidance/);
});
