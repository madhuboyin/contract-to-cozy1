import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { listBoard, ensureHomeItems, computeStatuses, patchItemStatus } from '../services/homeStatusBoard.service';
import { listBoardQuerySchema } from '../validators/homeStatusBoard.validators';

export async function getBoard(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    const query = listBoardQuerySchema.parse(req.query);
    const data = await listBoard(propertyId, query);

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function recompute(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const propertyId = req.params.propertyId;
    await ensureHomeItems(propertyId);
    await computeStatuses(propertyId);

    res.status(200).json({ success: true, data: { message: 'Statuses recomputed' } });
  } catch (error) {
    next(error);
  }
}

export async function patchStatus(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, homeItemId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    }

    const data = await patchItemStatus(homeItemId, propertyId, userId, req.body);

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
