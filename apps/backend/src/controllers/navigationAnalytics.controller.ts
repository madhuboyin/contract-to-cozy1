import { Response } from 'express';
import { ProductAnalyticsEventType } from '@prisma/client';
import { ProductAnalyticsService } from '../services/analytics/service';
import { CustomRequest } from '../types';
import { logger } from '../lib/logger';

type RouteRedirectEventInput = {
  oldRoute: string;
  canonicalRoute: string;
  redirectType?: string;
  navTarget?: string;
  metadata?: Record<string, unknown>;
};

export async function trackRouteRedirectEvent(req: CustomRequest, res: Response) {
  try {
    const propertyId = req.params.propertyId;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const payload = (req.body ?? {}) as RouteRedirectEventInput;
    await ProductAnalyticsService.trackEvent({
      eventType: ProductAnalyticsEventType.TOOL_USED,
      eventName: 'ROUTE_REDIRECTED',
      userId,
      propertyId,
      moduleKey: 'dashboard',
      featureKey: 'route_redirect',
      source: 'legacy_route',
      metadataJson: {
        oldRoute: payload.oldRoute,
        canonicalRoute: payload.canonicalRoute,
        redirectType: payload.redirectType ?? 'client-resolver',
        navTarget: payload.navTarget ?? null,
        ...(payload.metadata ?? {}),
      },
    });

    return res.status(201).json({ success: true, data: { ok: true } });
  } catch (error: any) {
    logger.error({ err: error }, 'Error tracking route redirect event');
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to track route redirect event.',
    });
  }
}
