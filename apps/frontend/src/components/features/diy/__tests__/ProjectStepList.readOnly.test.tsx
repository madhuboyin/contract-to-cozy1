import { render, screen } from '@testing-library/react';
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
