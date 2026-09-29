import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { handoffLabel, handoffPrompt } from '../skillHandoff';

// Handoff audit scope 3, slice 2 (FRD v1.166): a handler-nominated label is display-only.

test('the prompt is derived from the registered goal slug, exactly as before', () => {
  expect(handoffPrompt({ suggestedGoal: 'understand-maintenance-status' })).toBe('Understand maintenance status');
  expect(handoffPrompt({ suggestedGoal: 'review-home-actions-feed' })).toBe('Review home actions feed');
  expect(handoffPrompt({ suggestedGoal: 'summarize_property_record' })).toBe('Summarize property record');
});

test('the label falls back to the prompt when absent, blank, or from an execution persisted before the field existed', () => {
  const goal = 'review-coverage-gaps';
  expect(handoffLabel({ suggestedGoal: goal })).toBe('Review coverage gaps');
  expect(handoffLabel({ suggestedGoal: goal, suggestedLabel: null })).toBe('Review coverage gaps');
  expect(handoffLabel({ suggestedGoal: goal, suggestedLabel: '   ' })).toBe('Review coverage gaps');
});

test('a nominated label is shown but never changes the prompt', () => {
  const handoff = { suggestedGoal: 'understand-maintenance-status', suggestedLabel: 'See what is scheduled' };
  expect(handoffLabel(handoff)).toBe('See what is scheduled');
  expect(handoffPrompt(handoff)).toBe('Understand maintenance status');
});

test('the handoff card sends the routable prompt and displays the label', () => {
  const source = readFileSync(join(__dirname, '../../../components/ask/workspace/ExecutionCard.tsx'), 'utf8');
  expect(source).toMatch(/const prompt = handoffPrompt\(execution\.skillHandoff\)/);
  expect(source).toMatch(/const label = handoffLabel\(execution\.skillHandoff\)/);
  expect(source).toMatch(/void ask\(prompt, undefined,/);
  expect(source).toMatch(/\{label\}<\/button><p className="mt-2 text-xs text-teal-800">Ask will check access/);
  expect(source).not.toMatch(/void ask\(label/);
});
