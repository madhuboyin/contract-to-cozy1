import { fireEvent, render, screen } from '@testing-library/react';
import type { BuyerPlanOverviewTask } from '@/types';
import {
  BuyerPlanPhaseNavigation,
  BuyerPlanPhaseGuidance,
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

  it('opens optional details when guidance targets a specific record', () => {
    const { rerender } = render(<BuyerPlanTool title="Phase actions" description="Optional details"><div>Target action</div></BuyerPlanTool>);
    expect(screen.queryByText('Target action')).not.toBeInTheDocument();
    rerender(<BuyerPlanTool title="Phase actions" description="Optional details" openSignal="task-1"><div>Target action</div></BuyerPlanTool>);
    expect(screen.getByText('Target action')).toBeInTheDocument();
  });

  it('presents the complete five-phase navigator without locking navigation', () => {
    const onChange = jest.fn();
    render(<BuyerPlanPhaseNavigation active={null} current="DUE_DILIGENCE" tasks={[task({})]} onChange={onChange} />);
    expect(screen.getByRole('button', { name: /contract/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /inspect the home/i })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: /prepare to fund & protect/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /get ready to close/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /close & get the keys/i })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /contract/i }));
    expect(onChange).toHaveBeenCalledWith('CONTRACT');
  });

  it('leads an opened phase with guidance, one next action, a deadline, and professional questions', () => {
    const onOpenTask = jest.fn();
    const nextAction = task({ title: 'Prepare for your inspection', dueAt: '2026-08-20T12:00:00.000Z' });
    render(<BuyerPlanPhaseGuidance
      workspace="DUE_DILIGENCE"
      tasks={[nextAction]}
      nextAction={nextAction}
      nextActionGuidance={{
        actionId: nextAction.id,
        rationale: 'Know what the inspector should focus on.',
        consequenceOfDelay: 'You may have less time to investigate findings.',
        responsibleParty: 'Inspector and buyer agent',
        suggestedQuestion: 'What should this inspection cover?',
        ctaLabel: 'Review this step',
        ctaHref: '/dashboard/properties/property-1/buyer-plan?taskId=task-1',
      }}
      milestones={[]}
      targetCloseDate="2026-09-30T12:00:00.000Z"
      onOpenTask={onOpenTask}
    />);
    expect(screen.getByText('What matters now')).toBeInTheDocument();
    expect(screen.getByText('Understand the home before your inspection deadline passes')).toBeInTheDocument();
    expect(screen.getAllByText('Prepare for your inspection')).toHaveLength(2);
    expect(screen.getByText('Nearest known deadline')).toBeInTheDocument();
    expect(screen.getByText(/What should this inspection cover/)).toBeInTheDocument();
    expect(screen.getByText(/If you delay/)).toBeInTheDocument();
    expect(screen.getByText(/What can safely wait/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /review this step/i }));
    expect(onOpenTask).toHaveBeenCalled();
  });
});
