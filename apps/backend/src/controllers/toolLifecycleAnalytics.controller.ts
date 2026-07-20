import type { NextFunction, Response } from 'express';
import type { CustomRequest } from '../types';
import { recordToolLifecycleEvents } from '../services/analytics/toolLifecycle';

export async function ingestToolLifecycleEvents(
  req: CustomRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    const result = await recordToolLifecycleEvents({
      userId,
      propertyId: req.params.propertyId,
      events: req.body.events,
    });

    res.status(201).json({ success: true, data: { accepted: result.count } });
  } catch (error) {
    next(error);
  }
}
