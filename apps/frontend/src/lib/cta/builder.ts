/**
 * CTA Builder Utility
 * 
 * Type-safe builder for creating CTA contracts with validation.
 */

import {
  CTAContract,
  CTAPromise,
  CTADestination,
  CTAMetric,
  CTAPriority,
  createCTAContract,
  useCtaValidation,
} from './contracts';

export class CTABuilder {
  private id: string;
  private source: string;
  private action: string = '';
  private metrics: CTAMetric[] = [];
  private context: Record<string, any> = {};
  private priority: CTAPriority = 'medium';
  private route: string = '';
  private params: Record<string, string> = {};
  private requiredFeatures: string[] = [];
  private optionalFeatures: string[] = [];

  constructor(id: string, source: string) {
    this.id = id;
    this.source = source;
  }

  /**
   * Set the action promise
   */
  promises(action: string): this {
    this.action = action;
    return this;
  }

  /**
   * Add a metric to the promise
   */
  withMetric(metric: CTAMetric): this {
    this.metrics.push(metric);
    return this;
  }

  /**
   * Add a count metric
   */
  withCount(value: number, label: string): this {
    return this.withMetric({
      type: 'count',
      value,
      label,
    });
  }

  /**
   * Add an amount metric
   */
  withAmount(value: number, label: string, unit: string = 'USD'): this {
    return this.withMetric({
      type: 'amount',
      value,
      unit,
      label,
    });
  }

  /**
   * Add a score metric
   */
  withScore(value: number, label: string): this {
    return this.withMetric({
      type: 'score',
      value,
      label,
    });
  }

  /**
   * Add a delta metric
   */
  withDelta(value: number, label: string): this {
    return this.withMetric({
      type: 'delta',
      value,
      label,
    });
  }

  /**
   * Add context
   */
  withContext(key: string, value: any): this {
    this.context[key] = value;
    return this;
  }

  /**
   * Set priority
   */
  withPriority(priority: CTAPriority): this {
    this.priority = priority;
    return this;
  }

  /**
   * Set destination route
   */
  navigatesTo(route: string): this {
    this.route = route;
    return this;
  }

  /**
   * Add URL parameter
   */
  withParam(key: string, value: string | number | boolean): this {
    this.params[key] = String(value);
    return this;
  }

  /**
   * Add multiple URL parameters
   */
  withParams(params: Record<string, string | number | boolean>): this {
    for (const [key, value] of Object.entries(params)) {
      this.params[key] = String(value);
    }
    return this;
  }

  /**
   * Add required feature
   */
  requires(feature: string): this {
    this.requiredFeatures.push(feature);
    return this;
  }

  /**
   * Add optional feature
   */
  optionally(feature: string): this {
    this.optionalFeatures.push(feature);
    return this;
  }

  /**
   * Build the contract
   */
  build(): CTAContract {
    if (!this.action) {
      throw new Error(`CTA ${this.id}: Action promise is required`);
    }
    if (!this.route) {
      throw new Error(`CTA ${this.id}: Destination route is required`);
    }

    const promise: CTAPromise = {
      action: this.action,
      metrics: this.metrics.length > 0 ? this.metrics : undefined,
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
      priority: this.priority,
    };

    const destination: CTADestination = {
      route: this.route,
      params: this.params,
      requiredFeatures: this.requiredFeatures,
      optionalFeatures: this.optionalFeatures.length > 0 ? this.optionalFeatures : undefined,
    };

    return createCTAContract(this.id, this.source, promise, destination);
  }

  /**
   * Build and validate the contract
   */
  buildAndValidate(): CTAContract {
    const contract = this.build();
    useCtaValidation(contract);
    return contract;
  }

  /**
   * Build the href from the contract
   */
  buildHref(): string {
    const contract = this.build();
    const params = new URLSearchParams(contract.destination.params);
    const queryString = params.toString();
    return `${contract.destination.route}${queryString ? `?${queryString}` : ''}`;
  }
}

/**
 * Create a new CTA builder
 */
export function cta(id: string, source: string): CTABuilder {
  return new CTABuilder(id, source);
}

/**
 * Example usage:
 * 
 * const contract = cta('health-score-maintenance', 'PropertyHealthScoreCard')
 *   .promises('Review maintenance items')
 *   .withCount(3, 'maintenance items')
 *   .withPriority('critical')
 *   .navigatesTo('/dashboard/resolution-center')
 *   .withParam('propertyId', propertyId)
 *   .withParam('filter', 'maintenance')
 *   .withParam('priority', 'high')
 *   .requires('filter-maintenance')
 *   .requires('expected-count-validation')
 *   .buildAndValidate();
 * 
 * const href = contract.destination.route + '?' + new URLSearchParams(contract.destination.params).toString();
 */
