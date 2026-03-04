import {
  extractDigitsCandidate,
  extractModelSerialCandidate,
  hasMeaningfulLookupData,
  isValidGtinChecksum,
} from '../scanParsing';

describe('scanParsing', () => {
  describe('isValidGtinChecksum', () => {
    it('accepts valid GTIN values', () => {
      expect(isValidGtinChecksum('012345678905')).toBe(true);
      expect(isValidGtinChecksum('4006381333931')).toBe(true);
    });

    it('rejects invalid or unsupported values', () => {
      expect(isValidGtinChecksum('012345678906')).toBe(false);
      expect(isValidGtinChecksum('1234567')).toBe(false);
      expect(isValidGtinChecksum('not-a-code')).toBe(false);
    });
  });

  describe('extractDigitsCandidate', () => {
    it('extracts valid GTIN from URL parameters', () => {
      const input = 'https://example.com/register?upc=012345678905&foo=bar';
      expect(extractDigitsCandidate(input)).toBe('012345678905');
    });

    it('extracts valid GTIN from labeled text', () => {
      const input = 'Barcode: 4006381333931';
      expect(extractDigitsCandidate(input)).toBe('4006381333931');
    });

    it('rejects invalid checksum and random long digit runs', () => {
      expect(extractDigitsCandidate('UPC=012345678906')).toBeNull();
      expect(extractDigitsCandidate('Order id 12345678901234567')).toBeNull();
    });
  });

  describe('extractModelSerialCandidate', () => {
    it('extracts model, serial, and manufacturer fields', () => {
      const input = 'Manufacturer: ACME Appliances\nModel No: DW80R9950US\nSerial Number: SN-000123';
      expect(extractModelSerialCandidate(input)).toEqual({
        manufacturer: 'ACME Appliances',
        modelNumber: 'DW80R9950US',
        serialNumber: 'SN-000123',
      });
    });
  });

  describe('hasMeaningfulLookupData', () => {
    it('returns true when payload has useful fields', () => {
      expect(hasMeaningfulLookupData({ name: 'Dishwasher' })).toBe(true);
      expect(hasMeaningfulLookupData({ manufacturer: 'Samsung' })).toBe(true);
    });

    it('returns false for empty payloads', () => {
      expect(hasMeaningfulLookupData({ upc: '012345678905' })).toBe(false);
      expect(hasMeaningfulLookupData({})).toBe(false);
      expect(hasMeaningfulLookupData(null)).toBe(false);
    });
  });
});
