import { Response } from 'express';
import { CustomRequest } from '../types';
import { NeighbourhoodTrustService } from '../services/neighbourhoodTrust.service';
import { logger } from '../lib/logger';
import { analyticsEmitter, AnalyticsEvent, AnalyticsModule, AnalyticsFeature } from '../services/analytics';

const service = new NeighbourhoodTrustService();

function userId(req: CustomRequest): string | null {
  return req.user?.userId ?? null;
}

function sendErr(res: Response, err: any) {
  const status = err.statusCode || 500;
  logger.error({ err }, '[NeighbourhoodTrust] error');
  return res.status(status).json({ success: false, message: err.message || 'Unexpected error.' });
}

export async function getZipInfo(req: CustomRequest, res: Response) {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const zipInfo = await service.getHomeownerZipInfo(uid);
    if (!zipInfo) return res.status(404).json({ success: false, message: 'No property found to determine neighbourhood.' });
    const stats = await service.getStats(zipInfo.zipCode);

    analyticsEmitter.track({
      eventType: AnalyticsEvent.TOOL_USED,
      userId: uid,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.NEIGHBOURHOOD_TRUST,
      metadataJson: { zipCode: zipInfo.zipCode },
    });

    return res.json({ success: true, data: { ...zipInfo, stats } });
  } catch (err: any) { return sendErr(res, err); }
}

export async function getNeighbourhoodFeed(req: CustomRequest, res: Response) {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const zipInfo = await service.getHomeownerZipInfo(uid);
    if (!zipInfo) return res.status(404).json({ success: false, message: 'No property found.' });
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 30));
    const feed = await service.getFeed(zipInfo.zipCode, limit);
    return res.json({ success: true, data: { feed, zipCode: zipInfo.zipCode } });
  } catch (err: any) { return sendErr(res, err); }
}

export async function getNeighbourhoodProviders(req: CustomRequest, res: Response) {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const zipInfo = await service.getHomeownerZipInfo(uid);
    if (!zipInfo) return res.status(404).json({ success: false, message: 'No property found.' });
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const providers = await service.getProviders(zipInfo.zipCode, category, limit);
    return res.json({ success: true, data: { providers, zipCode: zipInfo.zipCode } });
  } catch (err: any) { return sendErr(res, err); }
}

export async function submitEndorsement(req: CustomRequest, res: Response) {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const { bookingId } = req.params;
    const { wouldHireAgain = true, highlightTags = [], anonymousToNeighbors = true } = req.body ?? {};
    const endorsement = await service.upsertEndorsement(bookingId, uid, {
      wouldHireAgain: Boolean(wouldHireAgain),
      highlightTags: Array.isArray(highlightTags) ? highlightTags.map(String) : [],
      anonymousToNeighbors: Boolean(anonymousToNeighbors),
    });

    analyticsEmitter.track({
      eventType: AnalyticsEvent.ACTION_COMPLETED,
      userId: uid,
      propertyId: (endorsement as any)?.propertyId,
      moduleKey: AnalyticsModule.COMMUNITY,
      featureKey: AnalyticsFeature.NEIGHBOURHOOD_TRUST,
      metadataJson: { actionType: 'submit_endorsement', wouldHireAgain: Boolean(wouldHireAgain) },
    });

    return res.status(201).json({ success: true, data: { endorsement } });
  } catch (err: any) { return sendErr(res, err); }
}

export async function getEndorsement(req: CustomRequest, res: Response) {
  try {
    const uid = userId(req);
    if (!uid) return res.status(401).json({ success: false, message: 'Authentication required.' });
    const { bookingId } = req.params;
    const endorsement = await service.getEndorsement(bookingId, uid);
    return res.json({ success: true, data: { endorsement } });
  } catch (err: any) { return sendErr(res, err); }
}
