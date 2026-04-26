/**
 * CTA Contract System Tests
 */

import {
  CTAContract,
  CTAPromise,
  CTADestination,
  createCTAContract,
  validateCTAContract,
  validateAllContracts,
  PAGE_CONTRACTS,
} from '../contracts';

describe('CTA Contract System', () => {
  describe('createCTAContract', () => {
    it('creates a valid contract', () => {
      const promise: CTAPromise = {
        action: 'Review maintenance items',
        metrics: [{ type: 'count', value: 3, label: 'maintenance items' }],
        priority: 'critical',
      };

      const destination: CTADestination = {
        route: '/dashboard/resolution-center',
        params: { propertyId: '123', filter: 'maintenance' },
        requiredFeatures: ['filter-maintenance'],
      };

      const contract = createCTAContract('test-cta', 'TestComponent', promise, destination);

      expect(contract.id).toBe('test-cta');
      expect(contract.source).toBe('TestComponent');
      expect(contract.promise).toEqual(promise);
      expect(contract.destination).toEqual(destination);
      expect(contract.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('validateCTAContract', () => {
    it('validates a correct contract', () => {
      const contract: CTAContract = {
        id: 'health-score-maintenance',
        source: 'PropertyHealthScoreCard',
        promise: {
          action: 'Review maintenance items',
          metrics: [{ type: 'count', value: 3, label: 'maintenance items' }],
          priority: 'critical',
        },
        destination: {
          route: '/dashboard/resolution-center',
          params: { propertyId: '123', filter: 'maintenance' },
          requiredFeatures: ['filter-maintenance'],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails validation for missing page contract', () => {
      const contract: CTAContract = {
        id: 'invalid-cta',
        source: 'TestComponent',
        promise: {
          action: 'Do something',
          priority: 'medium',
        },
        destination: {
          route: '/non-existent-page',
          params: {},
          requiredFeatures: [],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_PAGE_CONTRACT');
    });

    it('fails validation for missing required feature', () => {
      const contract: CTAContract = {
        id: 'test-cta',
        source: 'TestComponent',
        promise: {
          action: 'Review items',
          priority: 'high',
        },
        destination: {
          route: '/dashboard/resolution-center',
          params: {},
          requiredFeatures: ['non-existent-feature'],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('MISSING_FEATURE');
    });

    it('warns for unknown parameter', () => {
      const contract: CTAContract = {
        id: 'test-cta',
        source: 'TestComponent',
        promise: {
          action: 'Review items',
          priority: 'medium',
        },
        destination: {
          route: '/dashboard/resolution-center',
          params: { unknownParam: 'value' },
          requiredFeatures: [],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('UNKNOWN_PARAMETER');
    });

    it('warns for unsupported metric type', () => {
      const contract: CTAContract = {
        id: 'test-cta',
        source: 'TestComponent',
        promise: {
          action: 'Review items',
          metrics: [{ type: 'percentage', value: 85, label: 'completion' }],
          priority: 'medium',
        },
        destination: {
          route: '/dashboard/resolution-center',
          params: {},
          requiredFeatures: [],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('UNSUPPORTED_METRIC');
    });

    it('handles route with dynamic segments', () => {
      const contract: CTAContract = {
        id: 'test-cta',
        source: 'TestComponent',
        promise: {
          action: 'View health score',
          priority: 'medium',
        },
        destination: {
          route: '/dashboard/properties/abc-123/health-score',
          params: {},
          requiredFeatures: [],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(true);
    });

    it('handles route with query parameters', () => {
      const contract: CTAContract = {
        id: 'test-cta',
        source: 'TestComponent',
        promise: {
          action: 'View items',
          priority: 'medium',
        },
        destination: {
          route: '/dashboard/resolution-center?propertyId=123&filter=urgent',
          params: {},
          requiredFeatures: [],
        },
      };

      const result = validateCTAContract(contract);

      expect(result.valid).toBe(true);
    });
  });

  describe('validateAllContracts', () => {
    it('validates multiple contracts', () => {
      const contracts: CTAContract[] = [
        {
          id: 'cta-1',
          source: 'Component1',
          promise: { action: 'Action 1', priority: 'high' },
          destination: {
            route: '/dashboard/resolution-center',
            params: {},
            requiredFeatures: [],
          },
        },
        {
          id: 'cta-2',
          source: 'Component2',
          promise: { action: 'Action 2', priority: 'medium' },
          destination: {
            route: '/dashboard/properties/123/health-score',
            params: {},
            requiredFeatures: [],
          },
        },
      ];

      const result = validateAllContracts(contracts);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('aggregates errors from multiple contracts', () => {
      const contracts: CTAContract[] = [
        {
          id: 'cta-1',
          source: 'Component1',
          promise: { action: 'Action 1', priority: 'high' },
          destination: {
            route: '/non-existent-1',
            params: {},
            requiredFeatures: [],
          },
        },
        {
          id: 'cta-2',
          source: 'Component2',
          promise: { action: 'Action 2', priority: 'medium' },
          destination: {
            route: '/non-existent-2',
            params: {},
            requiredFeatures: [],
          },
        },
      ];

      const result = validateAllContracts(contracts);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('PAGE_CONTRACTS', () => {
    it('has resolution center contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/resolution-center'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('filter-urgent');
      expect(contract.features).toContain('filter-maintenance');
      expect(contract.params).toContain('propertyId');
      expect(contract.params).toContain('filter');
    });

    it('has health score contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/health-score'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('view-trends');
      expect(contract.features).toContain('maintenance-breakdown');
      expect(contract.params).toContain('view');
      expect(contract.params).toContain('focus');
    });

    it('has risk assessment contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/risk-assessment'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('focus-exposure');
      expect(contract.features).toContain('amount-validation');
      expect(contract.params).toContain('focus');
      expect(contract.params).toContain('amount');
    });

    it('has financial efficiency contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/financial-efficiency'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('focus-breakdown');
      expect(contract.features).toContain('expected-cost-validation');
      expect(contract.params).toContain('focus');
      expect(contract.params).toContain('expectedCost');
    });

    it('has home savings contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/tools/home-savings'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('expected-amount-validation');
      expect(contract.features).toContain('highlight-opportunities');
      expect(contract.params).toContain('expectedMonthly');
      expect(contract.params).toContain('expectedAnnual');
    });

    it('has coverage analysis contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/tools/coverage-analysis'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('filter-gaps');
      expect(contract.features).toContain('highlight-items');
      expect(contract.params).toContain('filter');
      expect(contract.params).toContain('expectedCount');
    });

    it('has inventory contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/inventory'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('action-add-item');
      expect(contract.features).toContain('filter-missing-age');
      expect(contract.params).toContain('action');
      expect(contract.params).toContain('filter');
    });

    it('has vault contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/properties/:id/vault'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('action-upload');
      expect(contract.features).toContain('view-missing');
      expect(contract.params).toContain('action');
      expect(contract.params).toContain('category');
    });

    it('has warranties contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/warranties'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('action-add-warranty');
      expect(contract.params).toContain('propertyId');
      expect(contract.params).toContain('action');
    });

    it('has maintenance contract', () => {
      const contract = PAGE_CONTRACTS['/dashboard/maintenance'];
      
      expect(contract).toBeDefined();
      expect(contract.features).toContain('action-schedule');
      expect(contract.params).toContain('propertyId');
      expect(contract.params).toContain('action');
    });
  });
});
