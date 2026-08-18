/**
 * Plain-language definitions for closing jargon a first-time buyer is likely
 * to hit in guidance copy. Keys are matched case-insensitively as whole
 * words/phrases; longer phrases are tried first so "earnest money" wins over
 * a bare "money", etc. See GlossaryText for how this is applied to copy.
 */
export const BUYER_GLOSSARY: Record<string, string> = {
  contingency: 'A condition in the contract — like a clean inspection or approved financing — that must be met or you can typically cancel without losing your earnest money.',
  contingencies: 'Conditions in the contract — like a clean inspection or approved financing — that must be met or you can typically cancel without losing your earnest money.',
  escrow: 'A neutral third party that holds funds and documents until every condition of the sale is met, then releases them at closing.',
  'earnest money': 'A deposit you pay upfront to show you are serious about the purchase. It is usually credited toward your down payment at closing.',
  appraisal: 'An independent estimate of the home’s value, usually required by your lender to confirm the loan amount is justified.',
  underwriting: 'Your lender’s internal review of your finances and the property before giving final approval for the loan.',
  'closing disclosure': 'The final, legally required summary of your loan terms and closing costs, which you must receive at least 3 business days before closing.',
  'title search': 'A review of public records to confirm the seller can legally transfer the property and that there are no liens or ownership disputes.',
  'title commitment': 'A promise from the title company describing what it will insure once closing happens, including any issues that still need to be resolved.',
  hoa: 'Homeowners association — an organization that manages shared property and enforces community rules, usually funded by required dues.',
  disclosure: 'A required statement from the seller or lender about facts they know that could affect your decision, such as property defects or loan terms.',
  walkthrough: 'A final visit to the home, usually within a day or two of closing, to confirm its condition and that agreed-upon repairs were completed.',
  possession: 'The date and time you are legally allowed to occupy the home, which can be different from your closing date.',
  'clear to close': 'Your lender has finished reviewing your file and confirms there are no more conditions before the loan can fund.',
  binder: 'A temporary proof of insurance coverage issued before the full policy documents are ready.',
  lien: 'A legal claim against the property, often for unpaid debt, that must usually be resolved before it can be sold with clear title.',
  encumbrance: 'Any claim, lien, or restriction on the property that could affect your ownership or use of it.',
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TERM_KEYS = Object.keys(BUYER_GLOSSARY).sort((left, right) => right.length - left.length);

export const BUYER_GLOSSARY_PATTERN = new RegExp(
  `\\b(${TERM_KEYS.map(escapeRegExp).join('|')})\\b`,
  'gi',
);
