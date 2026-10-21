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
  highlights: ['Light requirement aligns with this room.'], warnings: id === 'best' ? [] : ['Not a strong fit for this room.'],
  guidance: [{ label: 'Care', value: 'Water when dry.', kind: 'CARE' }, { label: 'Best placement', value: 'Near a bright window.', kind: 'PLACEMENT' }], actions,
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

test('reveals scannable care and placement guidance without expanding every recommendation', () => {
  render(<PlantRecommendationResultList block={block} onAction={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /View details/ }));
  expect(screen.getByRole('heading', { name: 'Care & placement' })).toBeVisible();
  expect(screen.getByText('Water when dry.')).toBeVisible();
  expect(screen.getByText('Near a bright window.')).toBeVisible();
});

test('upgrades legacy stored detail strings without repeating rationale or fallback warnings', () => {
  const legacyBlock = JSON.parse(JSON.stringify(block)) as Block;
  const legacyItem = legacyBlock.sections[0].items[0];
  legacyItem.guidance = undefined;
  legacyItem.detail = 'Fits kitchen conditions. Tradeoff: light is close to ideal.\nCare: Prune to keep shape.\nPlacement: Use a high shelf.';
  legacyItem.warnings = ['Use filtered light.', 'Works, but not ideal under current room inputs.'];
  render(<PlantRecommendationResultList block={legacyBlock} onAction={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /View details/ }));
  expect(screen.getByText('Prune to keep shape.')).toBeVisible();
  expect(screen.getByText('Use a high shelf.')).toBeVisible();
  expect(screen.queryByText(/Fits kitchen conditions. Tradeoff/)).not.toBeInTheDocument();
  expect(screen.queryByText('Works, but not ideal under current room inputs.')).not.toBeInTheDocument();
});
