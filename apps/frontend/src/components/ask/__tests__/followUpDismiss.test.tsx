import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FollowUpRow } from '../calm/FollowUpRow';
import { isDismissibleStarterAction, type FollowUpItem } from '@/features/ask/followUps';
import type { SuggestedNextAction } from '@/features/ask/types';

// Dismissal control for curated starters (exact-four activation): Not now / Not relevant, only on a recommendation-class DISCOVERY action.
const action = (over: Partial<SuggestedNextAction> = {}): SuggestedNextAction => ({
  id: 'v1.abcdefghijklmnop', outcomeKey: 'REVIEW_THIS_SEASON', label: 'Home care for this season', message: 'What home care should I do this season?',
  operationId: 'SEASONAL_HOME_CARE', interactionType: 'CONVERSATION_CONTINUE',
  entityContext: { propertyId: 'p1', entityType: null, entityId: null, contextVersion: null },
  eligibility: { state: 'ELIGIBLE', reasonCodes: [], missingFactKeys: [] },
  provenance: { source: 'CAPABILITY_RECOMMENDATION', sourceOperationId: null, sourceExecutionId: 'e1', reasonCodes: [] },
  createdAt: '2026-10-05T12:00:00.000Z', expiresAt: '2026-10-06T12:00:00.000Z', priority: { tier: 'DISCOVERY', score: 1000 }, ...over,
});
const item = (a: SuggestedNextAction): Extract<FollowUpItem, { kind: 'ACTION' }> => ({ kind: 'ACTION', key: `action:${a.id}`, label: a.label, action: a });

describe('starter dismissal control', () => {
  it('is offered only for a recommendation-class DISCOVERY action', () => {
    expect(isDismissibleStarterAction(action())).toBe(true);
    expect(isDismissibleStarterAction(action({ provenance: { source: 'ENTITY_ACTION', sourceOperationId: null, sourceExecutionId: null, reasonCodes: [] } }))).toBe(false);
    expect(isDismissibleStarterAction(action({ priority: { tier: 'CONTINUE', score: 4000 } }))).toBe(false);
  });

  it('shows no control without an onDismiss handler, and none on a non-starter action', () => {
    render(<FollowUpRow items={[item(action())]} busy={false} onPick={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /Dismiss/ })).toBeNull();
    render(<FollowUpRow items={[item(action({ id: 'v1.zzzzzzzzzzzzzzzz', label: 'Fix the brand', priority: { tier: 'RECORD_ACTION', score: 3000 } }))]} busy={false} onPick={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Dismiss Fix the brand' })).toBeNull();
  });

  it('opens a two-choice menu and reports Not now or Not relevant for that action, without picking the chip', () => {
    const onDismiss = jest.fn(); const onPick = jest.fn();
    const starter = item(action());
    const { rerender } = render(<FollowUpRow items={[starter]} busy={false} onPick={onPick} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Home care for this season' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not relevant' }));
    expect(onDismiss).toHaveBeenCalledWith(starter, 'NOT_RELEVANT');
    expect(onPick).not.toHaveBeenCalled();
    rerender(<FollowUpRow items={[starter]} busy={false} onPick={onPick} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Home care for this season' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenLastCalledWith(starter, 'NOT_NOW');
  });

  it('Cancel closes the menu with no report, and the control is inert while a request runs', () => {
    const onDismiss = jest.fn();
    const { rerender } = render(<FollowUpRow items={[item(action())]} busy={false} onPick={jest.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Home care for this season' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dismiss Home care for this season' })).toBeInTheDocument();
    rerender(<FollowUpRow items={[item(action())]} busy onPick={jest.fn()} onDismiss={onDismiss} />);
    expect(screen.getByRole('button', { name: 'Dismiss Home care for this season' })).toBeDisabled();
  });
});
