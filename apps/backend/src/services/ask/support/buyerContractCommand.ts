// The buyer's contract revisions inside Ask (register P2 "Buyer Closing"; FRD v1.349). Pure: declared messages, action ids, forms and validation.
//
// A contract revision is a draft until the buyer confirms it field by field against the signed contract; confirming moves the plan's closing date and
// deadlines. Ask keeps that per-field attestation (the buyer chooses which fields they checked; the property address is always required) rather than
// offering one blanket confirmation. ContractToCozy does not review contracts; the answers say so.
import { z } from 'zod';

export const CONTRACT_ENTITY_TYPE = 'BUYER_CONTRACT_CONTINGENCY';
export const CONTRACT_MESSAGES = {
  DRAFT_START: 'Start a revision of my contract terms.',
  DRAFT_EDIT: 'Edit my contract revision draft.',
  CONTINGENCY_UPDATE: 'Update this contract contingency in my draft.',
  CONTINGENCY_ADD: 'Add a contingency to my contract revision draft.',
  CONFIRM: 'Confirm my contract revision against the signed contract.',
} as const;
export type ContractKind = keyof typeof CONTRACT_MESSAGES;
export const CONTRACT_ACTION_IDS = {
  DRAFT_START: 'buyer-contract-draft-start', DRAFT_EDIT: 'buyer-contract-draft-edit', CONTINGENCY_UPDATE: 'buyer-contract-contingency-update', CONTINGENCY_ADD: 'buyer-contract-contingency-add', CONFIRM: 'buyer-contract-confirm',
} as const;
export type ContractFormKind = Exclude<ContractKind, 'DRAFT_START'>;
export const CONTRACT_CAPTURE_KEYS: Record<ContractFormKind, string> = {
  DRAFT_EDIT: 'BUYER_CONTRACT_DRAFT_EDIT', CONTINGENCY_UPDATE: 'BUYER_CONTRACT_CONTINGENCY_UPDATE', CONTINGENCY_ADD: 'BUYER_CONTRACT_CONTINGENCY_ADD', CONFIRM: 'BUYER_CONTRACT_CONFIRM',
};
export const contractKindFromMessage = (message: string): ContractKind | null =>
  ((Object.entries(CONTRACT_MESSAGES) as Array<[ContractKind, string]>).find(([, value]) => value === message)?.[0]) ?? null;
export const contractFormKindFromCaptureKey = (key: string): ContractFormKind | null =>
  ((Object.entries(CONTRACT_CAPTURE_KEYS) as Array<[ContractFormKind, string]>).find(([, value]) => value === key)?.[0]) ?? null;

export const CONTRACT_FIELD_LABELS: Record<string, string> = {
  PROPERTY_ADDRESS: 'Property address', BUYER_NAMES: 'Buyer names', SELLER_NAMES: 'Seller names', ACCEPTANCE_DATE: 'Acceptance date', TARGET_CLOSING_DATE: 'Target closing date',
  POSSESSION_DATE: 'Possession date', POSSESSION_TERMS: 'Possession terms', EARNEST_MONEY_AMOUNT: 'Earnest money amount', EARNEST_MONEY_RECIPIENT: 'Earnest money recipient',
  EARNEST_MONEY_METHOD: 'Earnest money method', SELLER_CREDITS: 'Seller credits', INCLUDED_ITEMS: 'Included items', EXCLUDED_ITEMS: 'Excluded items', AGREED_REPAIRS: 'Agreed repairs',
  SPECIAL_CONDITIONS: 'Special conditions',
};
/** The revision field each confirmable key reads (mirrors the service's own map). */
export const CONTRACT_FIELD_VALUES: Record<string, string> = {
  PROPERTY_ADDRESS: 'propertyAddress', BUYER_NAMES: 'buyerNames', SELLER_NAMES: 'sellerNames', ACCEPTANCE_DATE: 'acceptedAt', TARGET_CLOSING_DATE: 'targetClosingDate',
  POSSESSION_DATE: 'possessionAt', POSSESSION_TERMS: 'possessionTerms', EARNEST_MONEY_AMOUNT: 'earnestMoneyAmountCents', EARNEST_MONEY_RECIPIENT: 'earnestMoneyRecipient',
  EARNEST_MONEY_METHOD: 'earnestMoneyMethod', SELLER_CREDITS: 'sellerCreditsCents', INCLUDED_ITEMS: 'includedItems', EXCLUDED_ITEMS: 'excludedItems', AGREED_REPAIRS: 'agreedRepairs',
  SPECIAL_CONDITIONS: 'specialConditions',
};
/** The contingencies the page's editor offers, with its own labels. The contract records only the ones its draft holds. */
export const CONTRACT_CONTINGENCY_TYPES: Record<string, string> = {
  EARNEST_MONEY: 'Deposit due', INSPECTION: 'Last day for inspection decisions', ATTORNEY_REVIEW: 'Attorney review ends', FINANCING: 'Financing decision deadline',
  APPRAISAL: 'Appraisal decision deadline', TITLE: 'Title questions due', HOA_DOCUMENTS: 'Association document review ends', SALE_OF_HOME: 'Current-home sale deadline',
};
export const CONTINGENCY_STATUS_LABELS: Record<string, string> = { ACTIVE: 'Active', SATISFIED: 'Satisfied', WAIVED: 'Waived', EXPIRED: 'Expired' };
export const hasValue = (value: unknown) => (Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && value !== '');
/** The fields a draft actually holds, which are the ones the buyer can attest to. */
export const confirmableFields = (revision: Record<string, unknown>) => Object.keys(CONTRACT_FIELD_VALUES).filter((key) => hasValue(revision[CONTRACT_FIELD_VALUES[key]]));

const blank = (v: unknown) => (v === '' || v === undefined || v === null ? undefined : v);
const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((v) => v.value),
]);
const date = z.preprocess(blank, exactDate.optional());
const money = z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? Number(v.replace(/[$,\s]/g, '')) : v), z.number().min(0).max(1_000_000_000).optional());
/** One entry per line (or an array); blank keeps the list, a lone "none" empties it. */
const list = (maxItems: number, maxLength: number) => z.preprocess((v) => {
  if (v === '' || v === undefined || v === null) return undefined;
  const lines = Array.isArray(v) ? v.map(String) : String(v).split(/\r?\n/);
  const cleaned = lines.map((line) => line.trim()).filter(Boolean);
  if (!cleaned.length) return undefined;
  return cleaned.length === 1 && /^none$/i.test(cleaned[0]) ? [] : cleaned;
}, z.array(z.string().max(maxLength)).max(maxItems).optional());
const text = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
export const CONTRACT_SCHEMAS = {
  DRAFT_EDIT: z.object({
    acceptedDate: date, targetClosingDate: date, possessionDate: date, earnestMoney: money, earnestRecipient: text(300), sellerCredits: money, specialConditions: text(4000),
    buyerNames: list(10, 200), sellerNames: list(10, 200), includedItems: list(100, 300), excludedItems: list(100, 300), agreedRepairs: list(100, 500),
  }).strict().refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Fill in at least one thing.' }),
  CONTINGENCY_UPDATE: z.object({ status: z.enum(['ACTIVE', 'SATISFIED', 'WAIVED', 'EXPIRED']), dueDate: date }).strict(),
  CONTINGENCY_ADD: z.object({ type: z.enum(Object.keys(CONTRACT_CONTINGENCY_TYPES) as [string, ...string[]]), status: z.enum(['ACTIVE', 'SATISFIED', 'WAIVED', 'EXPIRED']).default('ACTIVE'), dueDate: date }).strict(),
  CONFIRM: z.object({ fields: z.array(z.string()).min(1).max(15) }).strict()
    .refine((v) => v.fields.every((f) => f in CONTRACT_FIELD_VALUES), { message: 'Unknown field.' })
    .refine((v) => v.fields.includes('PROPERTY_ADDRESS'), { message: 'Confirm the property address.' }),
} as const;
export const parseContractAnswer = (kind: ContractFormKind, answer: unknown) =>
  (CONTRACT_SCHEMAS[kind] as z.ZodType<Record<string, unknown>>).safeParse(answer);
