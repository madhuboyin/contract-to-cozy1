import { Response, NextFunction } from 'express';
import { CustomRequest } from '../types';
import { HouseholdService } from '../services/household.service';

const service = new HouseholdService();

// ── Members ──────────────────────────────────────────────────────────────────

export async function listMembers(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const members = await service.listMembers(req.params.propertyId);
    res.json({ success: true, data: { members } });
  } catch (err) { next(err); }
}

export async function getMyMembership(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const member = await service.getMyMembership(req.params.propertyId, req.user!.userId);
    res.json({ success: true, data: { member } });
  } catch (err) { next(err); }
}

export async function updateMember(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, memberId } = req.params;
    const member = await service.updateMember(propertyId, memberId, req.user!.userId, req.body);
    res.json({ success: true, data: { member } });
  } catch (err) { next(err); }
}

export async function removeMember(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, memberId } = req.params;
    await service.removeMember(propertyId, memberId, req.user!.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

// ── Invites ──────────────────────────────────────────────────────────────────

export async function sendInvite(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const invite = await service.sendInvite(req.params.propertyId, req.user!.userId, req.body);
    res.status(201).json({ success: true, data: { invite } });
  } catch (err) { next(err); }
}

export async function listInvites(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const invites = await service.listInvites(req.params.propertyId);
    res.json({ success: true, data: { invites } });
  } catch (err) { next(err); }
}

export async function revokeInvite(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, inviteId } = req.params;
    await service.revokeInvite(propertyId, inviteId, req.user!.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function previewInvite(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const preview = await service.previewInvite(req.params.token);
    res.json({ success: true, data: { preview } });
  } catch (err) { next(err); }
}

export async function acceptInvite(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const result = await service.acceptInvite(req.params.token, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Activity feed ─────────────────────────────────────────────────────────────

export async function getActivityFeed(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const result = await service.getActivityFeed(req.params.propertyId, {
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor: req.query.cursor ? String(req.query.cursor) : undefined,
      activityTypes: req.query.activityTypes as any,
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

// ── Task assignment ──────────────────────────────────────────────────────────

export async function assignTask(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const { propertyId, taskId } = req.params;
    const { taskType, assigneeUserId } = req.body;
    await service.assignTask(propertyId, taskId, taskType, assigneeUserId, req.user!.userId);
    res.status(204).send();
  } catch (err) { next(err); }
}
