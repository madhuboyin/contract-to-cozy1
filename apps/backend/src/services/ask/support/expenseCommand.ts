// Expenses inside Ask (register "Expenses"; FRD v1.467). Desktop's Expenses page lists, adds, edits and deletes the expenses a homeowner records for a home;
// those rows are the source of the Utilities, HOA, property-tax, known-repair and project-linked categories of Ownership Costs. Ask had none of it.
// Pure: the declared action ids, the form and its validation, and the shapes the canonical home-management service takes.
//
// These are extra actions of the existing OWNERSHIP_COST_COMMAND (no new operation or registry entry), launched from the Ownership Costs answer: a correction
// of a category's source. An expense belongs to the homeowner profile that recorded it, exactly as on Desktop, so Ask lists, edits and deletes only the
// caller's own expenses for the home (other members' expenses still count toward the totals).
import { z } from 'zod';

export const EXPENSE_ACTION_IDS = {
  ADD: 'ownership-cost-expense-add',
  EDIT: 'ownership-cost-expense-edit',
  DELETE: 'ownership-cost-expense-delete',
} as const;
export type ExpenseActionId = typeof EXPENSE_ACTION_IDS[keyof typeof EXPENSE_ACTION_IDS];
export const isExpenseActionId = (value: string | null | undefined): value is ExpenseActionId => Object.values(EXPENSE_ACTION_IDS).includes(value as ExpenseActionId);
export const EXPENSE_CAPTURE_KEY = 'OWNERSHIP_COST_EXPENSE_INPUTS';

/** The categories Desktop's page offers, in its words. */
export const EXPENSE_CATEGORIES = ['REPAIR_SERVICE', 'PROPERTY_TAX', 'HOA_FEE', 'UTILITY', 'APPLIANCE', 'MATERIALS', 'OTHER'] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  REPAIR_SERVICE: 'Repair or service', PROPERTY_TAX: 'Property tax', HOA_FEE: 'HOA fee', UTILITY: 'Utility bill', APPLIANCE: 'Appliance', MATERIALS: 'Materials or supplies', OTHER: 'Other',
};
/** The expense category that feeds an Ownership Costs category, for a correction launched from that category. */
export const EXPENSE_CATEGORY_FOR_OWNERSHIP_CATEGORY: Partial<Record<string, ExpenseCategory>> = { UTILITIES: 'UTILITY', HOA: 'HOA_FEE', PROPERTY_TAX: 'PROPERTY_TAX', KNOWN_REPAIR: 'REPAIR_SERVICE' };

const exactDate = z.union([
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  z.object({ precision: z.literal('EXACT_DATE'), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict().transform((value) => value.value),
]);
export const ExpenseFormSchema = z.object({
  description: z.string().trim().min(1).max(300),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive().max(100_000_000).transform((value) => Math.round(value * 100) / 100),
  transactionDate: exactDate,
}).strict();
export interface ExpenseForm { description: string; category: ExpenseCategory; amount: number; transactionDate: string }

/** Validates a submitted form or a stored confirmation parameter. A paid expense cannot be dated in the future, and the date must be a real day. */
export function parseExpenseAnswer(answer: unknown, now: Date = new Date()): { success: true; data: ExpenseForm } | { success: false; reason: 'INVALID' | 'FUTURE' } {
  const parsed = ExpenseFormSchema.safeParse(answer);
  if (!parsed.success) return { success: false, reason: 'INVALID' };
  const day = parsed.data.transactionDate as string;
  const date = new Date(`${day}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return { success: false, reason: 'INVALID' };
  // The buyer's local day can be a day ahead of UTC.
  if (day > new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)) return { success: false, reason: 'FUTURE' };
  return { success: true, data: { description: parsed.data.description, category: parsed.data.category, amount: parsed.data.amount, transactionDate: day } };
}

/** The datetime the canonical service stores: midday UTC of the day, so the date does not slip a day across time zones. */
export const expenseTransactionDate = (day: string): string => `${day}T12:00:00.000Z`;

export interface ExpenseChange { field: keyof ExpenseForm; label: string; before: string; after: string }
/** What an edit changes, for the review. Empty when the form matches what is recorded. */
export function expenseChanges(before: ExpenseForm, after: ExpenseForm): ExpenseChange[] {
  const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const changes: ExpenseChange[] = [];
  if (before.description !== after.description) changes.push({ field: 'description', label: 'Description', before: before.description, after: after.description });
  if (before.category !== after.category) changes.push({ field: 'category', label: 'Category', before: EXPENSE_CATEGORY_LABELS[before.category], after: EXPENSE_CATEGORY_LABELS[after.category] });
  if (before.amount !== after.amount) changes.push({ field: 'amount', label: 'Amount', before: money(before.amount), after: money(after.amount) });
  if (before.transactionDate !== after.transactionDate) changes.push({ field: 'transactionDate', label: 'Date', before: before.transactionDate, after: after.transactionDate });
  return changes;
}
