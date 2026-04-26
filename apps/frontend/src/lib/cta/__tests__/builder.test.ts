/**
 * CTA Builder Tests
 */

import { cta, CTABuilder } from '../builder';
import { CTAContract } from '../contracts';

describe('CTA Builder', () => {
  describe('basic construction', () => {
    it('creates a builder instance', () => {
      const builder = cta('test-cta', 'TestComponent');
      expect(builder).toBeInstanceOf(CTABuilder);
    });

    it('builds a minimal contract', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .build();

      expect(contract.id).toBe('test-cta');
      expect(contract.source).toBe('TestComponent');
      expect(contract.promise.action).toBe('Do something');
      expect(contract.destination.route).toBe('/test-route');
    });

    it('throws error if action is missing', () => {
      expect(() => {
        cta('test-cta', 'TestComponent')
          .navigatesTo('/test-route')
          .build();
      }).toThrow('Action promise is required');
    });

    it('throws error if route is missing', () => {
      expect(() => {
        cta('test-cta', 'TestComponent')
          .promises('Do something')
          .build();
      }).toThrow('Destination route is required');
    });
  });

  describe('promise methods', () => {
    it('adds count metric', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Review items')
        .withCount(3, 'items')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.metrics).toHaveLength(1);
      expect(contract.promise.metrics![0]).toEqual({
        type: 'count',
        value: 3,
        label: 'items',
      });
    });

    it('adds amount metric', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('View savings')
        .withAmount(240, 'monthly savings', 'USD')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.metrics).toHaveLength(1);
      expect(contract.promise.metrics![0]).toEqual({
        type: 'amount',
        value: 240,
        unit: 'USD',
        label: 'monthly savings',
      });
    });

    it('adds score metric', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('View score')
        .withScore(85, 'health score')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.metrics).toHaveLength(1);
      expect(contract.promise.metrics![0]).toEqual({
        type: 'score',
        value: 85,
        label: 'health score',
      });
    });

    it('adds delta metric', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('View change')
        .withDelta(2.3, 'weekly change')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.metrics).toHaveLength(1);
      expect(contract.promise.metrics![0]).toEqual({
        type: 'delta',
        value: 2.3,
        label: 'weekly change',
      });
    });

    it('adds multiple metrics', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('View details')
        .withCount(3, 'items')
        .withAmount(240, 'savings')
        .withScore(85, 'score')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.metrics).toHaveLength(3);
    });

    it('adds context', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .withContext('source', 'dashboard')
        .withContext('action', 'view')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.context).toEqual({
        source: 'dashboard',
        action: 'view',
      });
    });

    it('sets priority', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .withPriority('critical')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.priority).toBe('critical');
    });

    it('defaults to medium priority', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .build();

      expect(contract.promise.priority).toBe('medium');
    });
  });

  describe('destination methods', () => {
    it('adds single parameter', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .withParam('propertyId', '123')
        .build();

      expect(contract.destination.params).toEqual({
        propertyId: '123',
      });
    });

    it('adds multiple parameters individually', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .withParam('propertyId', '123')
        .withParam('filter', 'urgent')
        .withParam('count', 5)
        .build();

      expect(contract.destination.params).toEqual({
        propertyId: '123',
        filter: 'urgent',
        count: '5',
      });
    });

    it('adds multiple parameters at once', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .withParams({
          propertyId: '123',
          filter: 'urgent',
          count: 5,
          enabled: true,
        })
        .build();

      expect(contract.destination.params).toEqual({
        propertyId: '123',
        filter: 'urgent',
        count: '5',
        enabled: 'true',
      });
    });

    it('adds required features', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .requires('filter-urgent')
        .requires('sort-priority')
        .build();

      expect(contract.destination.requiredFeatures).toEqual([
        'filter-urgent',
        'sort-priority',
      ]);
    });

    it('adds optional features', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .optionally('highlight-items')
        .optionally('auto-focus')
        .build();

      expect(contract.destination.optionalFeatures).toEqual([
        'highlight-items',
        'auto-focus',
      ]);
    });
  });

  describe('buildHref', () => {
    it('builds href without parameters', () => {
      const href = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .buildHref();

      expect(href).toBe('/test-route');
    });

    it('builds href with parameters', () => {
      const href = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .withParam('propertyId', '123')
        .withParam('filter', 'urgent')
        .buildHref();

      expect(href).toBe('/test-route?propertyId=123&filter=urgent');
    });

    it('builds href with special characters in parameters', () => {
      const href = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .navigatesTo('/test-route')
        .withParam('search', 'hello world')
        .withParam('category', 'A&B')
        .buildHref();

      expect(href).toContain('search=hello+world');
      expect(href).toContain('category=A%26B');
    });
  });

  describe('complex examples', () => {
    it('builds health score maintenance CTA', () => {
      const contract = cta('health-score-maintenance', 'PropertyHealthScoreCard')
        .promises('Review maintenance items')
        .withCount(3, 'maintenance items')
        .withPriority('critical')
        .navigatesTo('/dashboard/resolution-center')
        .withParams({
          propertyId: 'abc-123',
          filter: 'maintenance',
          priority: 'high',
          expectedCount: 3,
        })
        .requires('filter-maintenance')
        .requires('expected-count-validation')
        .build();

      expect(contract.id).toBe('health-score-maintenance');
      expect(contract.source).toBe('PropertyHealthScoreCard');
      expect(contract.promise.action).toBe('Review maintenance items');
      expect(contract.promise.priority).toBe('critical');
      expect(contract.promise.metrics).toHaveLength(1);
      expect(contract.destination.route).toBe('/dashboard/resolution-center');
      expect(contract.destination.params.propertyId).toBe('abc-123');
      expect(contract.destination.requiredFeatures).toContain('filter-maintenance');
    });

    it('builds savings card CTA', () => {
      const contract = cta('home-savings-view', 'HomeSavingsCheckToolCard')
        .promises('View savings breakdown')
        .withAmount(240, 'monthly savings', 'USD')
        .withAmount(2880, 'annual savings', 'USD')
        .withPriority('critical')
        .navigatesTo('/dashboard/properties/abc-123/tools/home-savings')
        .withParams({
          expectedMonthly: 240,
          expectedAnnual: 2880,
          highlight: 'opportunities',
          action: 'view-breakdown',
        })
        .requires('expected-amount-validation')
        .requires('highlight-opportunities')
        .requires('category-breakdown')
        .build();

      expect(contract.promise.metrics).toHaveLength(2);
      expect(contract.promise.metrics![0].value).toBe(240);
      expect(contract.promise.metrics![1].value).toBe(2880);
      expect(contract.destination.requiredFeatures).toHaveLength(3);
    });

    it('builds coverage gaps CTA', () => {
      const gapCount = 5;
      const href = cta('review-coverage-gaps', 'DynamicSidebarActions')
        .promises('Review coverage gaps')
        .withCount(gapCount, 'gaps')
        .withPriority('high')
        .navigatesTo('/dashboard/properties/abc-123/tools/coverage-analysis')
        .withParams({
          filter: 'gaps',
          highlight: 'true',
          expectedCount: gapCount,
          source: 'sidebar',
        })
        .requires('filter-gaps')
        .requires('highlight-items')
        .requires('expected-count-validation')
        .buildHref();

      expect(href).toContain('filter=gaps');
      expect(href).toContain('highlight=true');
      expect(href).toContain('expectedCount=5');
      expect(href).toContain('source=sidebar');
    });

    it('builds CTA with context', () => {
      const contract = cta('do-nothing-simulator', 'DoNothingSimulatorCard')
        .promises('View simulation results')
        .withAmount(15000, 'projected cost', 'USD')
        .withContext('source', 'dashboard-card')
        .withContext('action', 'view-results')
        .withContext('horizon', '5-years')
        .withContext('status', 'completed')
        .navigatesTo('/dashboard/properties/abc-123/tools/do-nothing-simulator')
        .withParams({
          propertyId: 'abc-123',
          source: 'dashboard-card',
          action: 'view-results',
          horizon: '5-years',
          status: 'completed',
        })
        .build();

      expect(contract.promise.context).toEqual({
        source: 'dashboard-card',
        action: 'view-results',
        horizon: '5-years',
        status: 'completed',
      });
    });
  });

  describe('method chaining', () => {
    it('supports fluent interface', () => {
      const contract = cta('test-cta', 'TestComponent')
        .promises('Do something')
        .withCount(3, 'items')
        .withPriority('high')
        .withContext('source', 'test')
        .navigatesTo('/test-route')
        .withParam('id', '123')
        .withParam('filter', 'active')
        .requires('feature-1')
        .requires('feature-2')
        .optionally('feature-3')
        .build();

      expect(contract).toBeDefined();
      expect(contract.promise.metrics).toHaveLength(1);
      expect(contract.destination.params).toHaveProperty('id');
      expect(contract.destination.params).toHaveProperty('filter');
      expect(contract.destination.requiredFeatures).toHaveLength(2);
      expect(contract.destination.optionalFeatures).toHaveLength(1);
    });
  });
});
