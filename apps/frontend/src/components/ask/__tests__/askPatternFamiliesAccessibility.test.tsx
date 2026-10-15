import { render, screen, within } from '@testing-library/react';
import { BlockView } from '../blocks/registry';
import type { AskPresentationBlock } from '@/features/ask/types';

// Presentation Quality 5: deterministic accessibility structure for the pattern families other than the Status Board accordion
// (which has its own file): comparison, table, timeline, guide, record explorer, and empty/error recovery. Real assistive-technology
// review remains a manual step.

const view = (block: AskPresentationBlock) => render(
  <BlockView block={block} executionId="execution" propertyId="home" itemActionsDisabled={false} onItemAction={() => {}} onFilterClick={() => {}} onCollectionPage={() => {}} onAccessLost={() => {}} />,
);

test('an error is announced as an alert with its title and body; an empty state is read in place, not announced', () => {
  const error = view({ type: 'ERROR_STATE', id: 'x', title: 'Ask could not complete this request', body: 'No changes were made.', retryable: true, actions: [] } as never);
  const alert = screen.getByRole('alert');
  expect(within(alert).getByRole('heading', { name: 'Ask could not complete this request' })).toBeInTheDocument();
  expect(alert).toHaveTextContent('No changes were made.');
  error.unmount();

  view({ type: 'EMPTY_STATE', id: 'e', title: 'Nothing is on the Status Board yet', body: 'Add appliances in Inventory.', actions: [] } as never);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Nothing is on the Status Board yet' })).toBeInTheDocument();
});

test('a comparison is a list of options, each a headed item whose attributes pair a label with its value', () => {
  const { container } = view({
    type: 'COMPARISON', id: 'c', title: 'Illustrative scenario vs. your current loan', actions: [], options: [
      { id: 'o1', label: 'Your current comparison (unchanged)', summary: 'The canonical comparison', attributes: [{ label: 'Market benchmark rate', value: '6.125%', tone: 'DEFAULT' }], actions: [] },
      { id: 'o2', label: 'Illustrative scenario', summary: 'A hypothetical 15-year loan', attributes: [{ label: 'Illustrative target rate', value: '5.500%', tone: 'DEFAULT' }], actions: [] },
    ],
  } as never);
  const list = screen.getByRole('list');
  const options = within(list).getAllByRole('listitem');
  expect(options).toHaveLength(2);
  expect(within(options[0]).getByRole('heading', { name: 'Your current comparison (unchanged)' })).toBeInTheDocument();
  const terms = [...container.querySelectorAll('dt')].map((node) => node.textContent);
  const values = [...container.querySelectorAll('dd')].map((node) => node.textContent);
  expect(terms).toEqual(['Market benchmark rate', 'Illustrative target rate']);
  expect(values).toEqual(['6.125%', '5.500%']);
});

test('a table keeps every column label with its value, so nothing depends on a horizontal scroll to be understood', () => {
  const { container } = view({
    type: 'TABLE', id: 't', title: 'Break-even range', actions: [],
    columns: [{ key: 'scenario', label: 'Scenario' }, { key: 'net', label: 'Net at year 10' }],
    rows: [{ id: 'r1', values: { scenario: 'Conservative', net: '-$8,000' } }, { id: 'r2', values: { scenario: 'Optimistic', net: '$90,000' } }],
  } as never);
  expect(screen.getByRole('heading', { name: 'Break-even range' })).toBeInTheDocument();
  expect(container.textContent).toContain('Net at year 10');
  expect(container.textContent).toContain('-$8,000');
  expect(container.textContent).toContain('Optimistic');
  expect(container.querySelector('[style*="overflow"]')).toBeNull();
});

test('a timeline is an ordered list of named, toggleable points inside a keyboard-reachable labelled region, in declared order', () => {
  const { container } = view({
    type: 'TIMELINE', id: 'tl', title: 'Upcoming capital windows', actions: [],
    items: [{ id: 'a', label: 'Roof replacement', date: '2027-03', description: 'Typical window' }, { id: 'b', label: 'Water heater', date: '2028-06', description: 'Typical window' }],
  } as never);
  const region = container.querySelector('[aria-label^="Upcoming capital windows"]') as HTMLElement;
  expect(region).toHaveAttribute('tabindex', '0');
  expect(region.getAttribute('aria-label')).toMatch(/2 of 2 shown/);
  const points = within(screen.getByRole('list')).getAllByRole('button');
  expect(points.map((point) => point.getAttribute('aria-label'))).toEqual([expect.stringMatching(/: Roof replacement$/), expect.stringMatching(/: Water heater$/)]);
  for (const point of points) expect(point).toHaveAttribute('aria-pressed');
  // The year ruler and the track are decorative; the selected point's text sits in a polite live region.
  expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
});

test('a task guide is one headed article; its decorative icon is hidden from assistive technology and its facts are text', () => {
  const { container } = view({
    type: 'TASK_GUIDE', id: 'g', title: 'Replace furnace filters monthly', summary: 'Dirty filters reduce efficiency.', eyebrow: ['Winter prep'], icon: 'HVAC',
    chips: [{ label: '~15 minutes', kind: 'TIME' }, { label: 'DIY', kind: 'DIY' }],
    main: { title: 'What to do', body: 'Check and replace filters every month.', facts: [{ label: 'When', value: 'About 2 weeks before winter' }] }, history: [], notes: [], actions: [],
  } as never);
  expect(screen.getByRole('heading', { name: 'Replace furnace filters monthly' })).toBeInTheDocument();
  for (const svg of container.querySelectorAll('svg')) expect(svg.getAttribute('aria-hidden') === 'true' || svg.closest('[aria-hidden="true"]') !== null).toBe(true);
  expect(container.textContent).toContain('~15 minutes');
  expect(container.textContent).toContain('About 2 weeks before winter');
});

test('a record explorer labels its table and keeps each cell’s label visible on narrow screens', () => {
  const { container } = view({
    type: 'GROUPED_LIST', id: 'inventory-results', title: 'Inventory details', filters: [], actions: [],
    sections: [{ id: 'items', title: 'Living Home Record', count: 1, items: [{ id: 'i1', title: 'Water heater', entityType: 'INVENTORY_ITEM', meta: ['Basement', 'Rheem'], description: null, status: 'GOOD' }] }],
  } as never);
  const table = container.querySelector('table');
  expect(table).toHaveAttribute('aria-label', 'Living Home Record inventory items');
  expect(container.querySelectorAll('th[scope="col"]').length).toBeGreaterThan(0);
  expect(container.textContent).toMatch(/Condition:/);
});
