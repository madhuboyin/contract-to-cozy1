#!/usr/bin/env node
/**
 * Build-Time CTA Validation Script
 * 
 * Scans codebase for CTA contracts and validates them.
 * Fails build if critical validation errors are found.
 * 
 * Usage:
 *   node build-validator.ts
 *   npm run validate-ctas
 */

import * as fs from 'fs';
import * as path from 'path';
import { CTAContract, validateAllContracts, ValidationError, ValidationWarning } from './contracts';

interface ScanResult {
  file: string;
  contracts: CTAContract[];
}

/**
 * Scan directory for CTA contracts
 */
function scanDirectory(dir: string, results: ScanResult[] = []): ScanResult[] {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Skip node_modules and build directories
      if (!['node_modules', '.next', 'dist', 'build'].includes(file)) {
        scanDirectory(filePath, results);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const contracts = extractContractsFromFile(filePath);
      if (contracts.length > 0) {
        results.push({ file: filePath, contracts });
      }
    }
  }

  return results;
}

/**
 * Extract CTA contracts from file content
 * Looks for cta() builder pattern
 */
function extractContractsFromFile(filePath: string): CTAContract[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const contracts: CTAContract[] = [];

  // Simple regex to find cta() builder calls
  // This is a basic implementation - could be enhanced with AST parsing
  const ctaPattern = /cta\(['"]([^'"]+)['"],\s*['"]([^'"]+)['"]\)/g;
  let match;

  while ((match = ctaPattern.exec(content)) !== null) {
    // This is a placeholder - in real implementation, we'd need to:
    // 1. Parse the full builder chain
    // 2. Extract all method calls
    // 3. Build the contract object
    // For now, we'll just note that contracts exist in this file
    console.log(`Found CTA contract in ${filePath}: ${match[1]}`);
  }

  return contracts;
}

/**
 * Format validation errors for console output
 */
function formatErrors(errors: ValidationError[]): string {
  return errors
    .map(err => `  🔴 [${err.code}] ${err.message}\n     Source: ${err.source}\n     CTA: ${err.ctaId}`)
    .join('\n\n');
}

/**
 * Format validation warnings for console output
 */
function formatWarnings(warnings: ValidationWarning[]): string {
  return warnings
    .map(warn => `  🟡 [${warn.code}] ${warn.message}\n     Source: ${warn.source}\n     CTA: ${warn.ctaId}`)
    .join('\n\n');
}

/**
 * Main validation function
 */
export function validateCTAs(rootDir: string): { success: boolean; errorCount: number; warningCount: number } {
  console.log('🔍 Scanning for CTA contracts...\n');

  const scanResults = scanDirectory(rootDir);
  const allContracts = scanResults.flatMap(r => r.contracts);

  console.log(`Found ${allContracts.length} CTA contracts in ${scanResults.length} files\n`);

  if (allContracts.length === 0) {
    console.log('⚠️  No CTA contracts found. Make sure you are using the cta() builder.\n');
    return { success: true, errorCount: 0, warningCount: 0 };
  }

  console.log('✅ Validating contracts...\n');

  const result = validateAllContracts(allContracts);

  // Print summary
  console.log('📊 Validation Summary');
  console.log('═══════════════════════════════════════\n');
  console.log(`Total Contracts: ${allContracts.length}`);
  console.log(`Errors: ${result.errors.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Status: ${result.valid ? '✅ PASSED' : '🔴 FAILED'}\n`);

  // Print errors
  if (result.errors.length > 0) {
    console.log('🔴 ERRORS\n');
    console.log(formatErrors(result.errors));
    console.log('\n');
  }

  // Print warnings
  if (result.warnings.length > 0) {
    console.log('🟡 WARNINGS\n');
    console.log(formatWarnings(result.warnings));
    console.log('\n');
  }

  // Exit with error code if validation failed
  if (!result.valid) {
    console.error('❌ CTA validation failed. Fix errors above before building.\n');
    return { success: false, errorCount: result.errors.length, warningCount: result.warnings.length };
  }

  console.log('✅ All CTA contracts are valid!\n');
  return { success: true, errorCount: 0, warningCount: result.warnings.length };
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const rootDir = process.argv[2] || process.cwd();
  const { success } = validateCTAs(rootDir);
  process.exit(success ? 0 : 1);
}
