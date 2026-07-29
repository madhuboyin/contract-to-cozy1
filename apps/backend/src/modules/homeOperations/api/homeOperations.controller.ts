import { Response } from 'express';
import { CustomRequest } from '../../../types';
import { listWorkItems } from '../application/listWorkItems.usecase';
import { getWorkItem as loadWorkItem } from '../application/getWorkItem.usecase';
import { ListWorkItemsQuerySchema } from './homeOperations.validators';

function homeOperationsContext(req: CustomRequest, res: Response): { propertyId: string } | null {
  const propertyId = req.params.propertyId;
  if (!propertyId) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CONTEXT', message: 'Property is required.' } });
    return null;
  }
  return { propertyId };
}

export async function listWorkItemsHandler(req: CustomRequest, res: Response) {
  const context = homeOperationsContext(req, res);
  if (!context) return;

  const query = ListWorkItemsQuerySchema.safeParse(req.query);
  if (!query.success) {
    return res.status(400).json({ success: false, error: { code: 'INVALID_QUERY', message: 'Invalid query parameters.', details: query.error.flatten() } });
  }

  const items = await listWorkItems({ propertyId: context.propertyId, ...query.data });
  return res.json({ success: true, data: { items } });
}

export async function getWorkItemHandler(req: CustomRequest, res: Response) {
  const context = homeOperationsContext(req, res);
  if (!context) return;

  const workItemId = req.params.workItemId;
  const item = await loadWorkItem(workItemId);
  if (!item || item.propertyId !== context.propertyId) {
    return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Work item was not found for this property.' } });
  }
  return res.json({ success: true, data: item });
}
