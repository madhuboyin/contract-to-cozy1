import { fireEvent, render, screen, within } from '@testing-library/react';
import { ExecutionCard } from '../workspace/ExecutionCard';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

// Step 5, slice 5b of docs/architecture/ASK_COZY_DIY_PROJECT_GUIDE_PLAN.md: TASK_GUIDE renders the additive `progress` and `outline` as a stepped guide, from the
// producer's declared fields only. Jest component tests: rendering, the responsive classes the component declares, the textual states, the tip disclosure and the
// accessibility semantics. No browser runs here; real-browser behavior is unverified.
const AS_OF = '2026-10-06T12:00:00.000Z';
const outline = [
  { stepId: 's1', title: 'Tape the trim', state: 'DONE', optional: false },
  { stepId: 's2', title: 'Cut in the edges', state: 'SKIPPED', optional: true },
  { stepId: 's3', title: 'Roll the walls', state: 'CURRENT', optional: false },
  { stepId: 's4', title: 'Touch up', state: 'UPCOMING', optional: true },
];
const guide = (overrides: Record<string, unknown> = {}) => ({
  type: 'TASK_GUIDE', id: 'diy-project-guide', title: 'Repaint the hallway', summary: 'Step 3 of 4, 1 done, 1 skipped',
  eyebrow: ['Painting', 'Reviewed guide'], icon: 'TASK', chips: [{ label: 'About 60 min', kind: 'TIME' }, { label: 'Low risk', kind: 'TAG' }],
  tip: { title: 'Tip', body: 'Roll in a W pattern for even coverage.' },
  main: { title: 'Roll the walls', body: 'Roll two coats, letting the first dry.', facts: [{ label: 'Estimated time', value: 'About 60 min' }, { label: 'This step', value: 'Required' }] },
  history: [], notes: [], actions: [{ id: 'open-diy-project', label: 'Open this project', href: '/dashboard/diy/projects/p1?propertyId=home', style: 'PRIMARY' }],
  progress: { current: 3, total: 4, completed: 1, skipped: 1, label: 'Step 3 of 4, 1 done, 1 skipped', asOf: AS_OF },
  outline,
  ...overrides,
} as unknown as AskPresentationBlock);

const execution = (blocks: AskPresentationBlock[]): AskExecutionResponse => ({
  sessionId: 'session', executionId: 'exec-guide', question: 'Guide me through this project.', status: 'COMPLETED', property: { id: 'home', label: 'Main' },
  createdAt: '2026-10-06T12:00:00.000Z', updatedAt: '2026-10-06T12:00:00.000Z', viewState: null, blocks,
  captureRequests: [], confirmation: null, clarification: null, correctionCapabilities: { retryResponse: false, intent: false, entity: false, homeRecord: false },
} as unknown as AskExecutionResponse);

const card = (blocks: AskPresentationBlock[]) => render(
  <ExecutionCard execution={execution(blocks)} isSuperseded={false} justUpdatedExecutionId={null} updateExecution={jest.fn()} loading={false} ask={jest.fn()} selectedPropertyId="home"
    setInput={jest.fn()} visibleSuggestions={[]} activeSessionRef={{ current: 'session' }} refreshResult={jest.fn()} refreshPending={false} onAccessLost={jest.fn()}
    contextOpen={false} onOpenContext={jest.fn()} />,
);
const article = (view: ReturnType<typeof card>) => view.container.querySelector('[data-task-guide]') as HTMLElement;

describe('stepped guide: progress', () => {
  it('shows the producer\'s label in words, with the snapshot time, and no bar or computed figure', () => {
    const view = card([guide()]);
    const progress = article(view).querySelector('[data-task-guide-progress]') as HTMLElement;
    expect(progress).toHaveTextContent('Step 3 of 4, 1 done, 1 skipped');
    expect(progress).toHaveTextContent(/As of \d/);
    expect(article(view).querySelector('[role="progressbar"], progress')).toBeNull();
  });

  it('shows no snapshot time when the producer\'s value is not a time, and no progress element without progress', () => {
    const odd = card([guide({ progress: { current: 1, total: 4, completed: 0, skipped: 0, label: 'Step 1 of 4, 0 done', asOf: 'not a time' } })]);
    expect(article(odd).querySelector('[data-task-guide-progress]')).toHaveTextContent('Step 1 of 4, 0 done');
    expect(article(odd).querySelector('[data-task-guide-progress]')?.textContent).not.toMatch(/As of/);
    odd.unmount();
    const none = card([guide({ progress: undefined })]);
    expect(article(none).querySelector('[data-task-guide-progress]')).toBeNull();
  });

  it('does not compute or correct anything: an inconsistent label and outline are shown exactly as given', () => {
    const view = card([guide({ progress: { current: 9, total: 9, completed: 8, skipped: 0, label: 'Step 9 of 9, 8 done', asOf: AS_OF } })]);
    expect(article(view).querySelector('[data-task-guide-progress]')).toHaveTextContent('Step 9 of 9, 8 done');
    expect(article(view).querySelectorAll('[aria-current="step"]')).toHaveLength(1);
    expect(article(view).querySelector('[aria-current="step"]')).toHaveTextContent('Roll the walls');
  });
});

describe('stepped guide: outline', () => {
  it('lists every step in order, each with its state in words, and marks exactly the current one aria-current="step"', () => {
    const view = card([guide()]);
    const list = within(article(view)).getByRole('list', { name: 'Steps in this project' });
    const items = within(list).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-step-state'))).toEqual(['DONE', 'SKIPPED', 'CURRENT', 'UPCOMING']);
    expect(items[0]).toHaveTextContent('1. Tape the trim'); expect(items[0]).toHaveTextContent('Done');
    expect(items[1]).toHaveTextContent('Cut in the edges'); expect(items[1]).toHaveTextContent('Skipped'); expect(items[1]).toHaveTextContent('Optional');
    expect(items[2]).toHaveTextContent('You are here');
    expect(items[3]).toHaveTextContent('Not started'); expect(items[3]).toHaveTextContent('Optional');
    expect(items.filter((item) => item.getAttribute('aria-current') === 'step')).toEqual([items[2]]);
  });

  it('says "Skipped" for a skipped step and never "Done"', () => {
    const view = card([guide()]);
    const skipped = article(view).querySelector('[data-step-state="SKIPPED"]') as HTMLElement;
    expect(skipped).toHaveTextContent('Skipped'); expect(skipped.textContent).not.toMatch(/Done/);
  });

  it('states are carried by text, with decorative icons hidden from assistive technology', () => {
    const view = card([guide()]);
    for (const item of Array.from(article(view).querySelectorAll('[data-task-guide-outline] li'))) {
      expect(item.textContent).toMatch(/Done|Skipped|You are here|Not started/);
      for (const icon of Array.from(item.querySelectorAll('svg'))) expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('the outline is not interactive: no buttons or links inside it (nothing advances in this step)', () => {
    const view = card([guide()]);
    const section = article(view).querySelector('[data-task-guide-outline-section]') as HTMLElement;
    expect(section.querySelectorAll('button, a, input, [role="button"]')).toHaveLength(0);
  });

  it('declares its responsive layout: one column, two from the small breakpoint', () => {
    const view = card([guide()]);
    const list = article(view).querySelector('[data-task-guide-outline]') as HTMLElement;
    expect(list.className).toContain('grid-cols-1'); expect(list.className).toContain('sm:grid-cols-2');
    expect((article(view).querySelector('header') as HTMLElement).className).toContain('items-start');
  });

  it('an empty outline renders no outline section and an absent one is not guide mode', () => {
    const empty = card([guide({ outline: [] })]);
    expect(article(empty).querySelector('[data-task-guide-outline-section]')).toBeNull();
  });
});

describe('stepped guide: the tip is a local disclosure', () => {
  it('is hidden until opened; the button reports expanded state and controls the panel', () => {
    const view = card([guide()]);
    const button = within(article(view)).getByRole('button', { name: 'Show tip' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    const panelId = button.getAttribute('aria-controls') as string;
    const panel = article(view).querySelector(`[id="${panelId}"]`) as HTMLElement;
    expect(panel).toHaveAttribute('hidden');
    expect(within(article(view)).queryByText('Roll in a W pattern for even coverage.')).not.toBeVisible();
    fireEvent.click(button);
    expect(within(article(view)).getByRole('button', { name: 'Hide tip' })).toHaveAttribute('aria-expanded', 'true');
    expect(panel).not.toHaveAttribute('hidden');
    expect(within(article(view)).getByText('Roll in a W pattern for even coverage.')).toBeVisible();
    fireEvent.click(within(article(view)).getByRole('button', { name: 'Hide tip' }));
    expect(panel).toHaveAttribute('hidden');
  });

  it('opening the tip does not ask anything (it is local) and creates no other control', () => {
    const view = card([guide()]);
    fireEvent.click(within(article(view)).getByRole('button', { name: 'Show tip' }));
    expect(article(view).querySelectorAll('button')).toHaveLength(1);
  });

  it('a guide without an outline keeps today\'s always-visible tip, with no disclosure button', () => {
    const plain = card([guide({ outline: undefined, progress: undefined })]);
    expect(within(article(plain)).queryByRole('button', { name: /tip/i })).toBeNull();
    expect(article(plain).querySelector('[data-task-guide-tip]')).toHaveTextContent('Roll in a W pattern for even coverage.');
  });

  it('the OUTLINE is what makes it a stepped guide: with an outline but no progress the tip is still a disclosure, and with progress but no outline it is not', () => {
    const outlineOnly = card([guide({ progress: undefined })]);
    expect(within(article(outlineOnly)).getByRole('button', { name: 'Show tip' })).toBeInTheDocument();
    outlineOnly.unmount();
    const progressOnly = card([guide({ outline: undefined })]);
    expect(within(article(progressOnly)).queryByRole('button', { name: /tip/i })).toBeNull();
    expect(article(progressOnly).querySelector('[data-task-guide-tip]')).toHaveTextContent('Roll in a W pattern');
  });

  it('a stepped guide without a tip shows no tip control', () => {
    const view = card([guide({ tip: null })]);
    expect(article(view).querySelector('[data-task-guide-tip]')).toBeNull();
    expect(within(article(view)).queryByRole('button', { name: /tip/i })).toBeNull();
  });
});

describe('a block without the new fields is unchanged', () => {
  it('renders no progress, no outline and no disclosure, and keeps its footer action', () => {
    const old = card([guide({ progress: undefined, outline: undefined })]);
    expect(article(old).querySelector('[data-task-guide-progress]')).toBeNull();
    expect(article(old).querySelector('[data-task-guide-outline-section]')).toBeNull();
    expect(article(old).querySelector('[data-task-guide-actions]')).toHaveTextContent('Open this project');
  });
});

describe('the safety note sits immediately before the guide, in the page', () => {
  it('the caution boundary the producer emits renders directly before the guide card (no block between them)', () => {
    const safety = { type: 'BOUNDARY', id: 'diy-step-safety', title: 'Safety for this step', body: 'Keep a window open while you work.', severity: 'CAUTION', suggestions: [] } as unknown as AskPresentationBlock;
    const scope = { type: 'BOUNDARY', id: 'diy-project-guide-boundary', title: 'Only for reviewed low-risk projects', body: 'Reviewed, low-risk projects only.', severity: 'INFO', suggestions: [] } as unknown as AskPresentationBlock;
    const view = card([safety, guide(), scope]);
    const guideEl = article(view);
    expect(guideEl).not.toBeNull();
    // Walk back from the guide card to the nearest preceding block in document order: it must be the safety text, with nothing else in between.
    const text = view.container.textContent ?? '';
    const safetyAt = text.indexOf('Keep a window open while you work.'); const guideAt = text.indexOf('Repaint the hallway'); const scopeAt = text.indexOf('Reviewed, low-risk projects only.');
    expect(safetyAt).toBeGreaterThan(-1);
    expect(safetyAt).toBeLessThan(guideAt); expect(guideAt).toBeLessThan(scopeAt);
    const between = text.slice(safetyAt + 'Keep a window open while you work.'.length, guideAt);
    expect(between).not.toMatch(/Steps in this project|Show tip|Open this project/);
  });
});
