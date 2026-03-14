import { filterRelatedToolIds, getRelatedToolIds } from '../getRelatedTools';

describe('getRelatedToolIds', () => {
  it('excludes the current tool from the recommendations', () => {
    expect(
      getRelatedToolIds({
        context: 'service-price-radar',
        currentToolId: 'service-price-radar',
      }),
    ).toEqual(['negotiation-shield', 'cost-explainer', 'true-cost']);
  });

  it('limits the number of items to the requested cap', () => {
    expect(
      getRelatedToolIds({
        context: 'property-hub',
        maxItems: 2,
      }),
    ).toEqual(['home-event-radar', 'home-risk-replay']);
  });

  it('hides the section when there are not enough useful results', () => {
    expect(
      filterRelatedToolIds({
        candidateToolIds: ['status-board'],
      }),
    ).toEqual([]);
  });

  it('de-dupes repeated tool ids before rendering', () => {
    expect(
      filterRelatedToolIds({
        candidateToolIds: ['home-risk-replay', 'home-risk-replay', 'status-board'],
      }),
    ).toEqual(['home-risk-replay', 'status-board']);
  });
});
