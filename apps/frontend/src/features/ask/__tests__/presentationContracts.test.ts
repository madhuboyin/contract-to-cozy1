import { ASK_DESTINATIONS } from '../destinations';
import { ASK_DESTINATION_PRESENTATION_CONTRACTS, ASK_SPECIALIZED_PRESENTATION_CONTRACTS, ASK_SPECIALIZED_RESULT_CONTRACTS, validateRegisteredAskPresentationContracts } from '../presentationContracts';

describe('Ask presentation contracts', () => {
  it('covers every shell destination with a valid versioned contract', () => {
    expect(Object.keys(ASK_DESTINATION_PRESENTATION_CONTRACTS).sort()).toEqual(ASK_DESTINATIONS.map((item) => item.id).sort());
    expect(Object.values(ASK_DESTINATION_PRESENTATION_CONTRACTS).every((contract) => contract.version === 1)).toBe(true);
  });

  it('covers every registered specialized grouped-list family', () => {
    expect(Object.keys(ASK_SPECIALIZED_PRESENTATION_CONTRACTS).sort()).toEqual([
      'BUDGET_BREAKDOWN', 'CHOICE_GRID', 'DECK', 'ROOM_MAP', 'SHELVES', 'STATUS_ACCORDION',
    ]);
  });

  it('covers every dedicated data-rich result family', () => {
    expect(Object.keys(ASK_SPECIALIZED_RESULT_CONTRACTS).sort()).toEqual([
      'COMPARISON', 'ENVIRONMENT_REPORT', 'PRIORITY_LIST', 'SCENARIO_COMPARISON', 'TASK_GUIDE', 'TIMELINE',
    ]);
  });

  it('declares responsive priorities, honest states, and acceptance criteria without registry issues', () => {
    expect(validateRegisteredAskPresentationContracts()).toEqual([]);
  });
});
