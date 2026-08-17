import { fireEvent, render, screen } from '@testing-library/react';
import type { BuyerChecklistComposition } from '@/types';
import { BuyerPlanPersonalization } from '../BuyerPlanPersonalization';

const composition = (overrides: Partial<BuyerChecklistComposition> = {}): BuyerChecklistComposition => ({
  templateVersion: 'buyer-phase-checklists-v2',
  contextVersion: 'context-v1',
  evaluatedAt: '2026-08-17T12:00:00.000Z',
  items: [],
  questions: [{
    factKey: 'structure.basementConfiguration',
    prompt: 'Does the home have a basement?',
    whyWeAsk: 'A basement changes the moisture and foundation questions worth discussing.',
    correctionPath: '/api/properties/property-1/context/structure.basementConfiguration',
    affectedTemplateKeys: ['basement-inspection-focus'],
    impactRank: 76,
    answerKind: 'SINGLE_SELECT',
    options: [{ label: 'No basement', value: 'NONE' }, { label: 'Finished basement', value: 'FINISHED' }],
  }],
  knownFacts: [{ factKey: 'core.dwellingType', label: 'Home type', value: 'Detached Single Family' }],
  personalizedItems: [],
  setupStatus: 'NEEDS_INPUT',
  delta: { added: 0, removed: 0, unchanged: 9, addedItems: [], removedItems: [] },
  ...overrides,
});

describe('Buyer Plan personalization', () => {
  it('asks one plain-language, consequential question at a time', () => {
    const onAnswer = jest.fn();
    render(<BuyerPlanPersonalization
      composition={composition()}
      readOnly={false}
      saving={false}
      onAnswer={onAnswer}
      onApplyReviewedChanges={jest.fn()}
    />);

    expect(screen.getByText('Make this plan fit my home')).toBeInTheDocument();
    expect(screen.getByText('What we already know')).toBeInTheDocument();
    expect(screen.getByText('Does the home have a basement?')).toBeInTheDocument();
    expect(screen.getByText(/How this helps:/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finished basement' }));
    expect(onAnswer).toHaveBeenCalledWith('structure.basementConfiguration', 'FINISHED');
  });

  it('requires explicit review before removing existing guidance', () => {
    const onApplyReviewedChanges = jest.fn();
    render(<BuyerPlanPersonalization
      composition={composition({
        delta: {
          added: 0,
          removed: 1,
          unchanged: 9,
          addedItems: [],
          removedItems: [{ actionKey: 'buyer:phase:pool-specialist-review', title: 'Ask what the pool or spa inspection covers' }],
        },
      })}
      readOnly={false}
      saving={false}
      onAnswer={jest.fn()}
      onApplyReviewedChanges={onApplyReviewedChanges}
    />);

    expect(screen.getByText('Review before changing existing work')).toBeInTheDocument();
    expect(screen.getByText(/Ask what the pool or spa inspection covers/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed changes' }));
    expect(onApplyReviewedChanges).toHaveBeenCalledTimes(1);
  });

  it('lets a buyer continue when an approximate year is not known', () => {
    const onAnswer = jest.fn();
    render(<BuyerPlanPersonalization
      composition={composition({
        questions: [{
          factKey: 'core.yearBuilt',
          prompt: 'About when was the home built?',
          whyWeAsk: 'This adds age-relevant questions.',
          correctionPath: '/api/properties/property-1/context/core.yearBuilt',
          affectedTemplateKeys: ['age-records-questions'],
          impactRank: 80,
          answerKind: 'YEAR',
        }],
      })}
      readOnly={false}
      saving={false}
      onAnswer={onAnswer}
      onApplyReviewedChanges={jest.fn()}
    />);

    fireEvent.click(screen.getByRole('button', { name: /not sure — continue/i }));
    expect(onAnswer).toHaveBeenCalledWith('core.yearBuilt', null);
  });

  it('collapses after the meaningful questions are complete', () => {
    render(<BuyerPlanPersonalization
      composition={composition({ questions: [], setupStatus: 'PERSONALIZED' })}
      readOnly={false}
      saving={false}
      onAnswer={jest.fn()}
      onApplyReviewedChanges={jest.fn()}
    />);

    expect(screen.getByText('Plan personalized')).toBeInTheDocument();
    expect(screen.queryByText('Make this plan fit my home')).not.toBeInTheDocument();
  });
});
