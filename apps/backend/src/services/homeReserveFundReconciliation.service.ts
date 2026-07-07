// apps/backend/src/services/homeReserveFundReconciliation.service.ts
//
// Fuzzy Expense-matching for the Home Reserve / Sinking Fund Planner.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Section 6, evidence
// path 2. Evidence path 1 (a HomeEvent gets linked to the timeline item) is
// handled directly inside homeReserveFundCalculation.service.ts's
// recalculate() loop, since it's a plain field check, not fuzzy matching.
//
// NOTE — known Phase 1 simplification: suggestions are computed live on
// every call rather than persisted. There is no "dismiss and don't show
// again" state yet (no HomeReserveFundReconciliationSuggestion model exists
// in the schema); a dismissed suggestion will resurface on the next fetch
// until it's accepted or one side of the match no longer qualifies. Flagging
// this rather than silently shipping a persisted-suggestion API contract
// the schema doesn't back yet — add that model in a follow-up if the
// dismiss-state gap turns out to matter in practice.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { ExpenseCategory, HomeCapitalTimelineCategory } from '@prisma/client';

// How loose the amount/date match is allowed to be. Deliberately generous —
// FRD Section 6 calls these "suggestions," not auto-retirement, precisely
// because category/amount matching is inherently fuzzy.
const MATCH_AMOUNT_TOLERANCE = 0.25; // ±25%
const MATCH_WINDOW_MONTHS = 3; // ±3 months around windowStart/windowEnd

const CATEGORY_TO_EXPENSE_CATEGORIES: Record<HomeCapitalTimelineCategory, ExpenseCategory[]> = {
  ROOF: ['REPAIR_SERVICE'],
  HVAC: ['REPAIR_SERVICE'],
  WATER_HEATER: ['REPAIR_SERVICE'],
  PLUMBING: ['REPAIR_SERVICE'],
  ELECTRICAL: ['REPAIR_SERVICE'],
  EXTERIOR: ['REPAIR_SERVICE'],
  FOUNDATION: ['REPAIR_SERVICE'],
  APPLIANCE: ['APPLIANCE', 'REPAIR_SERVICE'],
  OTHER: ['OTHER', 'MATERIALS'],
};

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export type ReconciliationSuggestion = {
  lineItemId: string;
  timelineItemId: string;
  category: HomeCapitalTimelineCategory;
  targetCostCents: number;
  expenseId: string;
  expenseDescription: string;
  expenseAmount: number;
  expenseDate: Date;
};

export class HomeReserveFundReconciliationService {
  // ── GET /reserve-fund/reconciliation-suggestions ────────────────────
  async findMatchSuggestions(propertyId: string): Promise<ReconciliationSuggestion[]> {
    const fund = await prisma.homeReserveFund.findUnique({ where: { propertyId } });
    if (!fund) return [];

    const activeLineItems = await prisma.homeReserveFundLineItem.findMany({
      where: { fundId: fund.id, status: 'ACTIVE' },
      include: { timelineItem: true },
    });
    if (activeLineItems.length === 0) return [];

    const property = await prisma.property.findUnique({
      where: { id: propertyId },
      select: { homeownerProfileId: true },
    });
    if (!property) return [];

    const suggestions: ReconciliationSuggestion[] = [];

    for (const lineItem of activeLineItems) {
      const item = lineItem.timelineItem;
      const candidateCategories = CATEGORY_TO_EXPENSE_CATEGORIES[item.category] ?? ['OTHER'];
      const windowStart = addMonths(item.windowStart, -MATCH_WINDOW_MONTHS);
      const windowEnd = addMonths(item.windowEnd, MATCH_WINDOW_MONTHS);
      const targetDollars = lineItem.targetCostCents / 100;
      const amountMin = targetDollars * (1 - MATCH_AMOUNT_TOLERANCE);
      const amountMax = targetDollars * (1 + MATCH_AMOUNT_TOLERANCE);

      const candidates = await prisma.expense.findMany({
        where: {
          homeownerProfileId: property.homeownerProfileId,
          propertyId,
          category: { in: candidateCategories },
          transactionDate: { gte: windowStart, lte: windowEnd },
          amount: { gte: amountMin, lte: amountMax },
        },
        orderBy: { transactionDate: 'asc' },
      });

      for (const expense of candidates) {
        suggestions.push({
          lineItemId: lineItem.id,
          timelineItemId: item.id,
          category: item.category,
          targetCostCents: lineItem.targetCostCents,
          expenseId: expense.id,
          expenseDescription: expense.description,
          expenseAmount: Number(expense.amount),
          expenseDate: expense.transactionDate,
        });
      }
    }

    return suggestions;
  }

  // ── POST /reserve-fund/reconciliation-suggestions/:id/accept ────────
  // (id here is the lineItemId — accepting is scoped by which line item +
  // which expense, since suggestions aren't a persisted, individually
  // addressable row — see the Phase 1 note at the top of this file.)
  async acceptMatch(propertyId: string, lineItemId: string, expenseId: string) {
    const fund = await prisma.homeReserveFund.findUnique({ where: { propertyId } });
    if (!fund) throw new APIError('Reserve fund not found', 404, 'RESERVE_FUND_NOT_FOUND');

    const lineItem = await prisma.homeReserveFundLineItem.findFirst({
      where: { id: lineItemId, fundId: fund.id },
    });
    if (!lineItem) throw new APIError('Line item not found', 404, 'LINE_ITEM_NOT_FOUND');
    if (lineItem.status !== 'ACTIVE') {
      throw new APIError('Line item is not active', 400, 'LINE_ITEM_NOT_ACTIVE');
    }

    const expense = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!expense || expense.propertyId !== propertyId) {
      throw new APIError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
    }

    return prisma.homeReserveFundLineItem.update({
      where: { id: lineItemId },
      data: {
        status: 'RETIRED',
        retiredAt: new Date(),
        retiredReason: 'MATCHED_EXPENSE',
        retiredEvidenceRef: expenseId,
      },
    });
  }
}

export const homeReserveFundReconciliationService = new HomeReserveFundReconciliationService();
