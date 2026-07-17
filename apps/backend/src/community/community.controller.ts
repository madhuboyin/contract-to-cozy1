// apps/backend/src/community/community.controller.ts

import { Request, Response } from 'express';
import { CommunityService } from './community.service';
import { logger } from '../lib/logger';
import { CustomRequest } from '../types';
import { resolvePropertyAccess } from '../services/propertyAccess.service';
import { getPlanningContextEnvelope } from '../services/planningContext/context';

function normalizeCityState(req: Request) {
  const city = String(req.query.city ?? '').trim();
  const state = String(req.query.state ?? '').trim();
  const propertyId = String(req.query.propertyId ?? '').trim();

  return { city, state, propertyId };
}

async function canReadOptionalProperty(req: CustomRequest, propertyId: string): Promise<boolean> {
  if (!propertyId || !req.user?.userId) return !propertyId;
  return Boolean(await resolvePropertyAccess(req.user.userId, propertyId));
}

export class CommunityController {
  constructor(private service: CommunityService) {}

  // GET /api/v1/community/events?city=...&state=...&limit=...&category=...
  getEventsByCity = async (req: Request, res: Response) => {
    const city = String(req.query.city ?? '').trim();
    const state = String(req.query.state ?? '').trim();
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const category = req.query.category ? String(req.query.category) : undefined;

    if (!city || !state) {
      return res.status(400).json({ success: false, message: 'city and state are required' });
    }

    const events = await this.service.getCommunityEventsByCity({ 
      city, 
      state, 
      limit,
      category: category as any,
    });
    return res.json({ success: true, data: { events } });
  };

  // Back-compat: GET /api/v1/properties/:propertyId/community/events?limit=...&category=...
  getEventsByProperty = async (req: CustomRequest, res: Response) => {
    const propertyId = req.params.propertyId;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const category = req.query.category ? String(req.query.category) : undefined;

    const [events, context] = await Promise.all([
      this.service.getCommunityEventsByProperty(propertyId, limit, category),
      getPlanningContextEnvelope(propertyId, req.user!.userId, 'COMMUNITY_EVENTS'),
    ]);
    return res.json({ success: true, data: { events, context } });
  };

  // GET /api/v1/community/open-data?city=...&state=...
  getCityOpenData = async (req: Request, res: Response) => {
    const city = String(req.query.city ?? '').trim();
    const state = String(req.query.state ?? '').trim();

    if (!city || !state) {
      return res.status(400).json({ success: false, message: 'city and state are required' });
    }

    const data = await this.service.getCityOpenData({ city, state });
    return res.json({ success: true, data });
  };

  // GET /api/community/trash?city=...&state=... OR ?propertyId=...
  getTrash = async (req: CustomRequest, res: Response) => {
    const { city, state, propertyId } = normalizeCityState(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    if (!(await canReadOptionalProperty(req, propertyId))) {
      return res.status(404).json({ success: false, message: 'Property not found or access denied.' });
    }

    const data = await this.service.getTrashOnTheFly({ city, state, propertyId, limit });
    return res.json({ success: true, data });
  };

  // ✅ NEW: GET /api/community/trash-schedule?propertyId=...
  getTrashSchedule = async (req: CustomRequest, res: Response) => {
    const { city, state, propertyId } = normalizeCityState(req);

    try {
      if (!(await canReadOptionalProperty(req, propertyId))) {
        return res.status(404).json({ success: false, message: 'Property not found or access denied.' });
      }
      const schedule = await this.service.getTrashSchedule({ city, state, propertyId });
      return res.json({ success: true, data: schedule });
    } catch (error: any) {
      logger.error({ err: error }, 'Error fetching trash schedule');
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to fetch trash schedule',
      });
    }
  };

  // GET /api/community/alerts?city=...&state=... OR ?propertyId=...
  getAlerts = async (req: CustomRequest, res: Response) => {
    const { city, state, propertyId } = normalizeCityState(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    if (!(await canReadOptionalProperty(req, propertyId))) {
      return res.status(404).json({ success: false, message: 'Property not found or access denied.' });
    }

    const data = await this.service.getAlertsOnTheFly({ city, state, propertyId, limit });
    return res.json({ success: true, data });
  };

  // GET /api/v1/community/trash
  getTrashInfo = async (req: Request, res: Response) => {
    const city = String(req.query.city ?? '').trim();
    const state = String(req.query.state ?? '').trim();

    if (!city || !state) {
      return res.status(400).json({
        success: false,
        message: 'city and state are required',
      });
    }

    const data = await this.service.getCityTrash({ city, state });

    return res.json({
      success: true,
      data,
    });
  };

  // GET /api/v1/community/alerts
  getCityAlerts = async (req: Request, res: Response) => {
    const city = String(req.query.city ?? '').trim();
    const state = String(req.query.state ?? '').trim();

    if (!city || !state) {
      return res.status(400).json({
        success: false,
        message: 'city and state are required',
      });
    }

    const data = await this.service.getCityAlerts({ city, state });

    return res.json({
      success: true,
      data,
    });
  };
}
