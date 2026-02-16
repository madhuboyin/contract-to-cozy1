import { Response } from 'express';
import { CustomRequest } from '../types';
import { getPropertyScoreSnapshotSummary } from '../services/propertyScoreSnapshot.service';

export async function getPropertyScoreSnapshots(req: CustomRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const propertyId = req.params.propertyId;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const weeks = req.query.weeks;
    const summary = await getPropertyScoreSnapshotSummary(propertyId, userId, weeks);
    return res.json({ success: true, data: summary });
  } catch (error: any) {
    console.error('Error fetching property score snapshots:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch property score snapshots.',
    });
  }
}
