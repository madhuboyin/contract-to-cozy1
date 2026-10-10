import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CapabilityExplorer } from '../workspace/ConciergeHome';
import type { AskCapabilityGroup } from '@/features/ask/types';

// Capability discovery Phase 4: the Ask-native explorer ("More ideas") with homeowner-language search over the server's reviewed corpus.
const groups: AskCapabilityGroup[] = [
  { id: 'MAINTAIN', label: 'Maintain and prevent', description: 'Stay ahead of maintenance and prevent avoidable problems.', capabilityIds: ['maintenance'], prompts: [
    { id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', label: 'What maintenance is coming due?', question: 'What maintenance tasks are due this month?', operationId: 'MAINTENANCE_STATUS', aliases: ['upkeep', 'overdue'] },
    { id: 'maintain-create-task', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', label: 'Add a maintenance task', question: 'Create a maintenance task', operationId: 'MAINTENANCE_TASK_CREATE', aliases: ['new task', 'remind me'], note: 'Cozy asks for the details and shows a review first. Nothing is saved until you confirm.' },
  ] },
  { id: 'PROTECT', label: 'Protect your home', description: 'Find coverage gaps, risks, and important changes.', capabilityIds: ['coverage'], prompts: [
    { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', label: 'Which items are missing coverage?', question: 'Which items are missing coverage?', operationId: 'COVERAGE_GAPS', aliases: ['insurance', 'warranty gaps'] },
  ] },
];

function mount() {
  const onSelect = jest.fn(); const onOpen = jest.fn(); const onSearchInteraction = jest.fn();
  render(<CapabilityExplorer groups={groups} onSelect={onSelect} onOpen={onOpen} onSearchInteraction={onSearchInteraction} />);
  fireEvent.click(screen.getByRole('button', { name: /Explore everything Ask Cozy can do/ }));
  return { onSelect, onOpen, onSearchInteraction, dialog: screen.getByRole('dialog', { name: 'What Ask Cozy can help with' }) };
}
const search = (value: string) => fireEvent.change(screen.getByRole('searchbox', { name: 'Search what Ask Cozy can help with' }), { target: { value } });

describe('CapabilityExplorer', () => {
  it('browses by group, shows the reviewed homeowner label, and states a governed workflow\'s consequence', () => {
    const { dialog } = mount();
    expect(within(dialog).getByRole('heading', { name: 'Maintain and prevent' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /What maintenance is coming due\?/ })).toBeInTheDocument();
    expect(within(dialog).getByText(/Nothing is saved until you confirm/)).toBeInTheDocument();
    expect(within(dialog).queryByText('Which items are missing coverage?', { selector: 'p' })).toBeNull();
  });

  it('falls back to the question when the server sends no label', () => {
    render(<CapabilityExplorer groups={[{ ...groups[1], prompts: [{ id: 'p', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'A plain question?' }] }]} onSelect={jest.fn()} onOpen={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Explore everything/ }));
    expect(screen.getByRole('button', { name: 'A plain question?' })).toBeInTheDocument();
  });

  it('finds ideas by approved alias, labelled by their group, and announces the count', () => {
    const { dialog } = mount();
    search('insurance');
    const results = within(dialog).getByRole('list', { name: 'Matching ideas' });
    expect(within(results).getAllByRole('button')).toHaveLength(1);
    expect(results).toHaveTextContent('Which items are missing coverage?');
    expect(results).toHaveTextContent('Protect your home');
    expect(within(dialog).getByRole('status')).toHaveTextContent('1 idea matches');
  });

  it('says so plainly when nothing matches, and returns to browsing when the search is cleared', () => {
    const { dialog } = mount();
    search('zzzz');
    expect(dialog.querySelector('[data-explorer-empty]')).toHaveTextContent('Nothing matches that yet');
    search('');
    expect(within(dialog).getByRole('heading', { name: 'Protect your home' })).toBeInTheDocument();
  });

  it('does not search operation ids (MAINTENANCE_STATUS is the operation behind "coming due", but none of its words are homeowner wording here)', () => {
    const { dialog } = mount();
    search('MAINTENANCE_STATUS');
    expect(within(dialog).queryByRole('list', { name: 'Matching ideas' })).toBeNull();
    expect(dialog.querySelector('[data-explorer-empty]')).not.toBeNull();
  });

  it('records ONE search interaction when a result is chosen: a bucketed count source and selected=true, never per keystroke or the phrase', () => {
    const { dialog, onSelect, onSearchInteraction } = mount();
    for (const value of ['i', 'in', 'ins', 'insurance']) search(value);
    expect(onSearchInteraction).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: /Which items are missing coverage\?/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'protect-coverage', operationId: 'COVERAGE_GAPS' }));
    expect(onSearchInteraction).toHaveBeenCalledTimes(1);
    expect(onSearchInteraction).toHaveBeenCalledWith({ resultCount: 1, selected: true });
    expect(JSON.stringify(onSearchInteraction.mock.calls)).not.toMatch(/insurance/);
  });

  it('records one interaction with selected=false when the explorer closes after a search, and none when nothing was searched', () => {
    const first = mount();
    search('zzzz');
    fireEvent.keyDown(first.dialog, { key: 'Escape' });
    expect(first.onSearchInteraction).toHaveBeenCalledTimes(1);
    expect(first.onSearchInteraction).toHaveBeenCalledWith({ resultCount: 0, selected: false });
  });

  it('records nothing for a browse-only visit', () => {
    const { dialog, onSelect, onSearchInteraction } = mount();
    fireEvent.click(within(dialog).getByRole('button', { name: /Add a maintenance task/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ operationId: 'MAINTENANCE_TASK_CREATE' }));
    expect(onSearchInteraction).not.toHaveBeenCalled();
  });
});
