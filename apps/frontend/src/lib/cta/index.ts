/**
 * CTA Contract System
 * 
 * A comprehensive guardrails system to ensure every CTA promise is fulfilled by its destination page.
 * 
 * @example
 * ```typescript
 * import { cta, CTAValidator } from '@/lib/cta';
 * 
 * const contract = cta('my-cta', 'MyComponent')
 *   .promises('Review items')
 *   .withCount(3, 'items')
 *   .navigatesTo('/dashboard/items')
 *   .withParam('filter', 'active')
 *   .requires('filter-active')
 *   .buildAndValidate();
 * 
 * const href = contract.destination.route + '?' + 
 *   new URLSearchParams(contract.destination.params).toString();
 * ```
 */

// Core types and contracts
export type {
  CTAPriority,
  CTAMetricType,
  CTAMetric,
  CTAPromise,
  CTADestination,
  CTAContract,
  PageContract,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from './contracts';

export {
  PAGE_CONTRACTS,
  createCTAContract,
  validateCTAContract,
  validateAllContracts,
  useCtaValidation,
} from './contracts';

// Builder API
export { cta, CTABuilder } from './builder';

// Runtime validation
export {
  CTAValidator,
  useCtaValidation as useCtaValidationHook,
  logValidationSummary,
} from './runtime-validator';

// Build-time validation
export { validateCTAs } from './build-validator';
