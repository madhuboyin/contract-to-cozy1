import {
  buildEventLocationNote,
  buildHomeRiskReplayGuardrail,
  buildHomeRiskReplayValidationErrors,
  getHomeRiskReplayUserMessage,
} from '../homeRiskReplayUi';

describe('homeRiskReplayUi', () => {
  describe('buildHomeRiskReplayValidationErrors', () => {
    it('requires both dates for a custom range', () => {
      expect(
        buildHomeRiskReplayValidationErrors({
          windowType: 'custom_range',
          windowStart: '',
          windowEnd: '',
        })
      ).toEqual({
        windowStart: 'Choose a start date for the replay window.',
        windowEnd: 'Choose an end date for the replay window.',
      });
    });

    it('rejects reversed custom range dates', () => {
      expect(
        buildHomeRiskReplayValidationErrors({
          windowType: 'custom_range',
          windowStart: '2026-03-10',
          windowEnd: '2026-03-09',
        }).windowStart
      ).toBe('Start date must be on or before the end date.');
    });

    it('does not require dates for non-custom windows', () => {
      expect(
        buildHomeRiskReplayValidationErrors({
          windowType: 'since_built',
          windowStart: '',
          windowEnd: '',
        })
      ).toEqual({});
    });
  });

  describe('getHomeRiskReplayUserMessage', () => {
    it('returns a calm retry message for network generation failures', () => {
      expect(
        getHomeRiskReplayUserMessage(new Error('Network request failed'), 'generate')
      ).toBe('We could not generate the replay right now. Check your connection and try again.');
    });

    it('returns a property-specific message for missing replay details', () => {
      const error = {
        status: 404,
        payload: {
          error: {
            code: 'HOME_RISK_REPLAY_NOT_FOUND',
          },
        },
      };

      expect(getHomeRiskReplayUserMessage(error, 'detail')).toBe(
        'We could not open that replay anymore. Choose another run or generate a fresh replay.'
      );
    });
  });

  describe('buildHomeRiskReplayGuardrail', () => {
    it('returns a useful no-event guardrail', () => {
      expect(
        buildHomeRiskReplayGuardrail({
          id: 'run_1',
          propertyId: 'property_1',
          windowType: 'last_5_years',
          windowStart: '2021-01-01T00:00:00.000Z',
          windowEnd: '2026-01-01T00:00:00.000Z',
          status: 'completed',
          totalEvents: 0,
          highImpactEvents: 0,
          moderateImpactEvents: 0,
          summaryText: null,
          timelineEvents: [],
        })
      ).toEqual({
        title: 'No significant events found',
        description:
          'We found no significant historical events for this property in the selected period. That is still useful context, and it does not rule out normal wear or isolated issues.',
        tone: 'good',
      });
    });

    it('returns a broader-location guardrail when replay events use broad location matches', () => {
      expect(
        buildHomeRiskReplayGuardrail({
          id: 'run_2',
          propertyId: 'property_1',
          windowType: 'since_built',
          windowStart: '1999-01-01T00:00:00.000Z',
          windowEnd: '2026-01-01T00:00:00.000Z',
          status: 'completed',
          totalEvents: 2,
          highImpactEvents: 1,
          moderateImpactEvents: 1,
          summaryText: 'Matched replay',
          timelineEvents: [
            {
              id: 'match_1',
              homeRiskEventId: 'event_1',
              eventType: 'hail',
              eventSubType: null,
              title: 'Hail event',
              summary: null,
              severity: 'high',
              startAt: '2024-01-01T00:00:00.000Z',
              endAt: null,
              matchScore: 0.8,
              impactLevel: 'moderate',
              impactSummary: null,
              impactFactorsJson: {
                locationMatch: {
                  basis: 'zip',
                  score: 0.72,
                },
              },
              recommendedActionsJson: null,
              matchedSystemsJson: null,
            },
          ],
        })
      ).toEqual({
        title: 'Some matches are broader location signals',
        description:
          'Some events are matched from ZIP, city, county, or state-level history. Treat them as relevant context for the home, not proof of direct damage.',
        tone: 'info',
      });
    });
  });

  describe('buildEventLocationNote', () => {
    it('explains broader location matches calmly', () => {
      expect(
        buildEventLocationNote({
          impactFactorsJson: {
            locationMatch: {
              basis: 'county',
              score: 0.44,
            },
          },
        })
      ).toBe(
        'This match comes from broader location history near the property, so treat it as relevant context rather than direct evidence of impact.'
      );
    });
  });
});
