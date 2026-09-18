import { fireEvent, render, screen } from '@testing-library/react';
import { EvidenceContextContent, EvidenceSummaryBlock } from '../EvidenceContextPanel';
import type { AskExecutionResponse, AskPresentationBlock } from '@/features/ask/types';

type EvidenceBlock = Extract<AskPresentationBlock, { type: 'EVIDENCE' }>;
const evidence: EvidenceBlock = {
  type: 'EVIDENCE', id: 'cost-evidence', title: 'Sources for this estimate',
  items: [
    { label: '2026 property tax assessment', source: 'County assessor', observedAt: '2026-08-14T12:00:00.000Z' },
    { label: 'Insurance premium', source: null, observedAt: null },
  ],
};
const execution = {
  executionId: 'execution', sessionId: 'session', question: 'Compare ownership costs',
  property: { id: 'home', label: 'Maple Home' }, blocks: [evidence],
} as AskExecutionResponse;

test('current evidence renders a compact, accessible context-panel trigger', () => {
  const onOpen = jest.fn();
  render(<EvidenceSummaryBlock block={evidence} open={false} onOpen={onOpen} />);
  expect(screen.getByText('2 sources attached to this response')).toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: /View sources/ });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger);
  expect(onOpen).toHaveBeenCalledWith(trigger);
});

test('archived evidence retains the inline disclosure fallback', () => {
  render(<EvidenceSummaryBlock block={evidence} open={false} />);
  expect(screen.getByText('Sources for this estimate (2)')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /View sources/ })).not.toBeInTheDocument();
});

test('context content remains response-scoped and distinguishes incomplete provenance', () => {
  const onClose = jest.fn();
  render(<EvidenceContextContent execution={execution} onClose={onClose} />);
  expect(screen.getByRole('heading', { name: 'Sources and evidence' })).toBeInTheDocument();
  expect(screen.getByText(/used in this response for Maple Home/)).toBeInTheDocument();
  expect(screen.getByText(/These sources belong to the response “Compare ownership costs”/)).toBeInTheDocument();
  expect(screen.getByText(/County assessor · Observed/)).toBeInTheDocument();
  expect(screen.getByText('Source name not provided')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
