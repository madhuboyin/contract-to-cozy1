// apps/backend/src/controllers/financing.controller.ts
import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { RateConfigType } from '@prisma/client';
import * as svc from '../services/financing.service';

// ─── Financing Profile ────────────────────────────────────────────────────────

export async function getFinancingProfile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const profile = await svc.getProfile(req.params.propertyId);
    res.json({ success: true, data: { profile } });
  } catch (err) {
    next(err);
  }
}

export async function upsertFinancingProfile(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const profile = await svc.upsertProfile(req.params.propertyId, req.body);
    res.json({ success: true, data: { profile } });
  } catch (err) {
    next(err);
  }
}

// ─── Equity Position ──────────────────────────────────────────────────────────

export async function getEquityPosition(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const equity = await svc.getLatestEquity(req.params.propertyId);
    res.json({ success: true, data: { equity } });
  } catch (err) {
    next(err);
  }
}

export async function refreshEquityPosition(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const equity = await svc.refreshEquity(req.params.propertyId);
    res.status(201).json({ success: true, data: { equity } });
  } catch (err) {
    next(err);
  }
}

export async function getEquityHistory(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const history = await svc.getEquityHistory(req.params.propertyId);
    res.json({ success: true, data: { history } });
  } catch (err) {
    next(err);
  }
}

// ─── Calculator ───────────────────────────────────────────────────────────────

export async function calculateFinancing(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const results = await svc.calculate(req.params.propertyId, req.body.projectCostCents);
    res.json({ success: true, data: { results } });
  } catch (err) {
    next(err);
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export async function listFinancingScenarios(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const scenarios = await svc.listScenarios(req.params.propertyId);
    res.json({ success: true, data: { scenarios } });
  } catch (err) {
    next(err);
  }
}

export async function createFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });

    const scenario = await svc.createScenario(req.params.propertyId, userId, req.body);
    res.status(201).json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

export async function getFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const scenario = await svc.getScenario(req.params.scenarioId, req.params.propertyId);
    if (!scenario) return res.status(404).json({ success: false, error: 'Scenario not found' });
    res.json({ success: true, data: { scenario } });
  } catch (err) {
    next(err);
  }
}

export async function updateFinancingScenario(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await svc.updateScenario(req.params.scenarioId, req.params.propertyId, req.body);
    const scenario = await svc.getScenario(req.params.scenarioId, req.params.propertyId);
    res.json({ success: true, data: { scenario } });
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
