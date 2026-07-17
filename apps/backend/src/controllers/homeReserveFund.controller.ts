// apps/backend/src/controllers/homeReserveFund.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { homeReserveFundService } from '../services/homeReserveFund.service';
import { homeReserveFundReconciliationService } from '../services/homeReserveFundReconciliation.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { APIError } from '../middleware/error.middleware';
import {
  assertFinancialContextApplicable,
  getFinancialContextEnvelope,
} from '../services/financialContext/context';

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  return userId;
}

export async function getFund(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = requireUserId(req);
    const fund = await homeReserveFundService.getSummary(propertyId);
    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'RESERVE_FUND',
      fund.propertyContextVersion,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.RESERVE_FUND,
      metadataJson: { posture: fund.posture },
    });

    res.json({ success: true, data: { fund, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function updateFund(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = requireUserId(req);
    const currentContext = await assertFinancialContextApplicable(
      propertyId,
      userId,
      'RESERVE_FUND',
      'reservePlanning',
    );
    let fund;
    if (req.body.posture !== undefined) {
      fund = await homeReserveFundService.updatePosture(
        propertyId,
        req.body.posture,
        currentContext.contextVersion,
        userId,
      );
    }
    if (req.body.isActive !== undefined) {
      fund = await homeReserveFundService.updateActiveState(propertyId, req.body.isActive, userId);
    }
    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'RESERVE_FUND',
      fund?.propertyContextVersion ?? null,
    );
    res.json({ success: true, data: { fund, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function recalculateFund(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const userId = requireUserId(req);
    const currentContext = await assertFinancialContextApplicable(
      propertyId,
      userId,
      'RESERVE_FUND',
      'reservePlanning',
    );
    const fund = await homeReserveFundService.recalculate(
      propertyId,
      currentContext.contextVersion,
      userId,
    );
    const propertyContext = await getFinancialContextEnvelope(
      propertyId,
      userId,
      'RESERVE_FUND',
      fund.propertyContextVersion,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.RESERVE_FUND,
      metadataJson: { actionType: 'recalculate' },
    });

    res.json({ success: true, data: { fund, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function listLineItems(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const lineItems = await homeReserveFundService.listLineItems(req.params.propertyId, {
      status: req.query.status as any,
    });
    res.json({ success: true, data: { lineItems } });
  } catch (err) {
    next(err);
  }
}

export async function retireLineItem(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const lineItem = await homeReserveFundService.retireLineItem(
      req.params.propertyId,
      req.params.lineItemId,
      req.body?.evidenceRef ?? null
    );
    res.json({ success: true, data: { lineItem } });
  } catch (err) {
    next(err);
  }
}

export async function listContributions(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const result = await homeReserveFundService.listContributions(req.params.propertyId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function addContribution(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const contribution = await homeReserveFundService.addContribution(propertyId, {
      type: req.body.type,
      amountCents: req.body.amountCents,
      occurredAt: req.body.occurredAt,
      note: req.body.note,
      linkedExpenseId: req.body.linkedExpenseId,
      linkedLineItemId: req.body.linkedLineItemId,
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.RESERVE_FUND,
      metadataJson: { actionType: 'log_contribution', contributionType: req.body.type },
    });

    res.status(201).json({ success: true, data: { contribution } });
  } catch (err) {
    next(err);
  }
}

export async function removeContribution(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await homeReserveFundService.removeContribution(req.params.propertyId, req.params.contributionId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function listReconciliationSuggestions(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const suggestions = await homeReserveFundReconciliationService.findMatchSuggestions(
      req.params.propertyId
    );
    res.json({ success: true, data: { suggestions } });
  } catch (err) {
    next(err);
  }
}

export async function acceptReconciliationMatch(
  req: CustomRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const lineItem = await homeReserveFundReconciliationService.acceptMatch(
      req.params.propertyId,
      req.body.lineItemId,
      req.body.expenseId
    );
    res.json({ success: true, data: { lineItem } });
  } catch (err) {
    next(err);
  }
}
