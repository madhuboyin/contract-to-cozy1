import { fireEvent, render, screen } from '@testing-library/react';
import { hasResponseContext, InlineEvidenceBlock, InlineOutputArtifactsBlock, InlineRelatedRecordsBlock, ResponseContextContent, ResponseContextSummary, responseContextCounts } from '../EvidenceContextPanel';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type EvidenceBlock = Extract<AskPresentationBlock, { type: 'EVIDENCE' }>;
const evidence: EvidenceBlock = {
  type: 'EVIDENCE', id: 'cost-evidence', title: 'Sources for this estimate',
  items: [
    { label: '2026 property tax assessment', source: 'County assessor', observedAt: '2026-08-14T12:00:00.000Z', claim: { targetBlockId: 'cost-table', targetItemId: 'property-tax', text: 'Property tax: $517 per month and $6,200 per year.' } },
    { label: 'Insurance premium', source: null, observedAt: null },
  ],
};
const execution = {
  executionId: 'execution', sessionId: 'session', question: 'Compare ownership costs',
  property: { id: 'home', label: 'Maple Home' }, blocks: [{ type: 'TABLE', id: 'cost-table', title: 'Costs', columns: [{ key: 'cost', label: 'Cost' }], rows: [{ id: 'property-tax', values: { cost: '$6,200' } }], actions: [] }, evidence,
    { type: 'ASSUMPTIONS', id: 'cost-assumptions', title: 'Assumptions used', items: ['Insurance premium remains unchanged.'] },
    { type: 'LIMITATION', id: 'cost-limitation', title: 'Planning limitation', body: 'Future premiums may differ.', severity: 'CAUTION' },
  ],
} as AskExecutionResponse;
const outputArtifact: Extract<AskPresentationBlock, { type: 'OUTPUT_ARTIFACTS' }> = {
  type: 'OUTPUT_ARTIFACTS', id: 'maintenance-output-task-1', title: 'Created record',
  items: [{
    artifactType: 'PROPERTY_MAINTENANCE_TASK', artifactId: 'task-1', relationship: 'CREATED', label: 'Replace HVAC filter', status: 'PENDING',
    createdAt: '2026-09-18T12:00:00.000Z', navigation: { label: 'Open task in Maintenance', href: '/dashboard/maintenance?taskId=task-1' },
  }],
};
const reusedQuoteWorkspace: Extract<AskPresentationBlock, { type: 'OUTPUT_ARTIFACTS' }> = {
  type: 'OUTPUT_ARTIFACTS', id: 'quote-workspace-output-workspace-1', title: 'Workspace record',
  items: [{
    artifactType: 'QUOTE_COMPARISON_WORKSPACE', artifactId: 'workspace-1', relationship: 'REUSED', label: 'Plumbing quote comparison', status: 'DRAFT',
    createdAt: '2026-09-17T12:00:00.000Z', navigation: { label: 'Open comparison', href: '/dashboard/properties/home/tools/quote-comparison?workspaceId=workspace-1' },
  }],
};
const relatedRecords: Extract<AskPresentationBlock, { type: 'RELATED_RECORDS' }> = {
  type: 'RELATED_RECORDS', id: 'related-records', title: 'Related records', relationships: [{
    relationshipType: 'DOCUMENT_EVIDENCE_FOR_HOME_EVENT',
    source: { recordType: 'DOCUMENT', recordId: 'document-1', label: 'Roof invoice.pdf' },
    target: { recordType: 'HOME_EVENT', recordId: 'event-1', label: 'Roof replacement' },
    navigation: { label: 'Open home timeline', href: '/dashboard/properties/home/timeline' },
  }],
};

test('current response renders one compact trigger with aggregate context counts', () => {
  const onOpen = jest.fn();
  render(<ResponseContextSummary execution={execution} open={false} onOpen={onOpen} />);
  expect(screen.getByText('2 sources · 1 mapped claim · 1 assumption · 1 limitation attached to this response')).toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: /View sources and context/ });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(trigger).toHaveAttribute('aria-controls', 'ask-response-context');
  fireEvent.click(trigger);
  expect(onOpen).toHaveBeenCalledWith(trigger);
});

test('archived evidence retains the inline disclosure fallback', () => {
  render(<InlineEvidenceBlock block={evidence} />);
  expect(screen.getByText('Sources for this estimate (2)')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /View sources/ })).not.toBeInTheDocument();
});

test('evidence-only responses retain the concise View sources label', () => {
  render(<ResponseContextSummary execution={{ ...execution, blocks: [evidence] }} open={false} onOpen={() => undefined} />);
  expect(screen.getByRole('button', { name: 'View sources' })).toBeInTheDocument();
  expect(screen.getByText('2 sources · 1 mapped claim attached to this response')).toBeInTheDocument();
});

test('context content remains response-scoped and groups evidence, assumptions and limitations', () => {
  const onClose = jest.fn();
  render(<ResponseContextContent execution={execution} onClose={onClose} renderNavigation={() => null} />);
  expect(screen.getByRole('heading', { name: 'Response context' })).toBeInTheDocument();
  expect(screen.getByText(/for this response about Maple Home/)).toBeInTheDocument();
  expect(screen.getByText(/This context belongs to the response “Compare ownership costs”/)).toBeInTheDocument();
  expect(screen.getByText(/County assessor · Observed/)).toBeInTheDocument();
  expect(screen.getByText('Property tax: $517 per month and $6,200 per year.')).toBeInTheDocument();
  expect(screen.getByText('Source name not provided')).toBeInTheDocument();
  expect(screen.getByText('Insurance premium remains unchanged.')).toBeInTheDocument();
  expect(screen.getByText('Future premiums may differ.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('context availability and counts ignore empty contextual blocks', () => {
  expect(responseContextCounts(execution)).toEqual({ sources: 2, claims: 1, assumptions: 1, limitations: 1, outputs: 0, relationships: 0 });
  expect(hasResponseContext(execution)).toBe(true);
  expect(hasResponseContext({ blocks: [{ type: 'EVIDENCE', id: 'empty', title: 'None', items: [] }] })).toBe(false);
});

test('output artifacts are counted and rendered from explicit canonical identity', () => {
  const artifactExecution = { ...execution, blocks: [
    { type: 'WORKFLOW_PROGRESS', id: 'workflow', title: 'Maintenance task created', status: 'COMPLETED', description: 'The task was saved.', details: [{ label: 'Task', value: 'Replace HVAC filter' }], actions: [] },
    outputArtifact,
  ] } as AskExecutionResponse;
  const onOpen = jest.fn();
  render(<ResponseContextSummary execution={artifactExecution} open={false} onOpen={onOpen} />);
  expect(screen.getByText('1 output record attached to this response')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View response context' })).toBeInTheDocument();

  render(<ResponseContextContent execution={artifactExecution} onClose={() => undefined} renderNavigation={(navigation) => navigation ? <a href={navigation.href}>{navigation.label}</a> : null} />);
  expect(screen.getByText('Replace HVAC filter')).toBeInTheDocument();
  expect(screen.getByText(/Maintenance task · pending · Created/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open task in Maintenance' })).toHaveAttribute('href', '/dashboard/maintenance?taskId=task-1');
});

test('archived output artifacts retain an inline disclosure fallback', () => {
  render(<InlineOutputArtifactsBlock block={outputArtifact} renderNavigation={(navigation) => navigation ? <a href={navigation.href}>{navigation.label}</a> : null} />);
  expect(screen.getByText('Created record (1)')).toBeInTheDocument();
  expect(screen.getByText('Replace HVAC filter')).toBeInTheDocument();
});

test('reused quote workspace renders its authoritative type, lifecycle, and original identity', () => {
  const quoteExecution = { ...execution, blocks: [
    { type: 'WORKFLOW_PROGRESS', id: 'workflow', title: 'Existing comparison workspace opened', status: 'COMPLETED', description: 'No provider or quote was selected.', details: [], actions: [] },
    reusedQuoteWorkspace,
  ] } as AskExecutionResponse;
  render(<ResponseContextContent execution={quoteExecution} onClose={() => undefined} renderNavigation={(navigation) => navigation ? <a href={navigation.href}>{navigation.label}</a> : null} />);
  expect(screen.getByText('Plumbing quote comparison')).toBeInTheDocument();
  expect(screen.getByText(/Quote comparison workspace · draft · Existing record reused/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open comparison' })).toHaveAttribute('href', '/dashboard/properties/home/tools/quote-comparison?workspaceId=workspace-1');

  render(<InlineOutputArtifactsBlock block={reusedQuoteWorkspace} renderNavigation={() => null} />);
  expect(screen.getByText('Workspace record (1)')).toBeInTheDocument();
  expect(screen.getByText('Quote comparison workspace · draft · Existing record reused')).toBeInTheDocument();
});

test('related records render the exact producer-declared relationship and navigation', () => {
  const relatedExecution = { ...execution, blocks: [
    { type: 'SUMMARY', id: 'attached', title: 'Attached to your home timeline', body: 'The document is attached.', tone: 'POSITIVE', actions: [] },
    relatedRecords,
  ] } as AskExecutionResponse;
  render(<ResponseContextSummary execution={relatedExecution} open={false} onOpen={() => undefined} />);
  expect(screen.getByText('1 record relationship attached to this response')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'View response context' })).toBeInTheDocument();

  render(<ResponseContextContent execution={relatedExecution} onClose={() => undefined} renderNavigation={(navigation) => navigation ? <a href={navigation.href}>{navigation.label}</a> : null} />);
  expect(screen.getByText('Roof invoice.pdf')).toBeInTheDocument();
  expect(screen.getByText('Evidence for')).toBeInTheDocument();
  expect(screen.getByText('Roof replacement')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open home timeline' })).toHaveAttribute('href', '/dashboard/properties/home/timeline');
});

test('archived related records retain an inline disclosure fallback', () => {
  render(<InlineRelatedRecordsBlock block={relatedRecords} renderNavigation={(navigation) => navigation ? <a href={navigation.href}>{navigation.label}</a> : null} />);
  expect(screen.getByText('Related records (1)')).toBeInTheDocument();
  expect(screen.getByText('Roof invoice.pdf')).toBeInTheDocument();
  expect(screen.getByText('Roof replacement')).toBeInTheDocument();
});
