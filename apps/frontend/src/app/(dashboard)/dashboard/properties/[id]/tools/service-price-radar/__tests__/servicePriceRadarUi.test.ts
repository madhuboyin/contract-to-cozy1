import {
  MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT,
  buildServicePriceRadarGuardrail,
  buildServicePriceRadarValidationErrors,
  getServicePriceRadarUserMessage,
} from '../servicePriceRadarUi';

describe('servicePriceRadarUi', () => {
  describe('buildServicePriceRadarValidationErrors', () => {
    it('requires a category and positive quote amount', () => {
      expect(
        buildServicePriceRadarValidationErrors({
          serviceCategory: '',
          quoteAmount: '0',
        })
      ).toEqual({
        serviceCategory: 'Choose the service type first.',
        quoteAmount: 'Enter the quote amount you want to check.',
      });
    });

    it('rejects unusually large quote amounts', () => {
      expect(
        buildServicePriceRadarValidationErrors({
          serviceCategory: 'HVAC',
          quoteAmount: String(MAX_SERVICE_PRICE_RADAR_QUOTE_AMOUNT + 1),
        }).quoteAmount
      ).toBe('Enter a quote below $250,000 for this MVP estimate.');
    });
  });

  describe('getServicePriceRadarUserMessage', () => {
    it('returns a calm retry message for network submit failures', () => {
      const error = new Error('Network error. Please check your connection.');
      expect(getServicePriceRadarUserMessage(error, 'submit')).toEqual({
        message: 'We could not check this quote right now. Check your connection and try again.',
      });
    });

    it('asks the UI to clear a stale linked entity', () => {
      const error = {
        message: 'Linked system was not found for this property.',
        status: 400,
        payload: {
          error: {
            code: 'INVALID_LINKED_ENTITY',
          },
        },
      };

      expect(getServicePriceRadarUserMessage(error, 'submit')).toEqual({
        message:
          'The linked home item is no longer available. We removed it, so you can retry the quote check.',
        clearLinkedEntity: true,
      });
    });
  });

  describe('buildServicePriceRadarGuardrail', () => {
    it('returns a broad-estimate guardrail for insufficient data', () => {
      expect(
        buildServicePriceRadarGuardrail({
          verdict: 'INSUFFICIENT_DATA',
          confidenceScore: 0.32,
          benchmarkMatched: false,
          expectedLow: null,
          expectedHigh: null,
        })
      ).toEqual({
        title: 'Broad estimate only',
        description:
          'We could only estimate a broad range based on limited property and pricing context.',
        tone: 'info',
      });
    });

    it('returns a fallback warning when benchmark context is missing and confidence is low', () => {
      expect(
        buildServicePriceRadarGuardrail({
          verdict: 'HIGH',
          confidenceScore: 0.42,
          benchmarkMatched: false,
          expectedLow: 1500,
          expectedHigh: 2800,
        })
      ).toEqual({
        title: 'Directional result',
        description:
          'This result uses fallback regional assumptions, so it is best treated as a broad guide.',
        tone: 'elevated',
      });
    });
  });
});
