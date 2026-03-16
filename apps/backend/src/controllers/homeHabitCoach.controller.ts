// apps/backend/src/controllers/homeHabitCoach.controller.ts

import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HomeHabitCoachService } from '../services/homeHabitCoach/homeHabitCoachService';

const service = new HomeHabitCoachService();

// ── Read ─────────────────────────────────────────────────────────────────────

export async function listHabits(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.listActiveHabits(propertyId, {
      status: req.query.status as any,
      includeSnoozed: req.query.includeSnoozed === 'true' || req.query.includeSnoozed === '1',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getSpotlightHabit(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.getSpotlightHabit(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getHabitHistory(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.getHabitHistory(propertyId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getHabitDetail(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const result = await service.getHabitDetail(propertyId, habitId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Generation ────────────────────────────────────────────────────────────────

export async function generateHabits(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.generateHabits(propertyId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function completeHabit(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const userId = req.user?.userId ?? null;
    const result = await service.completeHabit(propertyId, habitId, userId, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function snoozeHabit(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const userId = req.user?.userId ?? null;
    const result = await service.snoozeHabit(propertyId, habitId, userId, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function skipHabit(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const userId = req.user?.userId ?? null;
    const result = await service.skipHabit(propertyId, habitId, userId, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function dismissHabit(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const userId = req.user?.userId ?? null;
    const result = await service.dismissHabit(propertyId, habitId, userId, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function reopenHabit(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const userId = req.user?.userId ?? null;
    const result = await service.reopenHabit(propertyId, habitId, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function recordViewed(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, habitId } = req.params;
    const userId = req.user?.userId ?? null;
    const result = await service.recordViewed(propertyId, habitId, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ── Preferences ───────────────────────────────────────────────────────────────

export async function getPreferences(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.getPreferences(propertyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updatePreferences(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId } = req.params;
    const result = await service.updatePreferences(propertyId, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
