import { fireEvent, render, screen } from '@testing-library/react';
import { CaptureFieldControl } from '../CaptureFieldControl';

// FRD v1.41: TIME is a 24-hour HH:mm wall-clock value (Home Event Radar quiet hours and task due time).
test('a TIME field renders a time input, shows the current value, and reports HH:mm (or undefined when cleared)', () => {
  const onChange = jest.fn();
  render(<CaptureFieldControl field={{ key: 'quietHoursStart', label: 'Quiet hours start', required: true, inputSchema: { type: 'TIME' } }} value="22:00" disabled={false} onChange={onChange} />);
  const input = screen.getByLabelText('Quiet hours start');
  expect(input).toHaveAttribute('type', 'time');
  expect(input).toHaveValue('22:00');
  fireEvent.change(input, { target: { value: '06:30' } });
  expect(onChange).toHaveBeenLastCalledWith('06:30');
  fireEvent.change(input, { target: { value: '' } });
  expect(onChange).toHaveBeenLastCalledWith(undefined);
});
