import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { TaskDrawer } from '../components/TaskDrawer';
import type { PropertyMaintenanceTask } from '@/types';

// Radix Sheet/Select need heavy jsdom setup; replace with minimal stand-ins so
// the drawer's own logic (state init, save payload, confirm gating) is testable.
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children, open }: any) => (open ? <div>{children}</div> : null),
  SheetContent: ({ children }: any) => <div>{children}</div>,
  SheetHeader: ({ children }: any) => <div>{children}</div>,
  SheetTitle: ({ children }: any) => <h2>{children}</h2>,
  SheetDescription: ({ children }: any) => <div>{children}</div>,
  SheetFooter: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, disabled, children }: any) => (
    <div data-select data-value={value} data-disabled={disabled ? 'true' : 'false'}>
      <button type="button" onClick={() => onValueChange?.('URGENT')}>
        set-urgent
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('@/components/ui/checkbox', () => ({
  Checkbox: ({ checked, onCheckedChange, disabled }: any) => (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

const confirmMock = jest.fn();
jest.mock('@/components/system/ConfirmDestructiveActionDialog', () => ({
  useConfirmDestructiveAction: () => ({
    requestConfirmation: confirmMock,
    confirmationDialog: <div data-testid="confirm-dialog" />,
  }),
}));

function makeTask(overrides: Partial<PropertyMaintenanceTask> = {}): PropertyMaintenanceTask {
  return {
    id: 't1',
    propertyId: 'p1',
    title: 'Clean the gutters',
    description: 'Front and back',
    status: 'PENDING',
    priority: 'MEDIUM',
    source: 'SEASONAL',
    isRecurring: false,
    frequency: null,
    isSeasonal: true,
    season: 'SUMMER',
    seasonalChecklistItemId: 'sci1',
    nextDueDate: '2026-08-01T00:00:00.000Z',
    lastCompletedDate: null,
    estimatedCost: null,
    actualCost: null,
    serviceCategory: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...overrides,
  } as PropertyMaintenanceTask;
}

const noop = () => {};
const baseProps = {
  open: true,
  onOpenChange: noop,
  onComplete: noop,
  onReopen: noop,
};

beforeEach(() => {
  confirmMock.mockReset();
});

describe('TaskDrawer', () => {
  it('initializes all fields from the task, including an always-visible due date', () => {
    render(<TaskDrawer {...baseProps} task={makeTask()} onSave={noop} onDelete={noop} />);
    expect(screen.getByLabelText('Task name')).toHaveValue('Clean the gutters');
    expect(screen.getByLabelText('Notes')).toHaveValue('Front and back');
    expect(screen.getByLabelText('Next due date')).toHaveValue('2026-08-01');
    expect(screen.getAllByText('Seasonal').length).toBeGreaterThan(0);
  });

  it('renders malformed legacy dates safely', () => {
    render(
      <TaskDrawer
        {...baseProps}
        task={makeTask({ nextDueDate: 'not-a-date', lastCompletedDate: 'also-not-a-date' })}
        onSave={noop}
        onDelete={noop}
      />
    );

    expect(screen.getByLabelText('Next due date')).toHaveValue('');
    expect(screen.getByText(/Last completed:/)).toHaveTextContent('Last completed: Never');
  });

  it('sends the full payload on save, including priority and cleared date as null', () => {
    const onSave = jest.fn();
    render(<TaskDrawer {...baseProps} task={makeTask()} onSave={onSave} onDelete={noop} />);

    fireEvent.click(screen.getAllByText('set-urgent')[0]); // priority select stub
    fireEvent.change(screen.getByLabelText('Next due date'), { target: { value: '' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        title: 'Clean the gutters',
        priority: 'URGENT',
        isRecurring: false,
        frequency: null,
        nextDueDate: null,
      })
    );
  });

  it('gates Remove behind confirmation: cancel keeps the task', async () => {
    const onDelete = jest.fn();
    confirmMock.mockResolvedValue(false);
    render(<TaskDrawer {...baseProps} task={makeTask()} onSave={noop} onDelete={onDelete} />);

    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('deletes after confirmation', async () => {
    const onDelete = jest.fn();
    confirmMock.mockResolvedValue(true);
    render(<TaskDrawer {...baseProps} task={makeTask()} onSave={noop} onDelete={onDelete} />);

    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith('t1'));
  });

  it('hides Remove for Action Center tasks', () => {
    render(
      <TaskDrawer
        {...baseProps}
        task={makeTask({ source: 'ACTION_CENTER', seasonalChecklistItemId: null })}
        onSave={noop}
        onDelete={noop}
      />
    );
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('renders completed tasks read-only with a Reopen action', () => {
    const onReopen = jest.fn();
    render(
      <TaskDrawer
        {...baseProps}
        task={makeTask({ status: 'COMPLETED', lastCompletedDate: '2026-07-10T00:00:00.000Z' })}
        onSave={noop}
        onDelete={noop}
        onReopen={onReopen}
      />
    );
    expect(screen.getByLabelText('Task name')).toBeDisabled();
    expect(screen.queryByText('Save')).toBeNull();
    fireEvent.click(screen.getByText('Reopen task'));
    expect(onReopen).toHaveBeenCalled();
  });

  it('blocks save when recurring without a frequency', () => {
    const onSave = jest.fn();
    render(<TaskDrawer {...baseProps} task={makeTask()} onSave={onSave} onDelete={noop} />);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Save'));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Choose how often this task repeats.')).toBeInTheDocument();
  });
});
