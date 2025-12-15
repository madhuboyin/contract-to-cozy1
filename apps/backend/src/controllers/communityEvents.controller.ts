import { Request, Response } from 'express';
import { getCommunityEventsForProperty } from '../services/communityEvents.service';

export async function getPropertyCommunityEvents(req: Request, res: Response) {
  try {
    const { propertyId } = req.params;
    const limit = req.query.limit ? Number(req.query.limit) : 3;

    const events = await getCommunityEventsForProperty({ propertyId, limit });

    return res.json({
      success: true,
      data: {
        events: events.map(e => ({
          id: e.id,
          source: e.source,
          title: e.title,
          startTime: e.startTime.toISOString(),
          endTime: e.endTime ? e.endTime.toISOString() : null,
          externalUrl: e.externalUrl,
          isActive: e.isActive
        }))
      }
    });
  } catch (err: any) {
    const status = err?.statusCode ?? 500;
    return res.status(status).json({
      success: false,
      message: status === 404 ? err.message : 'Unable to fetch community events'
    });
  }
}
