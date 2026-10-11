import { fireEvent, render, screen } from '@testing-library/react';
import { CaptureFieldControl } from '../CaptureFieldControl';

test.each([
  [{ type: 'NUMBER' as const, min: 0, max: 100 }, 'Project amount'],
  [{ type: 'MONEY' as const, currency: 'USD', min: 0, max: 100 }, 'Payment amount'],
])('numeric workflow field %j renders and reports a number', (inputSchema, label) => {
  const onChange = jest.fn();
  render(<CaptureFieldControl compact field={{ key: 'amount', label, required: true, inputSchema }} value={undefined} disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText(label);
  expect(input).toHaveAttribute('type', 'number');
  fireEvent.change(input, { target: { value: '42.5' } });
  expect(onChange).toHaveBeenLastCalledWith(42.5);
});

test('a long workflow field renders as a compact textarea', () => {
  const onChange = jest.fn();
  render(<CaptureFieldControl compact field={{ key: 'notes', label: 'Project notes', required: false, inputSchema: { type: 'LONG_TEXT', maxLength: 2000 } }} value="" disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText('Project notes');
  expect(input.tagName).toBe('TEXTAREA');
  expect(input).toHaveAttribute('rows', '2');
  fireEvent.change(input, { target: { value: 'Work starts Monday.' } });
  expect(onChange).toHaveBeenLastCalledWith('Work starts Monday.');
});

test('a long compact choice set starts bounded and can be expanded', () => {
  const options = Array.from({ length: 12 }, (_, index) => ({ value: `TYPE_${index}`, label: `Type ${index}` }));
  render(<CaptureFieldControl compact field={{ key: 'projectType', label: 'Project type', required: true, inputSchema: { type: 'SINGLE_SELECT', options } }} value="TYPE_11" disabled={false} onChange={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Type 11' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Type 8' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /More/ }));
  expect(screen.getByRole('button', { name: 'Type 8' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Show fewer' })).toHaveAttribute('aria-expanded', 'true');
});
