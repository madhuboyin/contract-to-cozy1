import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PropertyBriefFactSheet, PropertyBriefHeader, PropertyBriefLimitation, PropertyBriefsListBlock, PropertyBriefsSummaryCard } from '../PropertyBriefPreview';

type Props = Parameters<typeof PropertyBriefFactSheet>[0];
const row = (id: string, title: string, meta: string[] = ['Source: Self-reported', 'As of Jul 27, 2026', 'Verified'], status = 'Included', actions?: Array<Record<string, string>>) => ({ id, title, description: null, meta, status, actions });
const sections = [
  { id: 'f', title: 'Selected property facts', count: 3, items: [row('location.city', 'City: Plainsboro Township'), row('core.dwellingType', 'Dwelling type: Townhouse'), row('systems.waterHeaterType', 'Water heater type: Tank', undefined, 'Sensitive')] },
  { id: 'h', title: 'Verified property history', count: 1, items: [{ id: 'h-empty', title: 'No eligible records were included', description: null, meta: ['As of Aug 5, 2026'], status: 'EMPTY' }] },
  { id: 'g', title: 'Known gaps and unknowns', count: 2, items: [
    row('core.bedrooms', 'Bedrooms: Unknown or not recorded', ['Source: Home record', 'Unknown or not recorded'], 'Included', [{ id: 'property-brief-fill-core', label: 'Add detail', message: 'Fill in the missing core property details.', operationId: 'PROPERTY_CONTEXT_AREA_CAPTURE', interactionType: 'MUTATE_RECORD', entityType: 'PROPERTY_CONTEXT_AREA', entityId: 'CORE', style: 'SECONDARY' }]),
    { ...row('core.bathrooms', 'Bathrooms: Unknown or not recorded', ['Source: Home record', 'Unknown or not recorded'], 'Included', [{ id: 'property-brief-republish', label: 'Refresh brief', message: 'Manage this property brief.', operationId: 'PROPERTY_BRIEF_COMMAND', interactionType: 'MUTATE_RECORD', entityType: 'PROPERTY_BRIEF', entityId: 'brief-1', style: 'SECONDARY' }]), description: 'This detail is now recorded in your home record.' },
  ] },
];
const block = { type: 'GROUPED_LIST', id: 'property-brief-preview-sections', title: 'Exact recipient preview', actions: [], filters: [], sections } as unknown as Props['block'];
const onItemAction = jest.fn();
const renderSheet = () => render(<PropertyBriefFactSheet {...({ block, itemActionsDisabled: false, onItemAction } as unknown as Props)} />);

describe('Property Brief preview', () => {
  it('groups facts semantically and drops layout controls and Included badges', () => {
    renderSheet();
    ['Location', 'Property profile', 'Systems', 'Known gaps and unknowns'].forEach((name) => expect(screen.getByRole('region', { name })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^(auto|list|cards)$/i })).toBeNull();
    expect(screen.queryByText(/^included$/i)).toBeNull();
    expect(screen.getByText('Sensitive')).toBeInTheDocument();
    expect(screen.getByText('Plainsboro Township')).toBeInTheDocument();
  });
  it('keeps provenance behind a keyboard-operable disclosure and shows no empty-state card', () => {
    const { container } = renderSheet();
    expect(container.querySelectorAll('details summary')).not.toHaveLength(0);
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getAllByText(/Source: Self-reported · As of Jul 27, 2026 · Verified/).length).toBeGreaterThan(0);
    expect(screen.queryByText('No eligible records were included')).toBeNull();
  });
  it('lets a contributor launch the governed area capture only from a known gap', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Add detail' }));
    expect(onItemAction).toHaveBeenCalledWith('PROPERTY_CONTEXT_AREA', 'CORE', 'Fill in the missing core property details.', 'PROPERTY_CONTEXT_AREA_CAPTURE', 'MUTATE_RECORD', undefined, 'property-brief-fill-core');
    expect(screen.getAllByRole('button', { name: 'Add detail' })).toHaveLength(1);
  });
  it('offers a brief refresh instead of an empty capture when the live record resolved a frozen gap', () => {
    renderSheet();
    expect(screen.getByText('This detail is now recorded in your home record.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh brief' }));
    expect(onItemAction).toHaveBeenCalledWith('PROPERTY_BRIEF', 'brief-1', 'Manage this property brief.', 'PROPERTY_BRIEF_COMMAND', 'MUTATE_RECORD', undefined, 'property-brief-republish');
  });
  it('shows a prominent stale banner with the refresh action, and the trust label near the title', () => {
    const summary = { type: 'SUMMARY', id: 'property-brief-preview-summary', title: 'Property Brief', tone: 'CAUTION',
      body: 'Prose that must never be parsed.',
      propertyBrief: { purposeLabel: 'Homeowner reference', snapshotAsOf: '2026-08-05T12:00:00.000Z', excludedSections: ['Documents', 'Claims'], changedSections: ['Property Facts'], counts: { facts: 14, history: 0, gaps: 3, otherRecords: 2 } },
      actions: [{ id: 'property-brief-share', label: 'Create controlled share link', style: 'PRIMARY', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'o' }, { id: 'property-brief-republish', label: 'Refresh with current records', style: 'SECONDARY', interactionType: 'START_WORKFLOW', message: 'm', operationId: 'o' }] };
    render(<PropertyBriefHeader block={summary as never} />);
    expect(screen.getByRole('status')).toHaveTextContent('Home records changed');
    expect(screen.getByRole('status')).toHaveTextContent('Refresh with current records');
    expect(screen.getByText(/Homeowner reference · Snapshot Aug 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/not an inspection or disclosure/)).toBeInTheDocument();
    expect(screen.getByText('Excludes documents, claims.')).toBeInTheDocument();
    expect(screen.getByText('14 facts · 0 history records · 3 known gaps · 2 other records')).toBeInTheDocument();
    expect(screen.queryByText(/must never be parsed/)).toBeNull();
  });
  it('summarises the limitation as bullets and keeps the full statement in a disclosure', () => {
    render(<PropertyBriefLimitation block={{ type: 'BOUNDARY', id: 'property-briefs-boundary', title: 'A homeowner-assembled snapshot, not a disclosure', body: 'Not an inspection.', severity: 'INFO', suggestions: [] }} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Not an inspection.')).toBeInTheDocument();
    expect(screen.getByText('Read the full statement')).toBeInTheDocument();
  });
  it('renders saved briefs summary and governed dossier cards with live/stale badges and inline actions', () => {
    const onItemAction = jest.fn();
    render(
      <>
        <PropertyBriefsSummaryCard
          block={{
            type: 'SUMMARY',
            id: 'property-briefs-summary',
            title: '2 property briefs saved',
            body: '1 is shared through 1 live link. 1 shared brief has not been refreshed in 90 days or more.',
            tone: 'CAUTION',
            actions: [],
          }}
        />
        <PropertyBriefsListBlock
          {...({
            block: {
              type: 'GROUPED_LIST',
              id: 'property-briefs-items',
              title: 'Saved briefs',
              description: 'Newest first.',
              filters: [],
              actions: [],
              sections: [
                {
                  id: 'property-briefs-live',
                  title: 'Shared with a live link',
                  count: 1,
                  items: [
                    {
                      id: 'b-1',
                      title: 'Insurer brief',
                      description: 'Insurer or claim support · snapshot of Sep 10, 2026',
                      meta: ['3 sections', '1 live link, expires Oct 30, 2026', 'Opened 2 times', 'Not refreshed in 95 days'],
                      status: 'Shared',
                      entityType: 'PROPERTY_BRIEF',
                      actions: [{ id: 'property-brief-preview', label: 'Preview', style: 'PRIMARY', message: 'Preview this property brief.', operationId: 'PROPERTY_BRIEFS_LIST', interactionType: 'CONVERSATION_CONTINUE' }],
                    },
                  ],
                },
              ],
            },
            onItemAction,
            itemActionsDisabled: false,
          } as unknown as Props)}
        />
      </>,
    );
    expect(screen.getByText('2 property briefs saved')).toBeInTheDocument();
    expect(screen.getByText('Insurer brief')).toBeInTheDocument();
    expect(screen.getByText('Not refreshed in 95 days')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(onItemAction).toHaveBeenCalledWith('PROPERTY_BRIEF', 'b-1', 'Preview this property brief.', 'PROPERTY_BRIEFS_LIST', 'CONVERSATION_CONTINUE', undefined, 'property-brief-preview');
  });
});
