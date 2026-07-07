// apps/backend/src/controllers/homeReserveFund.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { homeReserveFundService } from '../services/homeReserveFund.service';
import { homeReserveFundReconciliationService } from '../services/homeReserveFundReconciliation.service';

export async function getFund(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const fund = await homeReserveFundService.getSummary(req.params.propertyId);
    res.json({ success: true, data: { fund } });
  } catch (err) {
    next(err);
  }
}

export async function updateFund(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    let fund;
    if (req.body.posture !== undefined) {
      fund = await homeReserveFundService.updatePosture(propertyId, req.body.posture);
    }
    if (req.body.isActive !== undefined) {
      fund = await homeReserveFundService.updateActiveState(propertyId, req.body.isActive);
    }
    res.json({ success: true, data: { fund } });
  } catch (err) {
    next(err);
  }
}

export async function recalculateFund(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const fund = await homeReserveFundService.recalculate(req.params.propertyId);
    res.json({ success: true, data: { fund } });
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
    const contribution = await homeReserveFundService.addContribution(req.params.propertyId, {
      type: req.body.type,
      amountCents: req.body.amountCents,
      occurredAt: req.body.occurredAt,
      note: req.body.note,
      linkedExpenseId: req.body.linkedExpenseId,
      linkedLineItemId: req.body.linkedLineItemId,
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
