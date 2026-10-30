import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useMemo } from 'react';
import { GenericGroupedListBlock } from '../blocks/GroupedListBlock';
import { ResultViewContext, useResultView } from '@/features/ask/useResultView';
import { readResultView, resultViewKey } from '@/features/ask/resultViewState';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type GroupedList = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const block: GroupedList = {
  type: 'GROUPED_LIST', id: 'records', title: 'Home records', filters: [], actions: [],
  sections: [{ id: 'recent', title: 'Recent', count: 5, items: Array.from({ length: 5 }, (_, index) => ({
    id: `record-${index}`, title: `Record ${index}`, meta: ['Current'],
  })) }],
};

function Harness() {
  const response = useMemo(() => ({
    sessionId: 'session', executionId: 'execution', property: { id: 'home', label: 'Home' },
    viewState: { resultId: 'result', revision: 1 }, blocks: [block],
  } as AskExecutionResponse), []);
  const controls = useResultView(response);
  return <ResultViewContext.Provider value={controls}>
    <GenericGroupedListBlock block={block} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />
  </ResultViewContext.Provider>;
}

beforeEach(() => window.sessionStorage.clear());

test('Cards/List choice persists without dropping item identity or status', async () => {
  const first = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true'));
  expect(first.container.querySelector('[data-grouped-list-presentation="compact_list"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  expect(first.container.querySelector('[data-grouped-list-presentation="cards"]')).toBeInTheDocument();
  expect(first.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(5);
  expect(readResultView(window.sessionStorage, resultViewKey('session', 'home', 'result')).groupedListModes.records).toBe('CARDS');
  first.unmount();
  const restored = render(<Harness />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cards' })).toHaveAttribute('aria-pressed', 'true'));
  expect(restored.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(5);
});

test('each section independently honors its declared initial visible count', () => {
  const bounded: GroupedList = {
    ...block,
    sections: [
      { ...block.sections[0], initialVisibleCount: 2 },
      { id: 'older', title: 'Older', count: 4, initialVisibleCount: 1, items: Array.from({ length: 4 }, (_, index) => ({ id: `older-${index}`, title: `Older ${index}`, meta: [] })) },
    ],
  };
  const view = render(<GenericGroupedListBlock block={bounded} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(view.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(3);
  fireEvent.click(screen.getAllByRole('button', { name: 'Show 3 more' })[0]);
  expect(view.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(6);
  expect(screen.getByRole('button', { name: 'Show 3 more' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show 3 more' }));
  expect(view.container.querySelectorAll('[data-ask-task-id]')).toHaveLength(9);
});

test('Project Tracker rows progressively disclose descriptions and secondary metadata', () => {
  const projectRecords: GroupedList = {
    ...block,
    id: 'project-detail-records',
    sections: [{ id: 'project-detail-milestones', title: 'Milestones', count: 1, items: [{
      id: 'milestone-1', title: 'Rough-in inspection', status: 'IN_PROGRESS', description: null,
      meta: ['Scheduled Oct 20, 2026'], detail: 'Inspect framing and rough-ins\nPhoto evidence required',
    }] }],
  };
  render(<GenericGroupedListBlock block={projectRecords} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(screen.queryByText('Inspect framing and rough-ins')).not.toBeInTheDocument();
  expect(screen.getByText('Scheduled Oct 20, 2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View details for Rough-in inspection' }));
  expect(screen.getByText(/Inspect framing and rough-ins/)).toHaveTextContent('Photo evidence required');
  fireEvent.click(screen.getByRole('button', { name: 'Hide details for Rough-in inspection' }));
  expect(screen.queryByText(/Inspect framing and rough-ins/)).not.toBeInTheDocument();
});

test('producer-declared dense rows use two-line records and remove repeated section statuses', () => {
  const onItemAction = jest.fn();
  const dense: GroupedList = {
    ...block,
    listDensity: 'DENSE',
    sections: [{ id: 'monitor', title: 'Monitor', count: 1, items: [{
      id: 'dishwasher', entityType: 'STATUS_BOARD_ITEM', title: 'Dishwasher', description: '98% of expected life',
      meta: ['replace soon', '11.8 yr old', 'Warranty active'], status: 'MONITOR',
      actions: [
        { id: 'correct', label: 'Correct this item', message: 'Correct it', operationId: 'STATUS_BOARD_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
        { id: 'archive', label: 'Archive', message: 'Archive it', operationId: 'STATUS_BOARD_COMMAND', interactionType: 'MUTATE_RECORD', style: 'QUIET' },
      ],
    }] }],
  };
  const view = render(<GenericGroupedListBlock block={dense} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(view.container.querySelector('[data-list-density="dense"]')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Auto' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cards' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Correct this item' })).toBeVisible();
  expect(screen.queryByText('More')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  const row = view.container.querySelector('[data-ask-task-id="dishwasher"]');
  expect(row).toHaveClass('py-2');
  expect(row?.querySelector('[data-dense-primary-line]')).toHaveTextContent('Dishwasher98% of expected life');
  expect(row?.querySelector('.truncate')).toHaveTextContent('replace soon · 11.8 yr old · Warranty active');
  expect(row?.querySelector('[data-item-status]')).not.toBeInTheDocument();
  expect(row?.querySelector('[data-dense-row-content]')).toContainElement(screen.getByRole('button', { name: 'Correct this item' }));
});

test('the upgrade planner renders one standard-width system workspace with aligned results, closing row menus, and collapsed archived options', async () => {
  const user = userEvent.setup();
  const onItemAction = jest.fn();
  const planner: GroupedList = {
    type: 'GROUPED_LIST', id: 'home-upgrade-options', title: 'Upgrade planner options', description: 'Compare and manage saved options.', filters: [], actions: [], listDensity: 'DENSE',
    sections: [
      { id: 'home-upgrade-roof', title: 'Roof', count: 2, items: [{
        id: 'roof-repair', entityType: 'HOME_UPGRADE_SCENARIO', title: 'Repair Roof', status: 'Ready', meta: ['Repair'],
        attributes: [{ label: 'Upfront cost', value: '$2,500' }, { label: 'Annual savings', value: 'Not calculated' }, { label: 'Payback', value: 'Not calculated' }],
        actions: [
          { id: 'calculate', label: 'Calculate', message: 'Calculate it', operationId: 'HOME_UPGRADE_COMMAND', interactionType: 'MUTATE_RECORD', style: 'PRIMARY' },
          { id: 'rename', label: 'Rename', message: 'Rename it', operationId: 'HOME_UPGRADE_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
        ],
      }, {
        id: 'roof-replace', entityType: 'HOME_UPGRADE_SCENARIO', title: 'Replace Roof', status: 'Ready', meta: ['Replace'], attributes: [],
        actions: [
          { id: 'calculate-replacement', label: 'Calculate', message: 'Calculate replacement', operationId: 'HOME_UPGRADE_COMMAND', interactionType: 'MUTATE_RECORD', style: 'PRIMARY' },
          { id: 'archive-replacement', label: 'Archive', message: 'Archive replacement', operationId: 'HOME_UPGRADE_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
        ],
      }] },
      { id: 'home-upgrade-manage-archived', title: 'Archived', count: 1, items: [{ id: 'old-roof', entityType: 'HOME_UPGRADE_SCENARIO', title: 'Old roof plan', status: 'Archived', meta: ['Replace Component'], attributes: [], actions: [] }] },
    ],
  };
  const view = render(<GenericGroupedListBlock block={planner} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(view.container.querySelector('[data-home-upgrade-planner]')).toBeInTheDocument();
  expect(screen.getByText('Roof')).toBeInTheDocument();
  expect(screen.getByText('$2,500')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Calculate' })).toHaveLength(2);
  const repairMore = screen.getByRole('button', { name: 'More actions for Repair Roof' });
  const replaceMore = screen.getByRole('button', { name: 'More actions for Replace Roof' });
  await user.click(repairMore);
  expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeVisible();
  await user.click(repairMore);
  expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
  await user.click(repairMore);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
  await user.click(repairMore);
  await user.click(document.body);
  expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
  await user.click(repairMore);
  await user.click(replaceMore);
  expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeVisible();
  await user.click(screen.getByRole('menuitem', { name: 'Archive' }));
  expect(screen.queryByRole('menuitem', { name: 'Archive' })).not.toBeInTheDocument();
  expect(onItemAction).toHaveBeenCalledWith('HOME_UPGRADE_SCENARIO', 'roof-replace', 'Archive replacement', 'HOME_UPGRADE_COMMAND', 'MUTATE_RECORD');
  expect(screen.queryByText('Old roof plan')).not.toBeVisible();
  fireEvent.click(screen.getByText(/Archived options/));
  expect(screen.getByText('Old roof plan')).toBeVisible();
  fireEvent.click(screen.getAllByRole('button', { name: 'Calculate' })[0]);
  expect(onItemAction).toHaveBeenCalledWith('HOME_UPGRADE_SCENARIO', 'roof-repair', 'Calculate it', 'HOME_UPGRADE_COMMAND', 'MUTATE_RECORD');
});

test('Home Operations marks overdue rows and reserves More for three or more actions', () => {
  const dense: GroupedList = {
    ...block,
    id: 'home-work-items',
    listDensity: 'DENSE',
    sections: [{ id: 'open', title: 'Open', count: 2, items: [
      {
        id: 'overdue', entityType: 'HOME_WORK_ITEM', title: 'Seal driveway cracks', description: 'maintenance task',
        meta: ['Overdue since Sep 23, 2026'], status: 'Accepted', tone: 'CRITICAL',
        actions: [
          { id: 'snooze', label: 'Snooze', message: 'Snooze it', operationId: 'HOME_WORK_ITEM_COMMAND', interactionType: 'MUTATE_RECORD', style: 'QUIET' },
          { id: 'due', label: 'Change due date', message: 'Change it', operationId: 'HOME_WORK_ITEM_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
        ],
      },
      {
        id: 'many', entityType: 'HOME_WORK_ITEM', title: 'Inspect chimney', meta: [], status: 'In progress',
        actions: [
          { id: 'primary', label: 'Update status', message: 'Update it', operationId: 'HOME_WORK_ITEM_COMMAND', interactionType: 'MUTATE_RECORD', style: 'PRIMARY' },
          { id: 'snooze', label: 'Snooze chimney', message: 'Snooze it', operationId: 'HOME_WORK_ITEM_COMMAND', interactionType: 'MUTATE_RECORD', style: 'QUIET' },
          { id: 'due', label: 'Change chimney due date', message: 'Change it', operationId: 'HOME_WORK_ITEM_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
        ],
      },
    ] }],
  };
  const view = render(<GenericGroupedListBlock block={dense} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  const overdue = view.container.querySelector('[data-ask-task-id="overdue"]');
  expect(overdue).toHaveClass('bg-rose-50/70', 'border-l-rose-400');
  expect(overdue).toHaveTextContent('Overdue');
  expect(overdue).toContainElement(screen.getByRole('button', { name: 'Snooze' }));
  expect(overdue).toContainElement(screen.getByRole('button', { name: 'Change due date' }));
  const overdueActions = overdue?.querySelector('[data-home-work-item-actions]');
  expect(overdue?.querySelector('[data-dense-row-content]')).toHaveClass('sm:flex-row', 'sm:items-center', 'sm:justify-between');
  expect(overdueActions).toHaveClass('basis-full', 'border-t', 'sm:basis-auto', 'sm:border-t-0');
  expect(overdueActions?.querySelector('[data-item-status]')).toBeNull();
  expect(screen.getByText('More')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Snooze chimney' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Change chimney due date' })).toBeInTheDocument();
});

test('Project Tracker sections expose independent server-page controls', () => {
  const onCollectionPage = jest.fn();
  const paged: GroupedList = {
    ...block,
    id: 'project-detail-records',
    sections: [
      { id: 'project-detail-milestones', title: 'Milestones', count: 7, offset: 3, items: Array.from({ length: 3 }, (_, index) => ({ id: `m-${index + 3}`, title: `Milestone ${index + 4}`, meta: [] })) },
      { id: 'project-detail-payments', title: 'Payments', count: 2, offset: 0, items: Array.from({ length: 2 }, (_, index) => ({ id: `p-${index}`, title: `Payment ${index + 1}`, meta: [] })) },
    ],
  };
  render(<GenericGroupedListBlock block={paged} executionId="execution" propertyId="home" onItemAction={() => undefined} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={onCollectionPage} onAccessLost={() => undefined} />);

  fireEvent.click(screen.getByRole('button', { name: 'Previous page of Milestones' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next page of Milestones' }));
  expect(onCollectionPage).toHaveBeenNthCalledWith(1, 'project-detail-milestones', 'PREVIOUS');
  expect(onCollectionPage).toHaveBeenNthCalledWith(2, 'project-detail-milestones', 'NEXT');
  expect(screen.queryByRole('button', { name: /page of Payments/ })).not.toBeInTheDocument();
});

test('Project Tracker records use a responsive grid and move secondary actions into an overflow', () => {
  const onItemAction = jest.fn();
  const projects: GroupedList = {
    ...block,
    id: 'project-detail-records',
    sections: [{ id: 'project-detail-milestones', title: 'Milestones', count: 1, items: [{
      id: 'milestone-1', entityType: 'PROJECT_MILESTONE', title: 'Rough-in inspection', meta: ['Oct 20, 2026'],
      actions: [
        { id: 'complete', label: 'Complete', message: 'Complete it', operationId: 'PROJECT_TRACKER_COMMAND', interactionType: 'MUTATE_RECORD', style: 'PRIMARY' },
        { id: 'edit', label: 'Edit', message: 'Edit it', operationId: 'PROJECT_TRACKER_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
        { id: 'delete', label: 'Delete', message: 'Delete it', operationId: 'PROJECT_TRACKER_COMMAND', interactionType: 'MUTATE_RECORD', style: 'SECONDARY' },
      ],
    }] }],
  };
  const view = render(<GenericGroupedListBlock block={projects} executionId="execution" propertyId="home" onItemAction={onItemAction} itemActionsDisabled={false} onFilterClick={() => undefined} onCollectionPage={() => undefined} onAccessLost={() => undefined} />);

  expect(view.container.querySelector('[data-project-record-grid]')).toHaveClass('sm:grid-cols-2', 'xl:grid-cols-3');
  expect(screen.getByRole('button', { name: 'Complete' })).toBeVisible();
  expect(screen.getByText('More actions')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
});
