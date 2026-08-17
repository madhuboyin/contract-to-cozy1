import { fireEvent, render, screen } from '@testing-library/react';
import type { BuyerPlanOverviewTask } from '@/types';
import {
  BuyerPlanPhaseNavigation,
  BuyerPlanTool,
  workspaceForStage,
  workspaceForTask,
} from '../BuyerPlanExperience';

const task = (overrides: Partial<BuyerPlanOverviewTask>): BuyerPlanOverviewTask => ({
  id: 'task-1',
  actionKey: 'buyer:test',
  title: 'Test action',
  description: 'Test description',
  status: 'PENDING',
  phase: 'DUE_DILIGENCE',
  priority: 'NOW',
  dueAt: null,
  assignedToUserId: null,
  taskType: 'ACTION',
  checklistSection: 'INSPECTION_DUE_DILIGENCE',
  templateKey: null,
  evidenceRequirement: 'OPTIONAL',
  applicability: 'APPLICABLE',
  blocking: false,
  required: false,
  statusReason: null,
  notes: null,
  assignedContactId: null,
  sourceType: 'SYSTEM',
  estimatedCostCents: null,
  bookingId: null,
  sortOrder: 0,
  completedAt: null,
  completionMethod: null,
  completionDocumentId: null,
  canonicalWorkItemId: null,
  handedOffMaintenanceTaskId: null,
  updatedAt: '2026-08-17T12:00:00.000Z',
  ...overrides,
});

describe('Buyer Plan progressive disclosure', () => {
  it('maps canonical stages and checklist sections into five customer-facing phases', () => {
    expect(workspaceForStage('OFFER_CONTRACT')).toBe('CONTRACT');
    expect(workspaceForStage('DUE_DILIGENCE')).toBe('DUE_DILIGENCE');
    expect(workspaceForStage('CLOSING_PREP')).toBe('CLOSING_PREP');
    expect(workspaceForStage('MOVE_IN')).toBe('CLOSE_MOVE_IN');
    expect(workspaceForTask(task({ checklistSection: 'INSURANCE' }))).toBe('FINANCING_PROTECTION');
    expect(workspaceForTask(task({ checklistSection: 'FINAL_WALKTHROUGH' }))).toBe('CLOSING_PREP');
  });

  it('keeps detailed forms unmounted until the user opens them', () => {
    render(<BuyerPlanTool title="Insurance details" description="Optional details"><div>Private form content</div></BuyerPlanTool>);
    expect(screen.queryByText('Private form content')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open details/i }));
    expect(screen.getByText('Private form content')).toBeInTheDocument();
  });

  it('presents the complete five-phase navigator without locking navigation', () => {
    const onChange = jest.fn();
    render(<BuyerPlanPhaseNavigation active={null} current="DUE_DILIGENCE" tasks={[task({})]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /contract/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /due diligence/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /financing & protection/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /closing preparation/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /close & move in/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /contract/i }));
    expect(onChange).toHaveBeenCalledWith('CONTRACT');
  });
});
