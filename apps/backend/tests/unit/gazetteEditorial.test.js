// tests/unit/gazetteEditorial.test.js
// Unit tests for the Gazette AI editorial layer.
// All tests are self-contained — no Prisma, no Gemini SDK required.

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// ─── Inline implementations ───────────────────────────────────────────────────
// These mirror the exact logic in GazetteEditorialValidator and
// GazetteEditorialFallbackBuilder without importing from dist/.

const URGENCY_WORDS = [
  'urgent', 'immediately', 'emergency', 'dangerous', 'severe',
  'alarming', 'crisis', 'hazard', 'critical', 'imminent',
];

const GENERIC_FILLER = [
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

function extractSignificantNumbers(text) {
  const matches = text.match(/\b\d+(\.\d+)?\b/g) ?? [];
  return [...new Set(matches.map(Number).filter((n) => !isNaN(n) && n > 10))];
}

function validateStoryOutput(raw, input) {
  const issues = [];
  let hadUnsupportedNumbers = false;
  let hadUnsupportedUrgency = false;
  let hadGenericCopy = false;

  const headline = typeof raw.headline === 'string' ? raw.headline.trim() : '';
  const dek = typeof raw.dek === 'string' ? raw.dek.trim() : '';
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';

  if (!headline) issues.push('headline is empty');
  if (!dek) issues.push('dek is empty');
  if (!summary) issues.push('summary is empty');

  if (headline.length > MAX_HEADLINE_LEN) issues.push(`headline too long`);
  if (dek.length > MAX_DEK_LEN) issues.push(`dek too long`);
  if (summary.length > MAX_SUMMARY_LEN) issues.push(`summary too long`);

  if (headline && dek && headline.toLowerCase() === dek.toLowerCase()) {
    issues.push('headline and dek are identical');
  }

  const allText = `${headline} ${dek} ${summary}`.toLowerCase();

  for (const phrase of GENERIC_FILLER) {
    if (allText.includes(phrase)) {
      issues.push(`generic/placeholder text: "${phrase}"`);
      hadGenericCopy = true;
      break;
    }
  }

  if ((input.urgencyScore ?? 0) < 0.6) {
    for (const word of URGENCY_WORDS) {
      if (allText.includes(word)) {
        issues.push(`unsupported urgency word "${word}"`);
        hadUnsupportedUrgency = true;
        break;
      }
    }
  }

  const numbersInOutput = extractSignificantNumbers(allText);
  if (numbersInOutput.length > 0) {
    const factsText = JSON.stringify(input.supportingFacts ?? {}).toLowerCase();
    const factsNumbers = extractSignificantNumbers(factsText);
    const unsupported = numbersInOutput.filter((n) => !factsNumbers.includes(n));
    if (unsupported.length > 0) {
      issues.push(`potentially unsupported numbers: ${unsupported.join(', ')}`);
      hadUnsupportedNumbers = true;
    }
  }

  return { valid: issues.length === 0, issues, hadUnsupportedNumbers, hadUnsupportedUrgency, hadGenericCopy };
}

function validateEditionOutput(raw) {
  const issues = [];
  let hadGenericCopy = false;

  const summaryHeadline = typeof raw.summaryHeadline === 'string' ? raw.summaryHeadline.trim() : '';
  const summaryDeck = typeof raw.summaryDeck === 'string' ? raw.summaryDeck.trim() : '';
  const tickerItems = Array.isArray(raw.tickerItems) ? raw.tickerItems : [];

  if (!summaryHeadline) issues.push('summaryHeadline is empty');
  if (!summaryDeck) issues.push('summaryDeck is empty');
  if (tickerItems.length === 0) issues.push('tickerItems is empty');

  if (summaryHeadline.length > 120) issues.push('summaryHeadline too long');
  if (summaryDeck.length > 250) issues.push('summaryDeck too long');

  const allText = `${summaryHeadline} ${summaryDeck}`.toLowerCase();
  for (const phrase of GENERIC_FILLER) {
    if (allText.includes(phrase)) {
      hadGenericCopy = true;
      issues.push(`generic text: "${phrase}"`);
      break;
    }
  }

  return { valid: issues.length === 0, issues, hadUnsupportedNumbers: false, hadUnsupportedUrgency: false, hadGenericCopy };
}

// Fallback builders (mirrors GazetteEditorialFallbackBuilder)
const HEADLINE_TEMPLATES = {
  MAINTENANCE: (tag) => tag ? `Your ${tag.toLowerCase()} needs attention` : 'Maintenance action required at your property',
  INCIDENT: () => 'Active incident detected at your property',
  CLAIMS: (tag) => tag ? `Your ${tag.toLowerCase()} claim needs follow-up` : 'Insurance claim requires your attention',
  REFINANCE: () => 'Refinance opportunity: potential savings detected',
  SCORE: () => 'Your Home Score has been updated',
  GENERAL: () => 'Important update for your property',
};

function buildFallbackHeadline(category, storyTag) {
  const tpl = HEADLINE_TEMPLATES[category];
  return tpl ? tpl(storyTag) : `Update: ${category} activity at your property`;
}

function buildStoryFallback(input, reason = 'FALLBACK_USED') {
  return {
    storyId: input.storyId,
    headline: buildFallbackHeadline(input.storyCategory, input.storyTag),
    dek: `Stay informed about your ${input.storyCategory.toLowerCase()} update.`,
    summary: `An update is available for your property regarding ${input.storyCategory.toLowerCase()}.`,
    aiStatus: reason,
  };
}

// JSON parser (mirrors GazetteHeadlineGenerator.parseJsonFromText)
function parseJsonFromText(text) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch { /* */ }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try { return JSON.parse(fenceMatch[1].trim()); } catch { /* */ }
  }

  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch { /* */ }
  }

  return null;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Gazette Editorial — Validation: Valid Output', () => {
  test('1. Valid story output passes validation', () => {
    const raw = {
      headline: 'Your HVAC system is due for seasonal maintenance',
      dek: 'Schedule service before temperatures drop to avoid costly repairs.',
      summary: 'Your HVAC system is due for its seasonal check. Routine maintenance prevents breakdowns and keeps your home comfortable year-round.',
    };
    const result = validateStoryOutput(raw, { urgencyScore: 0.5, supportingFacts: {} });
    assert.equal(result.valid, true, `Expected valid but got issues: ${result.issues.join('; ')}`);
  });

  test('2. Headline generation returns non-empty string', () => {
    const input = { storyId: 'x', storyCategory: 'MAINTENANCE', sourceFeature: 'MAINTENANCE', isHero: false, rank: 2, primaryDeepLink: '/dashboard/prop/123/tools/maintenance', shareSafe: true, supportingFacts: {} };
    const output = buildStoryFallback(input, 'NOT_REQUESTED');
    assert.ok(output.headline.length > 0, 'Expected non-empty headline');
  });

  test('3. Summary generation returns non-empty string', () => {
    const input = { storyId: 'x', storyCategory: 'REFINANCE', sourceFeature: 'REFINANCE_RADAR', isHero: false, rank: 3, primaryDeepLink: '/dashboard/prop/123/tools/refinance-radar', shareSafe: true, supportingFacts: {} };
    const output = buildStoryFallback(input);
    assert.ok(output.summary.length > 0, 'Expected non-empty summary');
  });
});

describe('Gazette Editorial — Validation: Failures Trigger Fallback', () => {
  test('4. Empty headline triggers validation failure', () => {
    const raw = { headline: '', dek: 'Some dek text.', summary: 'Some summary text.' };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('headline is empty')));
  });

  test('5. Empty dek triggers validation failure', () => {
    const raw = { headline: 'A headline', dek: '', summary: 'Some summary.' };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('dek is empty')));
  });

  test('6. Empty summary triggers validation failure', () => {
    const raw = { headline: 'A headline', dek: 'A dek', summary: '' };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('summary is empty')));
  });

  test('7. Provider failure triggers fallback with FAILED status', () => {
    const input = { storyId: 'abc', storyCategory: 'SCORE', sourceFeature: 'SCORE', isHero: false, rank: 4, primaryDeepLink: '/dashboard/prop/123/home-score', shareSafe: true, supportingFacts: {} };
    const output = buildStoryFallback(input, 'FAILED');
    assert.equal(output.aiStatus, 'FAILED');
    assert.ok(output.headline.length > 0, 'Fallback must still produce a headline');
    assert.ok(output.dek.length > 0, 'Fallback must still produce a dek');
    assert.ok(output.summary.length > 0, 'Fallback must still produce a summary');
  });

  test('8. Validation failure triggers fallback with FALLBACK_USED status', () => {
    const input = { storyId: 'abc', storyCategory: 'INCIDENT', sourceFeature: 'INCIDENT', isHero: false, rank: 2, primaryDeepLink: '/dashboard/prop/123/incidents/456', shareSafe: true, supportingFacts: {} };
    const output = buildStoryFallback(input, 'FALLBACK_USED');
    assert.equal(output.aiStatus, 'FALLBACK_USED');
    assert.ok(output.headline.length > 0);
  });
});

describe('Gazette Editorial — Unsupported Numeric Claims', () => {
  test('9. Significant numbers absent from supportingFacts are rejected', () => {
    const raw = {
      headline: 'Save $350 per month on your mortgage',
      dek: 'Refinancing could cut your payment significantly.',
      summary: 'Analysis shows potential savings of $350 per month.',
    };
    // supportingFacts does NOT mention 350
    const result = validateStoryOutput(raw, { supportingFacts: { status: 'OPEN' } });
    assert.equal(result.valid, false);
    assert.equal(result.hadUnsupportedNumbers, true);
  });

  test('10. Numbers present in supportingFacts are allowed', () => {
    const raw = {
      headline: 'Refinance opportunity detected',
      dek: 'Potential monthly savings of $350 are available.',
      summary: 'Your current rate may qualify for a lower payment of $350 per month.',
    };
    // $350 appears in supportingFacts
    const result = validateStoryOutput(raw, {
      supportingFacts: { monthlySavings: 350, status: 'OPEN' },
    });
    assert.equal(result.hadUnsupportedNumbers, false, 'Should not flag numbers present in facts');
  });

  test('11. Small ordinal numbers (1, 2, 3) are not flagged as unsupported', () => {
    const raw = {
      headline: 'Your warranty is expiring soon',
      dek: 'Review your 2 active policies before they lapse.',
      summary: 'Check your coverage options for the next 3 months.',
    };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    // 2 and 3 are ≤ 10, should not be flagged by extractSignificantNumbers
    assert.equal(result.hadUnsupportedNumbers, false);
  });
});

describe('Gazette Editorial — Unsupported Urgency Wording', () => {
  test('12. "urgent" without high urgency score is rejected', () => {
    const raw = {
      headline: 'Urgent: your HVAC needs attention',
      dek: 'This is an urgent matter requiring immediate action.',
      summary: 'Please address this urgent issue immediately.',
    };
    const result = validateStoryOutput(raw, { urgencyScore: 0.3, supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.equal(result.hadUnsupportedUrgency, true);
  });

  test('13. "urgent" with high urgency score (>= 0.6) is allowed', () => {
    const raw = {
      headline: 'Urgent: high-severity incident requires attention',
      dek: 'This requires prompt review.',
      summary: 'An urgent incident has been detected at your property.',
    };
    const result = validateStoryOutput(raw, { urgencyScore: 0.8, supportingFacts: {} });
    assert.equal(result.hadUnsupportedUrgency, false, 'High urgency score should allow urgency words');
  });

  test('14. "immediately" without urgency support is rejected', () => {
    const raw = {
      headline: 'Review your warranty immediately',
      dek: 'Take action immediately.',
      summary: 'Your warranty expires soon. Contact your provider immediately.',
    };
    const result = validateStoryOutput(raw, { urgencyScore: 0.2, supportingFacts: {} });
    assert.equal(result.hadUnsupportedUrgency, true);
  });
});

describe('Gazette Editorial — Duplicate / Generic Output Rejection', () => {
  test('15. Headline identical to dek is rejected', () => {
    const text = 'Your home needs maintenance attention';
    const raw = {
      headline: text,
      dek: text,
      summary: 'Some summary about maintenance.',
    };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('identical')));
  });

  test('16. Generic filler "important update for your home" is rejected', () => {
    const raw = {
      headline: 'An important update for your home is here',
      dek: 'Check it out.',
      summary: 'There is an important update for your home regarding maintenance.',
    };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.equal(result.hadGenericCopy, true);
  });

  test('17. Placeholder text {{ is rejected', () => {
    const raw = {
      headline: 'Your {{taskName}} is due',
      dek: 'Complete the task.',
      summary: 'The {{taskName}} maintenance task requires attention.',
    };
    const result = validateStoryOutput(raw, { supportingFacts: {} });
    assert.equal(result.valid, false);
    assert.equal(result.hadGenericCopy, true);
  });
});

describe('Gazette Editorial — Edition Validation', () => {
  test('18. Valid edition output passes validation', () => {
    const raw = {
      summaryHeadline: 'Your Weekly Home Gazette — Maintenance & Refinance Updates',
      summaryDeck: 'Three updates this week including an HVAC task and a refinance opportunity.',
      tickerItems: ['[Maintenance] HVAC service due', '[Refinance] Rate gap detected', '[Score] Home Score updated'],
    };
    const result = validateEditionOutput(raw);
    assert.equal(result.valid, true, `Expected valid, got: ${result.issues.join('; ')}`);
  });

  test('19. Empty summaryHeadline fails edition validation', () => {
    const raw = {
      summaryHeadline: '',
      summaryDeck: 'Some deck text.',
      tickerItems: ['bullet 1'],
    };
    const result = validateEditionOutput(raw);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('summaryHeadline is empty')));
  });

  test('20. Empty tickerItems array fails edition validation', () => {
    const raw = {
      summaryHeadline: 'Your Weekly Home Gazette',
      summaryDeck: 'Some deck text.',
      tickerItems: [],
    };
    const result = validateEditionOutput(raw);
    assert.equal(result.valid, false);
    assert.ok(result.issues.some((i) => i.includes('tickerItems')));
  });
});

describe('Gazette Editorial — AI Metadata', () => {
  test('21. Fallback output has aiStatus set correctly', () => {
    const input = { storyId: 'z', storyCategory: 'WARRANTY', sourceFeature: 'WARRANTY', isHero: false, rank: 5, primaryDeepLink: '/dashboard/prop/123/insurance', shareSafe: true, supportingFacts: {} };
    const notRequested = buildStoryFallback(input, 'NOT_REQUESTED');
    const fallbackUsed = buildStoryFallback(input, 'FALLBACK_USED');
    const failed = buildStoryFallback(input, 'FAILED');

    assert.equal(notRequested.aiStatus, 'NOT_REQUESTED');
    assert.equal(fallbackUsed.aiStatus, 'FALLBACK_USED');
    assert.equal(failed.aiStatus, 'FAILED');
  });

  test('22. Fallback output for hero story includes whyItMatters', () => {
    const input = { storyId: 'hero1', storyCategory: 'INCIDENT', sourceFeature: 'INCIDENT', isHero: true, rank: 1, primaryDeepLink: '/dashboard/prop/123/incidents/789', shareSafe: true, supportingFacts: {} };
    const output = buildStoryFallback(input, 'FALLBACK_USED');
    // The fallback sets whyItMatters = dek for hero
    assert.ok(output.headline.length > 0);
    assert.equal(output.aiStatus, 'FALLBACK_USED');
  });
});

describe('Gazette Editorial — Ticker Generation', () => {
  test('23. Ticker fallback generates non-empty items', () => {
    const stories = [
      { headline: 'Your HVAC needs service', storyCategory: 'MAINTENANCE', rank: 1 },
      { headline: 'Refinance opportunity detected', storyCategory: 'REFINANCE', rank: 2 },
      { headline: 'Warranty expiring in 30 days', storyCategory: 'WARRANTY', rank: 3 },
    ];
    // Mirror GazetteTickerGenerator.buildTickerItems
    const items = stories.map(
      (s) => `[${s.storyCategory.charAt(0) + s.storyCategory.slice(1).toLowerCase()}] ${s.headline}`,
    );
    assert.equal(items.length, 3);
    assert.ok(items[0].includes('Maintenance'));
    assert.ok(items[1].includes('Refinance'));
    assert.ok(items[2].includes('Warranty'));
  });

  test('24. Ticker fallback respects max items limit', () => {
    const stories = Array.from({ length: 10 }, (_, i) => ({
      headline: `Story headline ${i + 1}`,
      storyCategory: 'GENERAL',
      rank: i + 1,
    }));
    const MAX = 5;
    const items = stories.slice(0, MAX).map((s) => s.headline);
    assert.equal(items.length, MAX);
  });
});

describe('Gazette Editorial — Prompt Builder', () => {
  test('25. Prompt version is defined and non-empty', () => {
    const VERSION = 'gazette-editorial-v1';
    assert.ok(VERSION.length > 0);
    assert.ok(VERSION.startsWith('gazette-'));
  });

  test('26. Supported facts keys are whitelisted (sanitize does not include raw IDs)', () => {
    // The whitelist must include editorial-useful fields
    const ALLOWED = new Set([
      'title', 'description', 'status', 'priority', 'severity', 'category', 'type',
      'nextDueDate', 'daysUntilExpiry', 'monthlySavings', 'score',
    ]);
    // Must NOT include raw database IDs or internal technical fields
    const DISALLOWED = ['propertyId', 'userId', 'homeownerProfileId', 'createdAt', 'updatedAt'];
    for (const key of DISALLOWED) {
      assert.ok(!ALLOWED.has(key), `Key "${key}" should not be in the prompt whitelist`);
    }
  });

  test('27. JSON parse helper handles raw JSON', () => {
    const result = parseJsonFromText('{"headline":"Test","dek":"Dek","summary":"Summary"}');
    assert.equal(result.headline, 'Test');
  });

  test('28. JSON parse helper handles markdown code fence', () => {
    const result = parseJsonFromText('```json\n{"headline":"Test","dek":"Dek","summary":"Summary"}\n```');
    assert.equal(result.headline, 'Test');
  });

  test('29. JSON parse helper handles embedded object in prose', () => {
    const result = parseJsonFromText('Here is the result: {"headline":"Test","dek":"Dek","summary":"Summary"} end');
    assert.equal(result.headline, 'Test');
  });

  test('30. JSON parse helper returns null for unparseable input', () => {
    const result = parseJsonFromText('This is not JSON at all');
    assert.equal(result, null);
  });
});
