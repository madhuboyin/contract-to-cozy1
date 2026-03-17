// apps/backend/src/modules/gazette/editorial/GazetteEditorialValidator.ts
// Validates AI-generated editorial copy against source facts and safety rules.

import {
  EditorialValidationResult,
  RawAIStoryEditorial,
  RawAIEditionEditorial,
} from './GazetteEditorialTypes';

// Urgency words that must be grounded in a high urgency score (>= 0.6)
const URGENCY_WORDS = [
  'urgent', 'immediately', 'emergency', 'dangerous', 'severe',
  'alarming', 'crisis', 'hazard', 'critical', 'imminent',
];

// Generic/low-quality filler that indicates bad AI output
const GENERIC_FILLER_PHRASES = [
  'important update for your home',
  'important update for your property',
  'action required for your home',
  '[insert',
  '{{',
  'placeholder',
  'todo:',
  ' n/a',
];

const MAX_HEADLINE_LEN = 100;
const MAX_DEK_LEN = 200;
const MAX_SUMMARY_LEN = 600;
const MAX_TICKER_ITEM_LEN = 80;
const MAX_EDITION_HEADLINE_LEN = 120;
const MAX_EDITION_DECK_LEN = 250;

export class GazetteEditorialValidator {
  /**
   * Validate AI-generated story editorial copy.
   * Returns a validation result indicating whether the output is safe to use.
   */
  static validateStoryOutput(
    raw: RawAIStoryEditorial,
    input: { urgencyScore?: number; supportingFacts: Record<string, unknown> },
  ): EditorialValidationResult {
    const issues: string[] = [];
    let hadUnsupportedNumbers = false;
    let hadUnsupportedUrgency = false;
    let hadGenericCopy = false;

    const headline = typeof raw.headline === 'string' ? raw.headline.trim() : '';
    const dek = typeof raw.dek === 'string' ? raw.dek.trim() : '';
    const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

    // Non-empty
    if (!headline) issues.push('headline is empty');
    if (!dek) issues.push('dek is empty');
    if (!summary) issues.push('summary is empty');

    // Length gates
    if (headline.length > MAX_HEADLINE_LEN) {
      issues.push(`headline too long: ${headline.length} chars (max ${MAX_HEADLINE_LEN})`);
    }
    if (dek.length > MAX_DEK_LEN) {
      issues.push(`dek too long: ${dek.length} chars (max ${MAX_DEK_LEN})`);
    }
    if (summary.length > MAX_SUMMARY_LEN) {
      issues.push(`summary too long: ${summary.length} chars (max ${MAX_SUMMARY_LEN})`);
    }

    // Duplication — headline must not equal dek
    if (headline && dek && headline.toLowerCase() === dek.toLowerCase()) {
      issues.push('headline and dek are identical');
    }

    const allText = `${headline} ${dek} ${summary}`.toLowerCase();

    // Generic filler
    for (const phrase of GENERIC_FILLER_PHRASES) {
      if (allText.includes(phrase)) {
        issues.push(`generic/placeholder text detected: "${phrase}"`);
        hadGenericCopy = true;
        break;
      }
    }

    // Unsupported urgency
    if ((input.urgencyScore ?? 0) < 0.6) {
      for (const word of URGENCY_WORDS) {
        if (allText.includes(word)) {
          issues.push(
            `unsupported urgency word "${word}" used (urgencyScore=${(input.urgencyScore ?? 0).toFixed(2)})`,
          );
          hadUnsupportedUrgency = true;
          break;
        }
      }
    }

    // Unsupported significant numbers
    const numbersInOutput = extractSignificantNumbers(allText);
    if (numbersInOutput.length > 0) {
      const factsText = JSON.stringify(input.supportingFacts).toLowerCase();
      const factsNumbers = extractSignificantNumbers(factsText);
      const unsupported = numbersInOutput.filter((n) => !factsNumbers.includes(n));
      if (unsupported.length > 0) {
        issues.push(`potentially unsupported numbers in copy: ${unsupported.join(', ')}`);
        hadUnsupportedNumbers = true;
      }
    }

    return { valid: issues.length === 0, issues, hadUnsupportedNumbers, hadUnsupportedUrgency, hadGenericCopy };
  }

  /**
   * Validate AI-generated edition editorial copy.
   */
  static validateEditionOutput(raw: RawAIEditionEditorial): EditorialValidationResult {
    const issues: string[] = [];
    let hadGenericCopy = false;

    const summaryHeadline = typeof raw.summaryHeadline === 'string' ? raw.summaryHeadline.trim() : '';
    const summaryDeck = typeof raw.summaryDeck === 'string' ? raw.summaryDeck.trim() : '';
    const tickerItems = Array.isArray(raw.tickerItems) ? raw.tickerItems : [];

    if (!summaryHeadline) issues.push('summaryHeadline is empty');
    if (!summaryDeck) issues.push('summaryDeck is empty');
    if (tickerItems.length === 0) issues.push('tickerItems array is empty');

    if (summaryHeadline.length > MAX_EDITION_HEADLINE_LEN) {
      issues.push(`summaryHeadline too long: ${summaryHeadline.length} chars`);
    }
    if (summaryDeck.length > MAX_EDITION_DECK_LEN) {
      issues.push(`summaryDeck too long: ${summaryDeck.length} chars`);
    }

    const validTickerCount = tickerItems.filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0 && item.trim().length <= MAX_TICKER_ITEM_LEN,
    ).length;

    if (tickerItems.length > 0 && validTickerCount === 0) {
      issues.push('all ticker items failed validation (empty or too long)');
    }

    const allText = `${summaryHeadline} ${summaryDeck}`.toLowerCase();
    for (const phrase of GENERIC_FILLER_PHRASES) {
      if (allText.includes(phrase)) {
        issues.push(`generic/placeholder text in edition copy: "${phrase}"`);
        hadGenericCopy = true;
        break;
      }
    }

    return { valid: issues.length === 0, issues, hadUnsupportedNumbers: false, hadUnsupportedUrgency: false, hadGenericCopy };
  }
}

/**
 * Extract numbers > 10 from text (avoid false positives from ordinals like "1st", "2nd").
 */
function extractSignificantNumbers(text: string): number[] {
  const matches = text.match(/\b\d+(\.\d+)?\b/g) ?? [];
  return [...new Set(matches.map(Number).filter((n) => !isNaN(n) && n > 10))];
}
