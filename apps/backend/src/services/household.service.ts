import crypto from 'crypto';
import { HouseholdActivityType, HouseholdRole, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { APIError } from '../middleware/error.middleware';
import { getEmailNotificationQueue } from './JobQueue.service';

const INVITE_TTL_DAYS = 7;

export class HouseholdService {
  // ── Activity log ────────────────────────────────────────────────────────────

  async logActivity(
    propertyId: string,
    actorUserId: string,
    type: HouseholdActivityType,
    opts?: {
      targetUserId?: string;
      entityType?: string;
      entityId?: string;
      summaryText?: string;
      metaJson?: Record<string, unknown>;
    }
  ) {
    await prisma.householdActivityLog.create({
      data: {
        propertyId,
        actorUserId,
        activityType: type,
        targetUserId: opts?.targetUserId,
        entityType: opts?.entityType,
        entityId: opts?.entityId,
        summaryText: opts?.summaryText ?? type,
        metaJson: (opts?.metaJson as any) ?? undefined,
      },
    });
  }

  // ── Member guards ────────────────────────────────────────────────────────────

  private async assertOwner(propertyId: string, userId: string) {
    const member = await prisma.householdMember.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
      select: { role: true },
    });
    if (!member || member.role !== 'OWNER') {
      throw new APIError('Only an OWNER can perform this action.', 403, 'FORBIDDEN');
    }
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  async listMembers(propertyId: string) {
    return prisma.householdMember.findMany({
      where: { propertyId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, lastLoginAt: true } },
      },
      orderBy: [{ isPrimaryOwner: 'desc' }, { joinedAt: 'asc' }],
    });
  }

  async getMyMembership(propertyId: string, userId: string) {
    const member = await prisma.householdMember.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, avatar: true, lastLoginAt: true } },
      },
    });
    if (!member) throw new APIError('Not a member of this property.', 403, 'FORBIDDEN');
    return member;
  }

  async updateMember(
    propertyId: string,
    targetMemberId: string,
    actorUserId: string,
    updates: { role?: HouseholdRole; displayName?: string | null }
  ) {
    await this.assertOwner(propertyId, actorUserId);

    const target = await prisma.householdMember.findFirst({
      where: { id: targetMemberId, propertyId },
    });
    if (!target) throw new APIError('Member not found.', 404, 'NOT_FOUND');
    if (target.isPrimaryOwner && updates.role && updates.role !== 'OWNER') {
      throw new APIError('Cannot demote the primary owner.', 400, 'CANNOT_DEMOTE_PRIMARY_OWNER');
    }

    const updated = await prisma.householdMember.update({
      where: { id: targetMemberId },
      data: updates,
    });

    if (updates.role && updates.role !== target.role) {
      const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true, lastName: true } });
      const targetUser = await prisma.user.findUnique({ where: { id: target.userId }, select: { firstName: true, lastName: true } });
      await this.logActivity(propertyId, actorUserId, 'MEMBER_ROLE_CHANGED', {
        targetUserId: target.userId,
        summaryText: `${actor?.firstName} changed ${targetUser?.firstName}'s role to ${updates.role}`,
        metaJson: { previousRole: target.role, newRole: updates.role },
      });
    }

    return updated;
  }

  async removeMember(propertyId: string, targetMemberId: string, actorUserId: string) {
    await this.assertOwner(propertyId, actorUserId);

    const target = await prisma.householdMember.findFirst({
      where: { id: targetMemberId, propertyId },
    });
    if (!target) throw new APIError('Member not found.', 404, 'NOT_FOUND');
    if (target.isPrimaryOwner) {
      throw new APIError('Cannot remove the primary owner.', 400, 'CANNOT_REMOVE_PRIMARY_OWNER');
    }

    await prisma.householdMember.delete({ where: { id: targetMemberId } });

    const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true, lastName: true } });
    const removedUser = await prisma.user.findUnique({ where: { id: target.userId }, select: { firstName: true, lastName: true } });
    await this.logActivity(propertyId, actorUserId, 'MEMBER_REMOVED', {
      targetUserId: target.userId,
      summaryText: `${actor?.firstName} removed ${removedUser?.firstName} from the household`,
    });
  }

  // ── Invites ──────────────────────────────────────────────────────────────────

  async sendInvite(
    propertyId: string,
    actorUserId: string,
    payload: { email: string; role: HouseholdRole },
    options?: { sourceAskExecutionId?: string },
  ) {
    await this.assertOwner(propertyId, actorUserId);
    if (payload.role !== HouseholdRole.CONTRIBUTOR && payload.role !== HouseholdRole.VIEWER) {
      throw new APIError('Invitations may grant Contributor or Viewer access. Owner access must be managed separately.', 400, 'INVALID_INVITE_ROLE');
    }
    const inviteeEmail = payload.email.trim().toLowerCase();

    if (options?.sourceAskExecutionId) {
      const existingCommandInvite = await prisma.householdInvite.findUnique({
        where: { sourceAskExecutionId: options.sourceAskExecutionId },
      });
      if (existingCommandInvite) return existingCommandInvite;
    }

    // Check invitee is not already a member
    const existingMember = await prisma.householdMember.findFirst({
      where: { propertyId, user: { email: inviteeEmail } },
    });
    if (existingMember) {
      throw new APIError('This user is already a member of the household.', 409, 'ALREADY_MEMBER');
    }

    // Revoke any existing pending invite for this email on this property
    await prisma.householdInvite.updateMany({
      where: { propertyId, inviteeEmail, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });

    const inviteeUser = await prisma.user.findUnique({
      where: { email: inviteeEmail },
      select: { id: true },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    let invite;
    try {
      invite = await prisma.householdInvite.create({
        data: {
          propertyId,
          invitedByUserId: actorUserId,
          inviteeEmail,
          inviteeUserId: inviteeUser?.id,
          role: payload.role,
          token,
          expiresAt,
          sourceAskExecutionId: options?.sourceAskExecutionId,
        },
      });
    } catch (error) {
      if (options?.sourceAskExecutionId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await prisma.householdInvite.findUnique({ where: { sourceAskExecutionId: options.sourceAskExecutionId } });
        if (duplicate) return duplicate;
      }
      throw error;
    }

    const [actor, property] = await Promise.all([
      prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true, lastName: true } }),
      prisma.property.findUnique({ where: { id: propertyId }, select: { address: true, city: true, state: true } }),
    ]);
    await this.logActivity(propertyId, actorUserId, 'MEMBER_INVITED', {
      summaryText: `${actor?.firstName} invited ${inviteeEmail} as ${payload.role}`,
      metaJson: { inviteeEmail, role: payload.role },
    });

    const frontendOrigin = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    if (frontendOrigin && property) {
      getEmailNotificationQueue().add(
        'SEND_HOUSEHOLD_INVITATION',
        {
          to: inviteeEmail,
          inviterName: [actor?.firstName, actor?.lastName].filter(Boolean).join(' ') || 'A household owner',
          propertyAddress: `${property.address}, ${property.city}, ${property.state}`,
          householdRole: payload.role,
          householdInviteUrl: `${frontendOrigin}/invite/${encodeURIComponent(invite.token)}`,
          expiresAt: invite.expiresAt.toISOString(),
        },
        { removeOnComplete: true, removeOnFail: true, attempts: 2 },
      ).catch((error) => logger.error({ err: error, inviteId: invite.id }, '[HouseholdService] failed to enqueue invitation email'));
    } else if (!frontendOrigin) {
      logger.warn({ inviteId: invite.id }, '[HouseholdService] FRONTEND_URL is missing; household invitation email was not enqueued');
    }

    return invite;
  }

  async listInvites(propertyId: string) {
    return prisma.householdInvite.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(propertyId: string, inviteId: string, actorUserId: string) {
    await this.assertOwner(propertyId, actorUserId);

    const invite = await prisma.householdInvite.findFirst({
      where: { id: inviteId, propertyId, status: 'PENDING' },
    });
    if (!invite) throw new APIError('Pending invite not found.', 404, 'NOT_FOUND');

    return prisma.householdInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }

  async previewInvite(token: string) {
    const invite = await prisma.householdInvite.findUnique({
      where: { token },
      include: {
        property: { select: { address: true, city: true, state: true } },
        invitedByUser: { select: { firstName: true, lastName: true } },
      },
    });
    if (!invite) throw new APIError('Invite not found.', 404, 'NOT_FOUND');
    if (invite.status !== 'PENDING') {
      throw new APIError('This invite is no longer valid.', 410, 'INVITE_INVALID');
    }

    const isExpired = invite.expiresAt < new Date();
    return {
      propertyAddressSnippet: `${invite.property.address}, ${invite.property.city}`,
      invitedByName: `${invite.invitedByUser.firstName} ${invite.invitedByUser.lastName}`,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      isExpired,
    };
  }

  async acceptInvite(token: string, acceptingUserId: string) {
    const invite = await prisma.householdInvite.findUnique({
      where: { token },
      include: { property: { select: { address: true, city: true } } },
    });
    if (!invite) throw new APIError('Invite not found.', 404, 'NOT_FOUND');
    if (invite.status !== 'PENDING') {
      throw new APIError('This invite is no longer valid.', 410, 'INVITE_INVALID');
    }
    if (invite.expiresAt < new Date()) {
      await prisma.householdInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new APIError('This invite has expired.', 410, 'INVITE_EXPIRED');
    }

    const existing = await prisma.householdMember.findUnique({
      where: { propertyId_userId: { propertyId: invite.propertyId, userId: acceptingUserId } },
    });
    if (existing) {
      throw new APIError('You are already a member of this household.', 409, 'ALREADY_MEMBER');
    }

    const now = new Date();
    const [member] = await prisma.$transaction([
      prisma.householdMember.create({
        data: {
          propertyId: invite.propertyId,
          userId: acceptingUserId,
          role: invite.role,
          isPrimaryOwner: false,
          joinedAt: now,
        },
      }),
      prisma.householdInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: now, inviteeUserId: acceptingUserId },
      }),
    ]);

    const newMember = await prisma.user.findUnique({ where: { id: acceptingUserId }, select: { firstName: true, lastName: true } });
    await this.logActivity(invite.propertyId, acceptingUserId, 'MEMBER_JOINED', {
      summaryText: `${newMember?.firstName} joined ${invite.property.address}`,
    });

    return { propertyId: invite.propertyId };
  }

  // ── Activity feed ────────────────────────────────────────────────────────────

  async getActivityFeed(
    propertyId: string,
    params: { limit?: number; cursor?: string; activityTypes?: HouseholdActivityType[] }
  ) {
    const limit = params.limit ?? 25;

    const items = await prisma.householdActivityLog.findMany({
      where: {
        propertyId,
        ...(params.activityTypes?.length ? { activityType: { in: params.activityTypes } } : {}),
        ...(params.cursor ? { id: { lt: params.cursor } } : {}),
      },
      include: {
        actorUser: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
    };
  }

  // ── Task assignment ──────────────────────────────────────────────────────────

  async assignTask(
    propertyId: string,
    taskId: string,
    taskType: 'MAINTENANCE' | 'SEASONAL' | 'BUYER',
    assigneeUserId: string | null,
    actorUserId: string
  ) {
    // Validate assignee is an active member (skip check when unassigning)
    if (assigneeUserId) {
      const member = await prisma.householdMember.findUnique({
        where: { propertyId_userId: { propertyId, userId: assigneeUserId } },
      });
      if (!member) throw new APIError('Assignee is not a member of this household.', 400, 'NOT_A_MEMBER');
    }

    if (taskType === 'MAINTENANCE') {
      const task = await prisma.propertyMaintenanceTask.findFirst({
        where: { id: taskId, propertyId },
        select: { id: true, title: true },
      });
      if (!task) throw new APIError('Task not found.', 404, 'NOT_FOUND');
      await prisma.propertyMaintenanceTask.update({
        where: { id: taskId },
        data: { assignedToUserId: assigneeUserId },
      });
      if (assigneeUserId) {
        const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true } });
        await this.logActivity(propertyId, actorUserId, 'TASK_ASSIGNED', {
          targetUserId: assigneeUserId,
          entityType: 'PropertyMaintenanceTask',
          entityId: taskId,
          summaryText: `${actor?.firstName} assigned "${task.title}"`,
        });
      }
    } else if (taskType === 'SEASONAL') {
      const task = await prisma.seasonalChecklistItem.findFirst({
        where: { id: taskId, propertyId },
        select: { id: true, title: true },
      });
      if (!task) throw new APIError('Task not found.', 404, 'NOT_FOUND');
      await prisma.seasonalChecklistItem.update({
        where: { id: taskId },
        data: { assignedToUserId: assigneeUserId },
      });
      if (assigneeUserId) {
        const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true } });
        await this.logActivity(propertyId, actorUserId, 'TASK_ASSIGNED', {
          targetUserId: assigneeUserId,
          entityType: 'SeasonalChecklistItem',
          entityId: taskId,
          summaryText: `${actor?.firstName} assigned "${task.title}"`,
        });
      }
    } else if (taskType === 'BUYER') {
      const task = await prisma.homeBuyerTask.findFirst({
        where: { id: taskId },
        select: { id: true, title: true },
      });
      if (!task) throw new APIError('Task not found.', 404, 'NOT_FOUND');
      await prisma.homeBuyerTask.update({
        where: { id: taskId },
        data: { assignedToUserId: assigneeUserId },
      });
      if (assigneeUserId) {
        const actor = await prisma.user.findUnique({ where: { id: actorUserId }, select: { firstName: true } });
        await this.logActivity(propertyId, actorUserId, 'TASK_ASSIGNED', {
          targetUserId: assigneeUserId,
          entityType: 'HomeBuyerTask',
          entityId: taskId,
          summaryText: `${actor?.firstName} assigned "${task.title}"`,
        });
      }
    }
  }

  // ── Property owner bootstrapping ─────────────────────────────────────────────

  async ensurePrimaryOwnerMember(propertyId: string, userId: string) {
    await prisma.householdMember.upsert({
      where: { propertyId_userId: { propertyId, userId } },
      create: {
        propertyId,
        userId,
        role: 'OWNER',
        isPrimaryOwner: true,
        joinedAt: new Date(),
      },
      update: {},
      select: { id: true },
    });
  }
}
