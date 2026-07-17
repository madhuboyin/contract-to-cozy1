// apps/backend/src/controllers/financing.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { RateConfigType } from '@prisma/client';
import * as svc from '../services/financing.service';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';
import { APIError } from '../middleware/error.middleware';
import {
  getCurrentFinancialContextEnvelope,
  getFinancialContextDecisions,
  getFinancialContextEnvelope,
} from '../services/financialContext/context';

function requireUserId(req: CustomRequest): string {
  const userId = req.user?.userId;
  if (!userId) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED');
  return userId;
}

// ─── Financing Profile ────────────────────────────────────────────────────────

export async function getFinancingProfile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const profile = await svc.getProfile(req.params.propertyId);
    const propertyContext = await getCurrentFinancialContextEnvelope(req.params.propertyId, userId, 'FINANCING_CENTER');

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.FINANCING,
      metadataJson: { hasProfile: !!profile, mortgageType: profile?.mortgageType ?? null },
    });

    res.json({ success: true, data: { profile, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function upsertFinancingProfile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const profile = await svc.upsertProfile(req.params.propertyId, req.body);
    const propertyContext = await getCurrentFinancialContextEnvelope(req.params.propertyId, userId, 'FINANCING_CENTER');
    res.json({ success: true, data: { profile, propertyContext } });
  } catch (err) {
    next(err);
  }
}

// ─── Equity Position ──────────────────────────────────────────────────────────

function serializeEquity(e: Awaited<ReturnType<typeof svc.getLatestEquity>>) {
  return {
    ...e,
    equityPercent: Number(e.equityPercent),
    ltvPercent: Number(e.ltvPercent),
  };
}

export async function getEquityPosition(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const currentContext = await getFinancialContextDecisions(req.params.propertyId, userId, 'FINANCING_CENTER');
    const equity = await svc.getLatestEquity(req.params.propertyId, currentContext.contextVersion);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      equity.propertyContextVersion,
    );
    res.json({ success: true, data: { equity: serializeEquity(equity), propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function refreshEquityPosition(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const currentContext = await getFinancialContextDecisions(req.params.propertyId, userId, 'FINANCING_CENTER');
    const equity = await svc.refreshEquity(req.params.propertyId, currentContext.contextVersion);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      equity.propertyContextVersion,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: req.user?.userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.FINANCING,
      metadataJson: { actionType: 'refresh_equity', equityPercent: Number(equity.equityPercent), ltvPercent: Number(equity.ltvPercent) },
    });

    res.status(201).json({ success: true, data: { equity: serializeEquity(equity), propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function getEquityHistory(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const history = await svc.getEquityHistory(req.params.propertyId);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      history[0]?.propertyContextVersion,
    );
    res.json({ success: true, data: { history: history.map(serializeEquity), propertyContext } });
  } catch (err) {
    next(err);
  }
}

// ─── Calculator ───────────────────────────────────────────────────────────────

export async function calculateFinancing(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const results = await svc.calculate(req.params.propertyId, req.body.projectCostCents);
    const propertyContext = await getCurrentFinancialContextEnvelope(req.params.propertyId, userId, 'FINANCING_CENTER');
    res.json({
      success: true,
      data: {
        results,
        propertyContext,
        calculationContext: { mode: 'SCENARIO', overrideFields: ['projectCostCents'] },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export async function listFinancingScenarios(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const scenarios = await svc.listScenarios(req.params.propertyId);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      scenarios[0]?.propertyContextVersion,
    );
    res.json({ success: true, data: { scenarios, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function createFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const currentContext = await getFinancialContextDecisions(req.params.propertyId, userId, 'FINANCING_CENTER');
    const scenario = await svc.createScenario(
      req.params.propertyId,
      userId,
      req.body,
      currentContext.contextVersion,
    );
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      scenario.propertyContextVersion,
    );

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId,
      propertyId: req.params.propertyId,
      moduleKey: AnalyticsModule.FINANCIAL,
      featureKey: AnalyticsFeature.FINANCING,
      metadataJson: { actionType: 'create_scenario', entryPoint: (scenario as any)?.entryPoint },
    });

    res.status(201).json({ success: true, data: { scenario, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function getFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    const scenario = await svc.getScenario(req.params.scenarioId, req.params.propertyId);
    if (!scenario) return res.status(404).json({ success: false, error: 'Scenario not found' });
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      scenario.propertyContextVersion,
    );
    res.json({ success: true, data: { scenario, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function updateFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = requireUserId(req);
    await svc.updateScenario(req.params.scenarioId, req.params.propertyId, req.body);
    const scenario = await svc.getScenario(req.params.scenarioId, req.params.propertyId);
    const propertyContext = await getFinancialContextEnvelope(
      req.params.propertyId,
      userId,
      'FINANCING_CENTER',
      scenario?.propertyContextVersion,
    );
    res.json({ success: true, data: { scenario, propertyContext } });
  } catch (err) {
    next(err);
  }
}

export async function archiveFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await svc.archiveScenario(req.params.scenarioId, req.params.propertyId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ─── Admin: Rate Config ───────────────────────────────────────────────────────

export async function listRateConfigs(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const rates = await svc.listRateConfigs();
    res.json({ success: true, data: { rates } });
  } catch (err) {
    next(err);
  }
}

export async function updateRateConfig(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const type = req.params.type as RateConfigType;
    if (!Object.values(RateConfigType).includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid rate config type' });
    }
    const config = await svc.updateRateConfig(type, req.body);
    res.json({ success: true, data: { config } });
  } catch (err) {
    next(err);
  }
}
