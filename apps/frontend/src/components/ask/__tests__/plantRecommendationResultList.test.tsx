import { fireEvent, render, screen } from '@testing-library/react';
import type { AskPresentationBlock } from '@/features/ask/types';
import { PlantRecommendationResultList } from '../PlantRecommendationResultList';

jest.mock('../blocks/context', () => ({ ActionLink: ({ action }: { action: { label: string } }) => <button type="button">{action.label}</button> }));

type Block = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>;
const actions = [
  { id: 'plant-recommendation-add-home', label: 'Track this plant', message: 'Add', style: 'PRIMARY', interactionType: 'MUTATE_RECORD', operationId: 'ROOM_PLANT_RECOMMENDATIONS' },
  { id: 'plant-recommendation-save', label: 'Save for later', message: 'Save', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'ROOM_PLANT_RECOMMENDATIONS' },
  { id: 'plant-recommendation-dismiss', label: 'Not interested', message: 'Dismiss', style: 'SECONDARY', interactionType: 'MUTATE_RECORD', operationId: 'ROOM_PLANT_RECOMMENDATIONS' },
];
const item = (id: string, title: string, badgeLabel: string, tone: 'POSITIVE' | 'CAUTION') => ({
  id, title, entityType: 'PLANT_RECOMMENDATION', description: 'A compact indoor plant.', condition: 'Planta example', status: 'RECOMMENDED', badgeLabel, tone,
  meta: [id === 'best' ? '88% fit' : '22% fit', id === 'best' ? 'High confidence' : 'Low confidence'],
  attributes: [{ label: 'Light', value: 'Medium' }, { label: 'Care', value: 'Low' }, { label: 'Pet safety', value: id === 'best' ? 'Pet-safe' : 'Not pet-safe', tone: id === 'best' ? 'POSITIVE' : 'CRITICAL' }],
  highlights: ['Light requirement aligns with this room.'], warnings: id === 'best' ? [] : ['Not a strong fit for this room.'], detail: 'Care: Water when dry.', actions,
});
const block: Block = {
  type: 'GROUPED_LIST', id: 'room-plant-recommendations', title: 'Recommendations for Kitchen', description: 'Kitchen · Medium light · Low care · Pets have access', filters: [],
  actions: [{ id: 'again', label: 'Change preferences', style: 'SECONDARY', interactionType: 'START_WORKFLOW', message: 'Find again', operationId: 'ROOM_PLANT_RECOMMENDATIONS' }],
  sections: [
    { id: 'best-matches', title: 'Best matches', count: 1, initialVisibleCount: 1, items: [item('best', '1. Spider Plant', 'Best match', 'POSITIVE')] },
    { id: 'other-possibilities', title: 'Other possibilities', caption: 'Meaningful tradeoffs.', count: 1, items: [item('weak', '8. ZZ Plant', 'Weak match', 'CAUTION')] },
  ],
} as unknown as Block;

test('shows scannable fit and safety facts while keeping weak matches collapsed', () => {
  render(<PlantRecommendationResultList block={block} onAction={jest.fn()} />);
  expect(screen.getByText('Best match')).toBeVisible();
  expect(screen.getByText('Pet-safe')).toBeVisible();
  expect(screen.getByText(/Kitchen · Medium light/)).toBeVisible();
  expect(screen.queryByText('8. ZZ Plant')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Other possibilities/ }));
  expect(screen.getByText('8. ZZ Plant')).toBeVisible();
  expect(screen.getByText('Weak match')).toBeVisible();
  expect(screen.getByText('Not pet-safe')).toBeVisible();
});

test('uses distinct action wording and dispatches the declared command', () => {
  const onAction = jest.fn();
  render(<PlantRecommendationResultList block={block} onAction={onAction} />);
  fireEvent.click(screen.getByRole('button', { name: 'Track this plant' }));
  expect(onAction).toHaveBeenCalledWith('PLANT_RECOMMENDATION', 'best', 'Add', 'ROOM_PLANT_RECOMMENDATIONS', 'MUTATE_RECORD');
  expect(screen.getByRole('button', { name: 'Save for later' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Change preferences' })).toBeVisible();
});

test('reveals care detail without expanding every recommendation', () => {
  render(<PlantRecommendationResultList block={block} onAction={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /View details/ }));
  expect(screen.getByText('Care: Water when dry.')).toBeVisible();
});
