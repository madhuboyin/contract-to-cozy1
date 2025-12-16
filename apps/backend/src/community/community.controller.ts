// apps/backend/src/community/community.controller.ts

import { Request, Response } from 'express';
import { CommunityService } from './community.service';

function normalizeCityState(req: Request) {
  const city = String(req.query.city ?? '').trim();
  const state = String(req.query.state ?? '').trim();
  const propertyId = String(req.query.propertyId ?? '').trim();

  return { city, state, propertyId };
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
  getEventsByProperty = async (req: Request, res: Response) => {
    const propertyId = req.params.propertyId;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const category = req.query.category ? String(req.query.category) : undefined;

    const events = await this.service.getCommunityEventsByProperty(propertyId, limit, category);
    return res.json({ success: true, data: { events } });
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
  getTrash = async (req: Request, res: Response) => {
    const { city, state, propertyId } = normalizeCityState(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;

    const data = await this.service.getTrashOnTheFly({ city, state, propertyId, limit });
    return res.json({ success: true, data });
  };

  // ✅ NEW: GET /api/community/trash-schedule?propertyId=...
  getTrashSchedule = async (req: Request, res: Response) => {
    const { city, state, propertyId } = normalizeCityState(req);

    try {
      const schedule = await this.service.getTrashSchedule({ city, state, propertyId });
      return res.json({ success: true, data: schedule });
    } catch (error: any) {
      console.error('Error fetching trash schedule:', error);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to fetch trash schedule',
      });
    }
  };

  // GET /api/community/alerts?city=...&state=... OR ?propertyId=...
  getAlerts = async (req: Request, res: Response) => {
    const { city, state, propertyId } = normalizeCityState(req);
    const limit = req.query.limit ? Number(req.query.limit) : 20;

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