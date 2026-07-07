// apps/backend/src/services/homeReserveFund.service.ts
//
// Fund CRUD, posture management, and the self-reported contribution ledger.
// See docs/functional/HOME_RESERVE_FUND_PLANNER_FRD.md, Sections 7 and 8.
//
// No bank-linking exists anywhere in this platform today, so balances here
// are entirely self-reported — matching the existing HomeSavingsAccount
// pattern rather than introducing a new one.

import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  HomeReserveFundContributionType,
  HomeReserveFundLineItemStatus,
  HomeReserveFundPosture,
} from '@prisma/client';
import { homeReserveFundCalculationService } from './homeReserveFundCalculation.service';

export type AddContributionInput = {
  type: HomeReserveFundContributionType;
  amountCents: number;
  occurredAt?: Date;
  note?: string | null;
  linkedExpenseId?: string | null;
  linkedLineItemId?: string | null;
};

export class HomeReserveFundService {
  // ── GET /reserve-fund ──────────────────────────────────────────────
  async getSummary(propertyId: string) {
    return homeReserveFundCalculationService.getOrCreateFund(propertyId);
  }

  // ── PATCH /reserve-fund ─────────────────────────────────────────────
  async updatePosture(propertyId: string, posture: HomeReserveFundPosture) {
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    await prisma.homeReserveFund.update({ where: { id: fund.id }, data: { posture } });
    // Posture changes which end of the cost range is used, so the target
    // figures are stale the instant it changes — recompute immediately.
    return homeReserveFundCalculationService.recalculate(propertyId, 'MANUAL');
  }

  async updateActiveState(propertyId: string, isActive: boolean) {
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    return prisma.homeReserveFund.update({ where: { id: fund.id }, data: { isActive } });
  }

  // ── POST /reserve-fund/recalculate ──────────────────────────────────
  async recalculate(propertyId: string) {
    return homeReserveFundCalculationService.recalculate(propertyId, 'MANUAL');
  }

  // ── GET /reserve-fund/line-items ────────────────────────────────────
  async listLineItems(propertyId: string, filters?: { status?: HomeReserveFundLineItemStatus }) {
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    return prisma.homeReserveFundLineItem.findMany({
      where: {
        fundId: fund.id,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: { timelineItem: true },
      orderBy: { timelineItem: { windowStart: 'asc' } },
    });
  }

  // ── POST /reserve-fund/line-items/:id/retire ────────────────────────
  async retireLineItem(propertyId: string, lineItemId: string, evidenceRef?: string | null) {
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    const lineItem = await prisma.homeReserveFundLineItem.findFirst({
      where: { id: lineItemId, fundId: fund.id },
    });
    if (!lineItem) throw new APIError('Line item not found', 404, 'LINE_ITEM_NOT_FOUND');
    if (lineItem.status !== 'ACTIVE') {
      throw new APIError('Line item is not active', 400, 'LINE_ITEM_NOT_ACTIVE');
    }

    return prisma.homeReserveFundLineItem.update({
      where: { id: lineItemId },
      data: {
        status: 'RETIRED',
        retiredAt: new Date(),
        retiredReason: 'MANUAL',
        retiredEvidenceRef: evidenceRef ?? null,
      },
    });
  }

  // ── GET /reserve-fund/contributions ─────────────────────────────────
  async listContributions(propertyId: string, params?: { limit?: number; cursor?: string }) {
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    const limit = Math.min(Math.max(params?.limit ?? 40, 1), 100);

    const rows = await prisma.homeReserveFundContribution.findMany({
      where: { fundId: fund.id },
      orderBy: { occurredAt: 'desc' },
      take: limit + 1,
      ...(params?.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : undefined };
  }

  // ── POST /reserve-fund/contributions ────────────────────────────────
  // amountCents is the signed delta to apply to the balance — positive for
  // deposits and up-corrections, negative for withdrawals and down-corrections.
  async addContribution(propertyId: string, input: AddContributionInput) {
    if (!input.amountCents) {
      throw new APIError('amountCents must not be zero', 400, 'INVALID_CONTRIBUTION_AMOUNT');
    }
    if (input.type === 'DEPOSIT' && input.amountCents < 0) {
      throw new APIError('Deposits must be positive', 400, 'INVALID_CONTRIBUTION_AMOUNT');
    }
    if (input.type === 'WITHDRAWAL' && input.amountCents > 0) {
      throw new APIError('Withdrawals must be negative', 400, 'INVALID_CONTRIBUTION_AMOUNT');
    }

    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);

    if (input.linkedLineItemId) {
      const lineItem = await prisma.homeReserveFundLineItem.findFirst({
        where: { id: input.linkedLineItemId, fundId: fund.id },
      });
      if (!lineItem) throw new APIError('Line item not found', 404, 'LINE_ITEM_NOT_FOUND');
    }
    if (input.linkedExpenseId) {
      const expense = await prisma.expense.findUnique({ where: { id: input.linkedExpenseId } });
      if (!expense || expense.propertyId !== propertyId) {
        throw new APIError('Expense not found', 404, 'EXPENSE_NOT_FOUND');
      }
    }

    const [contribution] = await prisma.$transaction([
      prisma.homeReserveFundContribution.create({
        data: {
          fundId: fund.id,
          type: input.type,
          amountCents: input.amountCents,
          occurredAt: input.occurredAt ?? new Date(),
          note: input.note ?? null,
          linkedExpenseId: input.linkedExpenseId ?? null,
          linkedLineItemId: input.linkedLineItemId ?? null,
        },
      }),
      prisma.homeReserveFund.update({
        where: { id: fund.id },
        data: { currentBalanceCents: { increment: input.amountCents } },
      }),
    ]);

    return contribution;
  }

  // ── DELETE /reserve-fund/contributions/:id ──────────────────────────
  async removeContribution(propertyId: string, contributionId: string) {
    const fund = await homeReserveFundCalculationService.getOrCreateFund(propertyId);
    const existing = await prisma.homeReserveFundContribution.findFirst({
      where: { id: contributionId, fundId: fund.id },
    });
    if (!existing) throw new APIError('Contribution not found', 404, 'CONTRIBUTION_NOT_FOUND');

    await prisma.$transaction([
      prisma.homeReserveFundContribution.delete({ where: { id: contributionId } }),
      // decrement by a negative amountCents (a withdrawal) correctly adds it
      // back; decrement by a positive amountCents (a deposit) correctly
      // subtracts it — this is a true inverse in both directions.
      prisma.homeReserveFund.update({
        where: { id: fund.id },
        data: { currentBalanceCents: { decrement: existing.amountCents } },
      }),
    ]);
  }
}

export const homeReserveFundService = new HomeReserveFundService();
