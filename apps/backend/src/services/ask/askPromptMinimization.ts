const MAX_QUESTION_CHARACTERS = 600;
const MAX_FACTS = 20;
const MAX_CONTEXT_CHARACTERS = 6_000;

const STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'can', 'could', 'does', 'for', 'from',
  'have', 'help', 'home', 'house', 'how', 'into', 'just', 'like', 'make', 'more', 'much',
  'need', 'please', 'property', 'should', 'show', 'that', 'the', 'their', 'there', 'these',
  'this', 'want', 'what', 'when', 'where', 'which', 'with', 'would', 'your',
]);

const DOMAIN_EQUIVALENTS: Record<string, string[]> = {
  appliance: ['inventory', 'equipment', 'refrigerator', 'fridge', 'dishwasher', 'washer', 'dryer'],
  hvac: ['furnace', 'heater', 'heating', 'conditioner', 'cooling', 'heatpump', 'boiler'],
  financing: ['mortgage', 'refinance', 'loan', 'interest', 'payment'],
  insurance: ['coverage', 'policy', 'premium', 'claim', 'warranty'],
  maintenance: ['task', 'service', 'repair', 'inspection', 'due', 'completed'],
  renovation: ['remodel', 'project', 'permit', 'contractor'],
  tax: ['assessment', 'appeal', 'exemption', 'assessed'],
  severity: ['urgent', 'urgency', 'serious', 'critical', 'dangerous', 'priority', 'condition'],
  deadline: ['expiry', 'expiration', 'expires', 'renewal', 'due', 'date'],
  cost: ['price', 'amount', 'expense', 'estimate', 'quote', 'payment', 'premium'],
};

function tokens(value: string): Set<string> {
  const expanded = value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const result = new Set(expanded.split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !STOP_WORDS.has(token)));
  if (result.has('heat') && result.has('pump')) result.add('heatpump');
  for (const [canonical, equivalents] of Object.entries(DOMAIN_EQUIVALENTS)) {
    if (result.has(canonical) || equivalents.some((token) => result.has(token))) {
      result.add(canonical);
      equivalents.forEach((token) => result.add(token));
    }
  }
  return result;
}

export function minimizeAskQuestion(message: string): string {
  return message
    .normalize('NFKC')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redacted]')
    .replace(/https?:\/\/\S+/gi, '[link redacted]')
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[phone redacted]')
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, '[account number redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUESTION_CHARACTERS);
}

export interface AskPromptFact {
  key: string;
  state: string;
  value?: unknown;
}

export function selectRelevantAskFacts(message: string, facts: AskPromptFact[]): AskPromptFact[] {
  const questionTokens = tokens(message);
  const ranked = facts
    .map((fact) => {
      const factTokens = tokens(fact.key);
      const overlap = [...factTokens].filter((token) => questionTokens.has(token)).length;
      return { fact, overlap };
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.fact.key.localeCompare(right.fact.key));

  const selected: AskPromptFact[] = [];
  let characters = 0;
  for (const { fact } of ranked) {
    const candidate = { key: fact.key, state: fact.state, ...(fact.state === 'KNOWN' ? { value: fact.value } : {}) };
    const size = JSON.stringify(candidate).length;
    if (selected.length >= MAX_FACTS || characters + size > MAX_CONTEXT_CHARACTERS) break;
    selected.push(candidate);
    characters += size;
  }
  return selected;
}

export const ASK_PROMPT_MINIMIZATION_LIMITS = {
  maxQuestionCharacters: MAX_QUESTION_CHARACTERS,
  maxFacts: MAX_FACTS,
  maxContextCharacters: MAX_CONTEXT_CHARACTERS,
} as const;
