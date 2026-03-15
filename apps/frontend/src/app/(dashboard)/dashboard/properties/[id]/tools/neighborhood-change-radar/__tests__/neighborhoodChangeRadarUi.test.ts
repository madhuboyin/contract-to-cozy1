import {
  buildNeighborhoodRadarGuardrail,
  buildStaleEventNote,
  formatNeighborhoodDistance,
  getConfidenceBandLabel,
  getEffectSentimentLabel,
  getNeighborhoodEventUserMessage,
} from '../neighborhoodChangeRadarUi';

describe('neighborhoodChangeRadarUi', () => {
  // ============================================================================
  // getNeighborhoodEventUserMessage
  // ============================================================================

  describe('getNeighborhoodEventUserMessage', () => {
    it('returns a property-not-found message for 404', () => {
      expect(
        getNeighborhoodEventUserMessage({ status: 404 }, 'summary'),
      ).toBe(
        'We could not load this property context. Open Neighborhood Change Radar from one of your properties and try again.',
      );
    });

    it('returns a property-not-found message for PROPERTY_ACCESS_DENIED code', () => {
      expect(
        getNeighborhoodEventUserMessage(
          { payload: { error: { code: 'PROPERTY_ACCESS_DENIED' } } },
          'events',
        ),
      ).toBe(
        'We could not load this property context. Open Neighborhood Change Radar from one of your properties and try again.',
      );
    });

    it('returns session-expired message for 401', () => {
      expect(
        getNeighborhoodEventUserMessage({ status: 401 }, 'summary'),
      ).toBe('Your session expired. Refresh the page and try again.');
    });

    it('returns session-expired message for TOKEN_EXPIRED code', () => {
      expect(
        getNeighborhoodEventUserMessage(
          { payload: { error: { code: 'TOKEN_EXPIRED' } } },
          'detail',
        ),
      ).toBe('Your session expired. Refresh the page and try again.');
    });

    it('returns network message for detail stage on network failure', () => {
      expect(
        getNeighborhoodEventUserMessage(new Error('Network request failed'), 'detail'),
      ).toBe('We could not load this event detail right now. Try again.');
    });

    it('returns network message for trends stage on network failure', () => {
      expect(
        getNeighborhoodEventUserMessage(new Error('fetch timeout'), 'trends'),
      ).toBe('We could not load neighborhood trends right now. Try again.');
    });

    it('returns generic connection message for summary stage on network failure', () => {
      expect(
        getNeighborhoodEventUserMessage(new Error('network error'), 'summary'),
      ).toBe(
        'We could not load Neighborhood Change Radar right now. Check your connection and try again.',
      );
    });

    it('returns stage-specific fallback for detail stage', () => {
      expect(
        getNeighborhoodEventUserMessage(new Error('Unexpected server error'), 'detail'),
      ).toBe('We could not load this event detail right now.');
    });

    it('returns stage-specific fallback for events stage', () => {
      expect(
        getNeighborhoodEventUserMessage(new Error('Unexpected server error'), 'events'),
      ).toBe('We could not load neighborhood events right now.');
    });

    it('returns generic fallback for summary stage on unknown error', () => {
      expect(
        getNeighborhoodEventUserMessage(new Error('Something went wrong'), 'summary'),
      ).toBe('We could not load Neighborhood Change Radar right now.');
    });
  });

  // ============================================================================
  // buildNeighborhoodRadarGuardrail
  // ============================================================================

  describe('buildNeighborhoodRadarGuardrail', () => {
    it('returns a reassuring guardrail when no events are found', () => {
      expect(
        buildNeighborhoodRadarGuardrail({
          meaningfulChangeCount: 0,
          topPositiveThemes: [],
          topNegativeThemes: [],
          totalCount: 0,
        }),
      ).toEqual({
        title: 'No neighborhood changes detected',
        description:
          'We found no significant neighborhood events for this property yet. That is still useful context — we will notify you as new developments are linked to your home.',
        tone: 'good',
      });
    });

    it('returns an awaiting-data guardrail when events exist but none are meaningful', () => {
      expect(
        buildNeighborhoodRadarGuardrail({
          meaningfulChangeCount: 0,
          topPositiveThemes: [],
          topNegativeThemes: [],
          totalCount: 3,
        }),
      ).toEqual({
        title: 'Events found — awaiting more data',
        description:
          'Some neighborhood events are linked to this property, but they are older signals or lack enough data for a confident assessment. Check back as data is refreshed.',
        tone: 'info',
      });
    });

    it('returns a preliminary guardrail when most events are preliminary', () => {
      expect(
        buildNeighborhoodRadarGuardrail({
          meaningfulChangeCount: 2,
          topPositiveThemes: [],
          topNegativeThemes: [],
          totalCount: 5,
          preliminaryCount: 3,
        }),
      ).toEqual({
        title: 'Signals are preliminary',
        description:
          'Most linked events have limited data — no confirmed source, dates, or descriptions yet. Treat these as early signals rather than verified developments.',
        tone: 'info',
      });
    });

    it('returns null when there are meaningful events with good confidence', () => {
      expect(
        buildNeighborhoodRadarGuardrail({
          meaningfulChangeCount: 4,
          topPositiveThemes: ['Transit access'],
          topNegativeThemes: ['Construction noise'],
          totalCount: 4,
          preliminaryCount: 0,
        }),
      ).toBeNull();
    });

    it('returns null when meaningfulChangeCount equals totalCount and preliminary is low', () => {
      expect(
        buildNeighborhoodRadarGuardrail({
          meaningfulChangeCount: 3,
          topPositiveThemes: ['School ratings'],
          topNegativeThemes: [],
          totalCount: 3,
          preliminaryCount: 1,
        }),
      ).toBeNull();
    });
  });

  // ============================================================================
  // getConfidenceBandLabel
  // ============================================================================

  describe('getConfidenceBandLabel', () => {
    it('returns "Older signal" for stale events regardless of band', () => {
      expect(getConfidenceBandLabel('HIGH', true)).toBe('Older signal');
      expect(getConfidenceBandLabel('MEDIUM', true)).toBe('Older signal');
      expect(getConfidenceBandLabel('PRELIMINARY', true)).toBe('Older signal');
    });

    it('returns null for HIGH confidence fresh events — HIGH needs no label', () => {
      expect(getConfidenceBandLabel('HIGH', false)).toBeNull();
    });

    it('returns "Medium confidence" for MEDIUM band fresh events', () => {
      expect(getConfidenceBandLabel('MEDIUM', false)).toBe('Medium confidence');
    });

    it('returns "Preliminary signal" for PRELIMINARY band fresh events', () => {
      expect(getConfidenceBandLabel('PRELIMINARY', false)).toBe('Preliminary signal');
    });
  });

  // ============================================================================
  // buildStaleEventNote
  // ============================================================================

  describe('buildStaleEventNote', () => {
    it('returns a note for stale events', () => {
      expect(
        buildStaleEventNote({ isStale: true, confidenceBand: 'MEDIUM' }),
      ).toBe('This is an older signal — confirm current status before acting on it.');
    });

    it('returns a note for stale PRELIMINARY events too', () => {
      expect(
        buildStaleEventNote({ isStale: true, confidenceBand: 'PRELIMINARY' }),
      ).toBe('This is an older signal — confirm current status before acting on it.');
    });

    it('returns null for fresh events', () => {
      expect(
        buildStaleEventNote({ isStale: false, confidenceBand: 'HIGH' }),
      ).toBeNull();
    });

    it('returns null for fresh MEDIUM events', () => {
      expect(
        buildStaleEventNote({ isStale: false, confidenceBand: 'MEDIUM' }),
      ).toBeNull();
    });
  });

  // ============================================================================
  // formatNeighborhoodDistance
  // ============================================================================

  describe('formatNeighborhoodDistance', () => {
    it('formats distances under 0.1 mi as "Very close"', () => {
      expect(formatNeighborhoodDistance(0.0)).toBe('Very close');
      expect(formatNeighborhoodDistance(0.05)).toBe('Very close');
      expect(formatNeighborhoodDistance(0.09)).toBe('Very close');
    });

    it('formats 0.1 mi as "0.1 mi away"', () => {
      expect(formatNeighborhoodDistance(0.1)).toBe('0.1 mi away');
    });

    it('formats 0.5 miles correctly', () => {
      expect(formatNeighborhoodDistance(0.5)).toBe('0.5 mi away');
    });

    it('formats 1.23 miles to one decimal', () => {
      expect(formatNeighborhoodDistance(1.23)).toBe('1.2 mi away');
    });

    it('formats 2.0 miles correctly', () => {
      expect(formatNeighborhoodDistance(2.0)).toBe('2.0 mi away');
    });
  });

  // ============================================================================
  // getEffectSentimentLabel
  // ============================================================================

  describe('getEffectSentimentLabel', () => {
    it('HIGHLY_POSITIVE → positive label', () => {
      expect(getEffectSentimentLabel('HIGHLY_POSITIVE')).toBe('Positive impact expected');
    });

    it('MODERATELY_POSITIVE → positive label', () => {
      expect(getEffectSentimentLabel('MODERATELY_POSITIVE')).toBe('Positive impact expected');
    });

    it('HIGHLY_NEGATIVE → negative label', () => {
      expect(getEffectSentimentLabel('HIGHLY_NEGATIVE')).toBe('Negative impact expected');
    });

    it('MODERATELY_NEGATIVE → negative label', () => {
      expect(getEffectSentimentLabel('MODERATELY_NEGATIVE')).toBe('Negative impact expected');
    });

    it('MIXED → mixed label', () => {
      expect(getEffectSentimentLabel('MIXED')).toBe('Mixed impact expected');
    });

    it('NEUTRAL → neutral label', () => {
      expect(getEffectSentimentLabel('NEUTRAL')).toBe('Neutral or unclear impact');
    });
  });
});
