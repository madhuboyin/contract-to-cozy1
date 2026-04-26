/**
 * Runtime CTA Validation Component
 * 
 * Validates CTA contracts at runtime in development mode.
 * Logs errors and warnings to console for immediate feedback.
 */

'use client';

import { useEffect } from 'react';
import { CTAContract, validateCTAContract, ValidationResult } from './contracts';

interface CTAValidatorProps {
  contract: CTAContract;
  enabled?: boolean;
}

/**
 * Runtime validator component
 * Wrap your CTA components with this in development
 */
export function CTAValidator({ contract, enabled = process.env.NODE_ENV === 'development' }: CTAValidatorProps) {
  useEffect(() => {
    if (!enabled) return;

    const result = validateCTAContract(contract);

    if (!result.valid) {
      console.group(`🔴 CTA Validation Failed: ${contract.id}`);
      console.error('Source:', contract.source);
      console.error('Promise:', contract.promise);
      console.error('Destination:', contract.destination);
      console.error('Errors:', result.errors);
      if (result.warnings.length > 0) {
        console.warn('Warnings:', result.warnings);
      }
      console.groupEnd();
    } else if (result.warnings.length > 0) {
      console.group(`🟡 CTA Validation Warnings: ${contract.id}`);
      console.warn('Source:', contract.source);
      console.warn('Warnings:', result.warnings);
      console.groupEnd();
    } else {
      console.log(`✅ CTA Validation Passed: ${contract.id}`);
    }
  }, [contract, enabled]);

  return null;
}

/**
 * Hook for runtime validation
 */
export function useCtaValidation(contract: CTAContract, enabled = process.env.NODE_ENV === 'development') {
  useEffect(() => {
    if (!enabled) return;

    const result = validateCTAContract(contract);

    if (!result.valid) {
      console.error(`[CTA Validation] Errors in ${contract.id}:`, result.errors);
    }

    if (result.warnings.length > 0) {
      console.warn(`[CTA Validation] Warnings in ${contract.id}:`, result.warnings);
    }
  }, [contract, enabled]);

  return contract;
}

/**
 * Validation summary for debugging
 */
export function logValidationSummary(contracts: CTAContract[]) {
  const results = contracts.map(contract => ({
    contract,
    result: validateCTAContract(contract),
  }));

  const failed = results.filter(r => !r.result.valid);
  const warnings = results.filter(r => r.result.warnings.length > 0);
  const passed = results.filter(r => r.result.valid && r.result.warnings.length === 0);

  console.group('📊 CTA Validation Summary');
  console.log(`Total: ${contracts.length}`);
  console.log(`✅ Passed: ${passed.length}`);
  console.log(`🟡 Warnings: ${warnings.length}`);
  console.log(`🔴 Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.group('Failed Contracts:');
    failed.forEach(({ contract, result }) => {
      console.error(`${contract.id} (${contract.source}):`, result.errors);
    });
    console.groupEnd();
  }

  console.groupEnd();
}
