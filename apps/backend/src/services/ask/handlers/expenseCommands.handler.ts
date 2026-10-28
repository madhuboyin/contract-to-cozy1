// Add, change and delete an expense (register "Expenses"; FRD v1.467). Reached only by the declared actions on the Ownership Costs answer, through the
// OWNERSHIP_COST_COMMAND capability. Every write is the home-management service's own function, the call Desktop's Expenses page makes (createExpense,
// updateExpense, deleteExpense), behind a review and a confirmation bound to the expense's last change. An expense belongs to the homeowner profile that
// recorded it: Ask touches only the caller's own expenses for this home, an expense a project created is left to that project, and a viewer changes nothing.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskCaptureRequest } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate } from '../askFormatting';
import * as HomeManagementService from '../../home-management.service';
import {
  EXPENSE_ACTION_IDS, EXPENSE_CAPTURE_KEY, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, expenseChanges, expenseTransactionDate, parseExpenseAnswer,
  type ExpenseActionId, type ExpenseCategory, type ExpenseForm,
} from '../support/expenseCommand';

const database = prisma as any;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });
const money = (value: number) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const back = { id: 'ownership-cost-show-current', label: 'Show current ownership costs', interactionType: 'START_WORKFLOW' as const, message: 'Show my current ownership costs', operationId: 'OWNERSHIP_COSTS' as const, style: 'SECONDARY' as const };
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'expense-command-unavailable', title, body, tone: 'DEFAULT', actions: [back] }], suggestions: [],
});

interface ExpenseRow { id: string; description: string; category: ExpenseCategory; amount: unknown; transactionDate: Date; projectId: string | null; updatedAt: Date }
const rowForm = (row: ExpenseRow): ExpenseForm => ({ description: row.description, category: row.category, amount: Number(row.amount), transactionDate: row.transactionDate.toISOString().slice(0, 10) });
const rowVersion = (row: ExpenseRow) => sha(`expense:${row.id}:${row.updatedAt.toISOString()}:${Number(row.amount)}:${row.category}`);

async function ownProfileId(userId: string): Promise<string | null> {
  const profile = await database.homeownerProfile.findFirst({ where: { userId }, select: { id: true } });
  return profile?.id ?? null;
}
const ownExpense = (profileId: string, propertyId: string, expenseId: string): Promise<ExpenseRow | null> =>
  database.expense.findFirst({ where: { id: expenseId, propertyId, homeownerProfileId: profileId }, select: { id: true, description: true, category: true, amount: true, transactionDate: true, projectId: true, updatedAt: true } });

function formCapture(kind: 'ADD' | 'EDIT', contextVersion: string, entered?: Partial<ExpenseForm>): AskCaptureRequest {
  const answer = Object.fromEntries(Object.entries(entered ?? {}).filter(([, value]) => value !== undefined && value !== ''));
  return {
    requirementId: 'ownership-cost-expense-inputs', captureKey: EXPENSE_CAPTURE_KEY, classification: 'WORKFLOW_INPUT', state: 'UNKNOWN', sensitivity: 'FINANCIAL',
    title: kind === 'ADD' ? 'Record an expense' : 'Change this expense', question: kind === 'ADD' ? 'What did you spend?' : 'What should change?',
    helpText: kind === 'ADD' ? 'An expense you record counts toward this home’s ownership costs. Nothing is saved until you confirm.' : 'Change only what is wrong; you will review the changes before they are saved.',
    inputSchema: { type: 'GROUP', fields: [
      { key: 'description', label: 'What it was for', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 300 } },
      { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: EXPENSE_CATEGORIES.map((value) => ({ label: EXPENSE_CATEGORY_LABELS[value], value })) } },
      { key: 'amount', label: 'Amount ($)', required: true, inputSchema: { type: 'NUMBER', min: 0.01, max: 100_000_000 } },
      { key: 'transactionDate', label: 'Date paid', required: true, inputSchema: { type: 'APPROXIMATE_DATE', allowedPrecisions: ['EXACT_DATE'], allowFuture: false } },
    ] } as unknown as AskCaptureRequest['inputSchema'],
    currentAnswer: answer, allowNotSure: false, destinationLabel: 'Used to prepare this change; nothing is saved until you confirm', confirmationText: null, expectedContextVersion: contextVersion,
  };
}

export async function expenseCommandResult(
  userId: string, propertyId: string, launch: { actionId: ExpenseActionId; entityId?: string | null; sourceExecutionId?: string | null }, supplied?: Record<string, unknown>,
): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) {
    return { status: 'BLOCKED', reasonCode: 'ASK_PERMISSION_REQUIRED', blocks: [{ type: 'SUMMARY', id: 'expense-command-permission', title: 'A contributor or owner can change expenses', body: 'Your role can view this home but not change it. Nothing has changed.', tone: 'CAUTION', actions: [back] }], suggestions: [] };
  }
  const profileId = await ownProfileId(userId);
  if (!profileId) return unavailable('EXPENSE_NO_HOMEOWNER_PROFILE', 'Expenses are kept under a homeowner profile', 'This account has no homeowner profile to record expenses under. Nothing has changed.');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const base = { sourceExecutionId: launch.sourceExecutionId ?? null, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() };
  const launchParameters = { expenseLaunch: { actionId: launch.actionId, entityId: launch.entityId ?? null, sourceExecutionId: launch.sourceExecutionId ?? null } };
  const confirmationFor = (title: string, description: string, confirmLabel: string, tone: 'DEFAULT' | 'CAUTION', fields: Array<{ label: string; value: string }>, consentText: string, id: string) => ({
    blocks: [{ type: 'SUMMARY' as const, id: 'expense-command-review', title, body: 'Nothing is saved until you confirm.', tone, actions: [] }],
    confirmation: { confirmationId: `ownership-cost-expense-${id}-1`, version: 1, title, description, fields, editableFields: [], confirmLabel, consentText, expiresAt: expiresAt.toISOString() },
  });

  if (launch.actionId === EXPENSE_ACTION_IDS.ADD) {
    const category = (EXPENSE_CATEGORIES as readonly string[]).includes(launch.entityId ?? '') ? launch.entityId as ExpenseCategory : undefined;
    const contextVersion = sha(`expense-add:${propertyId}`);
    if (!supplied) {
      return {
        status: 'NEEDS_CONTEXT', reasonCode: 'EXPENSE_ADD_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
        blocks: [{ type: 'SUMMARY', id: 'expense-add-input', title: 'Record an expense', body: 'Nothing has been saved yet. Enter what you paid, then review it.', tone: 'DEFAULT', actions: [] }],
        captureRequests: [formCapture('ADD', contextVersion, category ? { category } : undefined)], suggestions: [],
      };
    }
    const parsed = parseExpenseAnswer(supplied);
    if (!parsed.success) return unavailable(parsed.reason === 'FUTURE' ? 'EXPENSE_FUTURE_DATE' : 'EXPENSE_INPUT_INVALID', 'Check the expense', parsed.reason === 'FUTURE' ? 'An expense that has been paid cannot be dated in the future. Nothing has changed.' : 'Enter what it was for, a category, an amount above zero and the date paid. Nothing has changed.');
    const form = parsed.data;
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'EXPENSE_ADD_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { ownershipCostExpense: { actionId: launch.actionId, input: form }, ownershipCostExpenseContextVersion: contextVersion, ...launchParameters, ...base },
      ...confirmationFor(`Record ${money(form.amount)} for ${form.description}?`, 'This adds the expense to this home’s records under your homeowner profile, and it counts toward the home’s ownership costs.', 'Record expense', 'DEFAULT',
        [{ label: 'For', value: form.description }, { label: 'Category', value: EXPENSE_CATEGORY_LABELS[form.category] }, { label: 'Amount', value: money(form.amount) }, { label: 'Date paid', value: humanDate(new Date(expenseTransactionDate(form.transactionDate))) ?? form.transactionDate }],
        'I authorize recording this expense for this home.', sha(`add:${propertyId}:${form.description}:${form.amount}:${form.transactionDate}`).slice(0, 12)),
      captureRequests: [formCapture('ADD', contextVersion, form)], suggestions: [],
    };
  }

  const row = launch.entityId ? await ownExpense(profileId, propertyId, launch.entityId) : null;
  if (!row) return unavailable('EXPENSE_NOT_FOUND', 'That expense is not available to change', 'Ask can change the expenses you recorded for this home. It may have been removed. Nothing has changed.');
  if (row.projectId) return unavailable('EXPENSE_FROM_PROJECT', 'That expense comes from a project', 'A project’s own cost is recorded with the project, so it is changed there. Nothing has changed.');
  const contextVersion = rowVersion(row);
  const current = rowForm(row);

  if (launch.actionId === EXPENSE_ACTION_IDS.DELETE) {
    return {
      status: 'NEEDS_CONFIRMATION', reasonCode: 'EXPENSE_DELETE_CONFIRMATION_REQUIRED', contextVersion,
      parameters: { ownershipCostExpense: { actionId: launch.actionId, entityId: row.id }, ownershipCostExpenseContextVersion: contextVersion, ...launchParameters, ...base },
      ...confirmationFor(`Delete ${money(current.amount)} for ${current.description}?`, 'This permanently removes the expense, and the home’s ownership costs no longer include it. It cannot be undone.', 'Delete expense', 'CAUTION',
        [{ label: 'For', value: current.description }, { label: 'Category', value: EXPENSE_CATEGORY_LABELS[current.category] }, { label: 'Amount', value: money(current.amount) }, { label: 'Date paid', value: current.transactionDate }],
        'I authorize permanently deleting this expense.', `delete-${row.id}`),
      suggestions: [],
    };
  }

  // EDIT
  if (!supplied) {
    return {
      status: 'NEEDS_CONTEXT', reasonCode: 'EXPENSE_EDIT_INPUT_REQUIRED', contextVersion, parameters: launchParameters,
      blocks: [{ type: 'SUMMARY', id: 'expense-edit-input', title: 'Change this expense', body: 'The form shows what is recorded. Change what is wrong, then review the changes.', tone: 'DEFAULT', actions: [] }],
      captureRequests: [formCapture('EDIT', contextVersion, current)], suggestions: [],
    };
  }
  const parsed = parseExpenseAnswer(supplied);
  if (!parsed.success) return unavailable(parsed.reason === 'FUTURE' ? 'EXPENSE_FUTURE_DATE' : 'EXPENSE_INPUT_INVALID', 'Check the expense', parsed.reason === 'FUTURE' ? 'An expense that has been paid cannot be dated in the future. Nothing has changed.' : 'Enter what it was for, a category, an amount above zero and the date paid. Nothing has changed.');
  const changes = expenseChanges(current, parsed.data);
  if (!changes.length) return unavailable('EXPENSE_EDIT_NO_CHANGE', 'Nothing to change', 'The details match what is already recorded. Nothing has changed.');
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'EXPENSE_EDIT_CONFIRMATION_REQUIRED', contextVersion,
    parameters: { ownershipCostExpense: { actionId: launch.actionId, entityId: row.id, input: parsed.data }, ownershipCostExpenseContextVersion: contextVersion, ...launchParameters, ...base },
    ...confirmationFor(`Save ${changes.length === 1 ? '1 change' : `${changes.length} changes`} to this expense?`, 'This updates the expense under your homeowner profile, and the home’s ownership costs follow it.', 'Save changes', 'DEFAULT',
      [{ label: 'Expense', value: current.description }, ...changes.map((change) => ({ label: change.label, value: `${change.before} → ${change.after}` }))], 'I authorize these changes to this expense.', `edit-${row.id}`),
    captureRequests: [formCapture('EDIT', contextVersion, parsed.data)], suggestions: [],
  };
}

export async function confirmExpenseCommand(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters, access } = ctx;
  if (access.role === HouseholdRole.VIEWER) throw stale('A contributor or owner is required to change expenses.', 'ASK_PERMISSION_REQUIRED');
  const stored = parameters.ownershipCostExpense as { actionId?: unknown; entityId?: unknown; input?: unknown } | undefined;
  const actionId = stored?.actionId as ExpenseActionId | undefined;
  if (actionId !== EXPENSE_ACTION_IDS.ADD && actionId !== EXPENSE_ACTION_IDS.EDIT && actionId !== EXPENSE_ACTION_IDS.DELETE) throw stale('The change to make is invalid.');
  const propertyId = execution.propertyId;
  const profileId = await ownProfileId(userId);
  if (!profileId) throw stale('This account has no homeowner profile to record expenses under.');
  let title: string; let description: string; let artifactId = propertyId;
  const details: Array<{ label: string; value: string }> = [];
  try {
    if (actionId === EXPENSE_ACTION_IDS.ADD) {
      const parsed = parseExpenseAnswer(stored?.input);
      if (!parsed.success) throw stale('The expense to record is invalid.');
      const created = await HomeManagementService.createExpense(profileId, { propertyId, description: parsed.data.description, category: parsed.data.category, amount: parsed.data.amount, transactionDate: expenseTransactionDate(parsed.data.transactionDate) } as never);
      artifactId = created.id; title = 'Expense recorded'; description = 'It counts toward this home’s ownership costs.';
      details.push({ label: 'For', value: parsed.data.description }, { label: 'Amount', value: money(parsed.data.amount) });
    } else {
      const expenseId = typeof stored?.entityId === 'string' ? stored.entityId : null;
      const row = expenseId ? await ownExpense(profileId, propertyId, expenseId) : null;
      if (!row || !expenseId) throw stale('That expense is no longer available. It may have been removed.', 'ASK_CONTEXT_VERSION_CONFLICT');
      if (row.projectId) throw stale('That expense comes from a project and is changed there.');
      if (parameters.ownershipCostExpenseContextVersion !== rowVersion(row)) throw stale('This expense changed while the confirmation was open. Review it and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
      artifactId = expenseId;
      details.push({ label: 'Expense', value: row.description });
      if (actionId === EXPENSE_ACTION_IDS.DELETE) {
        await HomeManagementService.deleteExpense(expenseId, profileId);
        title = 'Expense deleted'; description = 'It was removed, and the home’s ownership costs no longer include it.';
      } else {
        const parsed = parseExpenseAnswer(stored?.input);
        if (!parsed.success) throw stale('The changes to save are invalid.');
        await HomeManagementService.updateExpense(expenseId, profileId, { description: parsed.data.description, category: parsed.data.category, amount: parsed.data.amount, transactionDate: expenseTransactionDate(parsed.data.transactionDate) } as never);
        title = 'Expense changed'; description = 'The home’s ownership costs follow the change.';
        details.push(...expenseChanges(rowForm(row), parsed.data).map((change) => ({ label: change.label, value: `${change.before} → ${change.after}` })));
      }
    }
  } catch (error) {
    // A row that vanished between the review and the write (a Prisma "record not found") is the same answer as one that changed.
    if ((error as { code?: unknown })?.code === 'P2025') throw stale('That expense is no longer available. It may have been removed.', 'ASK_CONTEXT_VERSION_CONFLICT');
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: `OWNERSHIP_COST_EXPENSE_${actionId === EXPENSE_ACTION_IDS.ADD ? 'ADDED' : actionId === EXPENSE_ACTION_IDS.EDIT ? 'CHANGED' : 'DELETED'}`,
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `ownership-cost-expense-${artifactId}`, title, status: 'COMPLETED', description, details, actions: [back] }], suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `ownership-cost-expense-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Saved; view could not refresh', body: 'The change was saved. The answer you were viewing could not refresh automatically, so ask for it again to see it.' });
  }
  return { result, artifactType: 'EXPENSE', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
