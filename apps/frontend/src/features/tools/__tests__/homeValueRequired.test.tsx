import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalysisOnlyValueNote, HomeValueRequiredPrompt } from '../HomeValueRequiredPrompt';
import { HomeValueRequiredError, isHomeValueRequiredError, isHomeValueRequiredPayload, parsePlanningHomeValue } from '../homeValueRequired';

// Owner ruling 2026-10-16: with no home value on record the desktop pages ask inline instead of showing a 422, and say plainly that the value is used for
// this analysis only and is not saved to the home record.

test('the structured API answer is recognised by its code, and other errors are not', () => {
  expect(isHomeValueRequiredPayload({ success: false, error: { code: 'PLANNING_HOME_VALUE_REQUIRED', message: 'x' } })).toBe(true);
  expect(isHomeValueRequiredPayload({ success: false, error: { code: 'SOMETHING_ELSE' } })).toBe(false);
  expect(isHomeValueRequiredPayload({ error: 'text' })).toBe(false);
  expect(isHomeValueRequiredPayload(null)).toBe(false);
  expect(isHomeValueRequiredError(new HomeValueRequiredError())).toBe(true);
  expect(isHomeValueRequiredError(new Error('x'))).toBe(false);
});

test('a planning value accepts dollars with a sign or commas and rejects unusable input', () => {
  expect(parsePlanningHomeValue('$450,000')).toBe(450000);
  expect(parsePlanningHomeValue(' 450000 ')).toBe(450000);
  for (const bad of ['', 'abc', '0', '-5', '999', '1000000000']) expect(parsePlanningHomeValue(bad)).toBeNull();
});

test('the prompt says the value is for this analysis only and links to the home record', () => {
  render(<HomeValueRequiredPrompt propertyId="p1" toolName="Break-even" onSubmit={() => {}} />);
  expect(screen.getByText(/What value should Break-even plan with\?/)).toBeInTheDocument();
  expect(screen.getByText(/Used for this analysis only\. It is not saved, and your home record is unchanged\./)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'your home record' })).toHaveAttribute('href', '/dashboard/properties/p1/edit');
  expect(screen.getByRole('button', { name: 'Use for this analysis' })).toBeInTheDocument();
});

test('submitting a usable value hands it to the page; an unusable one is refused with a message', async () => {
  const user = userEvent.setup();
  const onSubmit = jest.fn();
  render(<HomeValueRequiredPrompt propertyId="p1" toolName="Break-even" onSubmit={onSubmit} />);
  const input = screen.getByLabelText('Home value (USD)');
  await user.type(input, 'nope');
  await user.click(screen.getByRole('button', { name: 'Use for this analysis' }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('between $10,000 and $100,000,000');
  await user.clear(input);
  await user.type(input, '$450,000');
  await user.click(screen.getByRole('button', { name: 'Use for this analysis' }));
  expect(onSubmit).toHaveBeenCalledWith(450000);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('a result that ran on an entered value is labelled as analysis-only and the value can be cleared', async () => {
  const user = userEvent.setup();
  const onClear = jest.fn();
  render(<AnalysisOnlyValueNote value={450000} onClear={onClear} />);
  expect(screen.getByText(/\$450,000/)).toBeInTheDocument();
  expect(screen.getByText(/for this analysis only\. It is not saved and your home record is unchanged\./)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Clear' }));
  expect(onClear).toHaveBeenCalledTimes(1);
});
