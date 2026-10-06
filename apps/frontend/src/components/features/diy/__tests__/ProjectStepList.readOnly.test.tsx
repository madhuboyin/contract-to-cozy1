import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProjectStepList from '../ProjectStepList';
import type { DiyProjectStep } from '@/types';

const steps = [
  { id: 's1', stepNumber: 1, title: 'Turn off power', description: 'Switch it off at the breaker.', status: 'PENDING', isOptional: false, notes: 'Used the garage panel', safetyNote: 'Verify the power is off.' },
  { id: 's2', stepNumber: 2, title: 'Optional cleanup', description: 'Wipe the area.', status: 'PENDING', isOptional: true, notes: null },
] as unknown as DiyProjectStep[];

describe('ProjectStepList read-only mode (household viewer)', () => {
  it('shows the step text, safety note and recorded notes but no control that changes the project', () => {
    render(<ProjectStepList steps={steps} onUpdateStep={jest.fn()} readOnly />);
    expect(screen.getByText('Switch it off at the breaker.')).toBeInTheDocument();
    expect(screen.getByText('Verify the power is off.')).toBeInTheDocument();
    expect(screen.getByText('Used the garage panel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark done|start step|skip/i })).toBeNull();
    expect(screen.queryByPlaceholderText('Add a note…')).toBeNull();
  });

  it('keeps every control for someone who can change the project', () => {
    render(<ProjectStepList steps={steps} onUpdateStep={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start step' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add a note…')).toBeInTheDocument();
  });
});

describe('ProjectStepList reopen and skip rules (slice 2b)', () => {
  const done = [
    { id: 'a', stepNumber: 1, title: 'Done step', description: 'x', status: 'COMPLETED', isOptional: false, notes: null, updatedAt: '2026-10-06T12:00:00.001Z' },
    { id: 'b', stepNumber: 2, title: 'Skipped step', description: 'y', status: 'SKIPPED', isOptional: true, notes: null, updatedAt: '2026-10-06T12:00:00.002Z' },
  ] as unknown as DiyProjectStep[];

  it('offers Reopen for completed and skipped steps, and not to a viewer or after the project finished', async () => {
    const onUpdateStep = jest.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ProjectStepList steps={done} onUpdateStep={onUpdateStep} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen step' }));
    expect(onUpdateStep).toHaveBeenCalledWith('a', 'IN_PROGRESS', undefined);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reopen step' })).toBeEnabled());
    rerender(<ProjectStepList steps={done} onUpdateStep={onUpdateStep} readOnly />);
    expect(screen.queryByRole('button', { name: 'Reopen step' })).toBeNull();
    rerender(<ProjectStepList steps={done} onUpdateStep={onUpdateStep} disabled />);
    expect(screen.getByRole('button', { name: 'Reopen step' })).toBeDisabled();
  });
});
