// Direct-message grammar for logging a Reserve Fund ledger entry ("add $500 to my reserve fund"). Pure and dependency-free so the
// routing registry and the reserve-fund.command handler share one definition of "this message asks to log a deposit or withdrawal".
//
// It only recognizes the request and pre-fills the existing inline form; the write still goes through the governed contribution
// command (form review, confirmation, homeReserveFundService.addContribution). Questions ("should I add $500 to my reserve fund?"),
// reads ("show my reserve fund") and a balance target ("set my reserve fund to $5,000", which needs a delta) are not matched.

export type ReserveFundMessageEntryType = 'DEPOSIT' | 'WITHDRAWAL';
export interface ReserveFundContributionMessage { type: ReserveFundMessageEntryType; amountDollars: number | null }

const FUND = String.raw`(?:(?:my|our|the)\s+)?(?:home\s+)?(?:reserve|sinking)\s+fund`;
const POLITE = String.raw`(?:please\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?|i\s+(?:want|need|would\s+like|wanna)\s+to\s+|i'd\s+like\s+to\s+|let'?s\s+)?`;
const DEPOSIT_VERBS = String.raw`add|put|deposit|contribute|transfer|move|save|set\s+aside|stash|send|log|record|enter`;
const WITHDRAW_VERBS = String.raw`withdraw|take|pull|draw`;
const MONEY_WORD = String.raw`deposit|contribution|withdrawal|money|funds?|savings|cash|payment|\$\s*\d|\d[\d,]*(?:\.\d+)?\s*(?:dollars?|bucks|usd)`;

// "add $500 to my reserve fund", "withdraw $300 from the reserve fund", "transfer $200 from checking into my sinking fund"
const prepositionForm = new RegExp(String.raw`^${POLITE}(${DEPOSIT_VERBS}|${WITHDRAW_VERBS})\s+(.{0,60}?)\s+(to|into|in|toward|towards|from|out\s+of)\s+${FUND}\b`, 'i');
// "log a reserve fund withdrawal of $80", "record a $500 reserve contribution", "log this reserve fund deposit"
const nounForm = new RegExp(String.raw`^${POLITE}(?:log|record|add|enter|make)\s+(?:an?|another|this|the|my)?\s*(?:\$\s*\d[\d,]*(?:\.\d+)?\s+)?(?:(?:reserve|sinking)(?:\s+fund)?)\s+(deposit|contribution|withdrawal)\b`, 'i');
// "I put $250 in the reserve fund", "I withdrew $80 from my reserve fund"
const reportedForm = new RegExp(String.raw`^i\s+(?:just\s+)?(deposited|put|added|contributed|transferred|moved|withdrew|took|pulled)\b(.{0,60}?)\s+(to|into|in|toward|towards|from|out\s+of)\s+${FUND}\b`, 'i');

function normalize(message: string): string {
  return message.replace(/[‘’]/g, "'").trim().replace(/[.!?\s]+$/, '').replace(/\s+/g, ' ');
}

/** The single dollar amount named in the message, or null when none or more than one is named (the form is left to the person). */
export function reserveFundAmountFromText(text: string): number | null {
  const amounts = new Set<number>();
  const patterns = [
    /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand)?\b/gi,
    /\b(\d[\d,]*(?:\.\d+)?)\s*(?:dollars?|bucks|usd)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = Number(match[1].replace(/,/g, ''));
      if (!Number.isFinite(raw)) return null;
      const value = match[2] && /^(?:k|thousand)$/i.test(match[2]) ? raw * 1000 : raw;
      amounts.add(Math.round(value * 100) / 100);
    }
  }
  if (amounts.size !== 1) return null;
  const [amount] = [...amounts];
  return amount > 0 && amount <= 100_000_000 ? amount : null;
}

/** The deposit/withdrawal this message asks to log, or null when it is anything else (a question, a read, another command). */
export function parseReserveFundContributionMessage(message: string): ReserveFundContributionMessage | null {
  const text = normalize(message);
  if (!text || text.length > 240) return null;
  let type: ReserveFundMessageEntryType | null = null;

  const noun = text.match(nounForm);
  if (noun) {
    type = noun[1].toLowerCase() === 'withdrawal' ? 'WITHDRAWAL' : 'DEPOSIT';
  } else {
    const reported = text.match(reportedForm);
    const stated = reported ?? text.match(prepositionForm);
    if (stated) {
      const verb = stated[1].toLowerCase();
      const middle = stated[2];
      const preposition = stated[3].toLowerCase().replace(/\s+/g, ' ');
      // A bare "add my roof to my reserve fund" is not a ledger entry: the middle must name money.
      if (!new RegExp(String.raw`\b(?:${MONEY_WORD})`, 'i').test(`${middle} `) && !/\$\s*\d/.test(middle)) return null;
      const fromFund = preposition === 'from' || preposition === 'out of';
      const withdrawVerb = new RegExp(String.raw`^(?:${WITHDRAW_VERBS}|withdrew|took|pulled)$`, 'i').test(verb);
      type = fromFund || withdrawVerb ? 'WITHDRAWAL' : 'DEPOSIT';
    }
  }
  if (!type) return null;
  return { type, amountDollars: reserveFundAmountFromText(text) };
}
