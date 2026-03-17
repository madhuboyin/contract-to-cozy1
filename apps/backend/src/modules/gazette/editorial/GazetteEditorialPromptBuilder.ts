// apps/backend/src/modules/gazette/editorial/GazetteEditorialPromptBuilder.ts
// Builds tightly scoped prompts for the Gazette editorial AI layer.
// All prompts use structured inputs only — no raw upstream payloads.

import { StoryEditorialInput, EditionEditorialInput } from './GazetteEditorialTypes';

export const GAZETTE_EDITORIAL_PROMPT_VERSION = 'gazette-editorial-v1';

// ─── System instruction ───────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a calm, editorial AI copywriter for Home Gazette — a weekly property digest for homeowners.

Your job is to transform structured home data into short, clear, editorial copy.

RULES YOU MUST FOLLOW:
1. Use ONLY the facts provided in the input. Do NOT infer, estimate, or invent anything.
2. Do NOT add numbers, dates, dollar amounts, or percentages unless they appear in the input data.
3. Do NOT use the word "urgent" or similar escalation language unless urgencyScore is explicitly 0.7 or higher.
4. Keep copy calm, specific, and homeowner-friendly. No clickbait. No alarm.
5. Write in present tense where appropriate. Be direct and clear.
6. Headlines must be under 90 characters. Deks must be under 160 characters. Summaries must be under 500 characters.
7. Return ONLY valid JSON — no markdown, no code fences, no extra commentary or text outside the JSON.`;

// ─── Prompt builders ──────────────────────────────────────────────────────────

export class GazetteEditorialPromptBuilder {
  /**
   * Build a story-level editorial prompt (headline, dek, summary).
   * Includes whyItMatters field request for hero stories.
   */
  static buildStoryPrompt(input: StoryEditorialInput): string {
    const facts = sanitizeFacts(input.supportingFacts);
    const urgencyNote =
      (input.urgencyScore ?? 0) >= 0.7
        ? 'This story has a high urgency level — convey appropriate but calm importance.'
        : 'This is an informational update — keep tone calm and helpful.';
    const heroNote = input.isHero
      ? 'This is the HERO story — it is the most important update in this edition.'
      : '';
    const financialNote =
      input.financialImpactEstimate !== undefined && input.financialImpactEstimate > 0
        ? `Financial relevance score: ${input.financialImpactEstimate.toFixed(2)} (0=none, 1=high).`
        : '';

    const heroField = input.isHero
      ? ',\n  "whyItMatters": "one sentence on why this is the week\'s top story (max 120 chars)"'
      : '';

    return `Generate editorial copy for this home update.

STORY DATA:
- Category: ${input.storyCategory}${input.storyTag ? `\n- Tag: ${input.storyTag}` : ''}
- Source: ${input.sourceFeature}${input.headlineHint ? `\n- Headline hint (optional): ${input.headlineHint}` : ''}
- Supporting facts: ${JSON.stringify(facts)}
${input.urgencyScore !== undefined ? `- Urgency level: ${input.urgencyScore.toFixed(2)} (0=low, 1=high)` : ''}
${financialNote}
- Rank in this edition: ${input.rank}
${urgencyNote}
${heroNote}

Return this EXACT JSON structure only (no extra fields, no markdown):
{
  "headline": "concise editorial headline (max 90 chars, no period at end)",
  "dek": "one supporting sentence clarifying why this matters (max 160 chars)",
  "summary": "2-3 sentence body text grounded in the facts above (max 500 chars)"${heroField}
}`;
  }

  /**
   * Build an edition-level editorial prompt (summaryHeadline, summaryDeck, tickerItems).
   */
  static buildEditionPrompt(input: EditionEditorialInput): string {
    const storyList = input.topStories
      .slice(0, 5)
      .map((s, i) => `  ${i + 1}. [${s.storyCategory}] ${s.headline}`)
      .join('\n');

    return `Generate edition-level summary copy for this week's Home Gazette.

EDITION DATA:
- Total stories selected: ${input.selectedCount}
- Top stories this week:
${storyList}

Return this EXACT JSON structure only (no extra fields, no markdown):
{
  "summaryHeadline": "edition headline referencing the most important theme (max 80 chars)",
  "summaryDeck": "1-2 sentence edition overview reflecting the actual stories (max 200 chars)",
  "tickerItems": ["short bullet 1 (max 60 chars)", "short bullet 2 (max 60 chars)", "short bullet 3 (max 60 chars)"]
}`;
  }

  static getSystemInstruction(): string {
    return SYSTEM_INSTRUCTION;
  }

  static getPromptVersion(): string {
    return GAZETTE_EDITORIAL_PROMPT_VERSION;
  }
}

// ─── Fact sanitizer ───────────────────────────────────────────────────────────

/**
 * Strip anything not on an explicit whitelist before including in an AI prompt.
 * Only primitive (string, number, boolean) values of known safe keys are allowed.
 */
function sanitizeFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const ALLOWED_KEYS = new Set([
    'title', 'description', 'status', 'priority', 'severity', 'category', 'type',
    'nextDueDate', 'daysUntilExpiry', 'expiryDate', 'startDate',
    'monthlySavings', 'lifetimeSavings', 'breakEvenMonths', 'rateGap',
    'score', 'scoreBand', 'scoreType',
    'assetType', 'itemName', 'providerName', 'policyType', 'claimType', 'claimNumber',
    'season', 'eventType', 'riskType', 'impactType',
    'urgencyLabel', 'financialNote',
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) {
    if (ALLOWED_KEYS.has(k) && v !== null && v !== undefined) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        out[k] = v;
      }
    }
  }
  return out;
}
