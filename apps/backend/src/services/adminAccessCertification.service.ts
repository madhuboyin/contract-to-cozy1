// apps/backend/src/services/adminAccessCertification.service.ts
//
// Periodic access certification workflow (ADMIN_MODULE_FRD.md §17 Phase 6),
// entirely under ADMIN_ROLE_MANAGE — the same CRITICAL capability that
// governs grants/revokes, since certification decides grants. A campaign
// snapshots every active AdminCapabilityGrant into PENDING decisions; each
// decision is attested KEEP or REVOKE with a required reason by an admin
// who is NOT the grant holder. REVOKE executes through the standard
// revokeCapability() path so the revocation itself is audited identically
// to a manual revoke. A campaign completes only when nothing is PENDING.

import { Request } from 'express';
import { AccessCertificationDecisionState, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';
import { AdminCapabilityError, revokeCapability } from './adminCapability.service';

export class AdminAccessCertificationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'AdminAccessCertificationError';
  }
}

interface ActionContext {
  req?: Pick<Request, 'ip' | 'headers'> | null;
}

/** Resolve userIds to display names in one query; unknown/deleted ids map to null. */
async function resolveActorNames(userIds: (string | null)[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return {};
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return Object.fromEntries(users.map((u) => [u.id, `${u.firstName} ${u.lastName} <${u.email}>`]));
}

export interface OpenCampaignInput {
  actorId: string;
  name: string;
  dueAt?: Date;
}

/**
 * Opens a campaign and snapshots every currently-active grant into a
 * PENDING decision. Only one campaign can be OPEN at a time — concurrent
 * campaigns would race each other's revocations.
 */
export async function openCampaign(input: OpenCampaignInput, ctx: ActionContext = {}) {
  const existingOpen = await prisma.accessCertificationCampaign.count({ where: { status: 'OPEN' } });
  if (existingOpen > 0) {
    throw new AdminAccessCertificationError(
      'CAMPAIGN_ALREADY_OPEN',
      'An access certification campaign is already open. Complete or cancel it first.'
    );
  }

  const activeGrants = await prisma.adminCapabilityGrant.findMany({
    where: { revokedAt: null },
    select: { id: true, userId: true, capability: true, bundleName: true },
  });
  if (activeGrants.length === 0) {
    throw new AdminAccessCertificationError('NO_ACTIVE_GRANTS', 'There are no active capability grants to certify.');
  }

  const campaign = await prisma.accessCertificationCampaign.create({
    data: {
      name: input.name,
      openedById: input.actorId,
      dueAt: input.dueAt ?? null,
      decisions: {
        create: activeGrants.map((grant) => ({
          grantId: grant.id,
          holderId: grant.userId,
          capability: grant.capability,
          bundleName: grant.bundleName,
        })),
      },
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_OPEN_ACCESS_CERTIFICATION',
    entityType: 'ACCESS_CERTIFICATION_CAMPAIGN',
    entityId: campaign.id,
    capability: 'ADMIN_ROLE_MANAGE',
    relatedRefs: { name: campaign.name, grantCount: activeGrants.length },
    req: ctx.req,
  });

  return campaign;
}

/** Campaign list with attestation progress, newest first. */
export async function listCampaigns() {
  const campaigns = await prisma.accessCertificationCampaign.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const progress = await prisma.accessCertificationDecision.groupBy({
    by: ['campaignId', 'state'],
    where: { campaignId: { in: campaigns.map((c) => c.id) } },
    _count: { _all: true },
  });

  const byCampaign: Record<string, Record<string, number>> = {};
  for (const row of progress) {
    byCampaign[row.campaignId] = byCampaign[row.campaignId] ?? {};
    byCampaign[row.campaignId][row.state] = row._count._all;
  }

  return campaigns.map((c) => ({
    ...c,
    decisionCounts: {
      PENDING: byCampaign[c.id]?.PENDING ?? 0,
      KEEP: byCampaign[c.id]?.KEEP ?? 0,
      REVOKE: byCampaign[c.id]?.REVOKE ?? 0,
    },
  }));
}

export async function getCampaignDetail(campaignId: string) {
  const campaign = await prisma.accessCertificationCampaign.findUnique({
    where: { id: campaignId },
    include: { decisions: { orderBy: [{ holderId: 'asc' }, { capability: 'asc' }] } },
  });
  if (!campaign) {
    throw new AdminAccessCertificationError('CAMPAIGN_NOT_FOUND', `No campaign with id "${campaignId}".`);
  }

  const names = await resolveActorNames([
    campaign.openedById,
    ...campaign.decisions.flatMap((d) => [d.holderId, d.decidedById]),
  ]);

  return {
    ...campaign,
    openedByName: names[campaign.openedById] ?? null,
    decisions: campaign.decisions.map((d) => ({
      ...d,
      holderName: names[d.holderId] ?? null,
      decidedByName: d.decidedById ? names[d.decidedById] ?? null : null,
    })),
  };
}

export interface AttestDecisionInput {
  decisionId: string;
  actorId: string;
  decision: Extract<AccessCertificationDecisionState, 'KEEP' | 'REVOKE'>;
  reason: string;
}

/**
 * Attests one decision. Self-attestation is blocked — the grant holder
 * cannot certify their own access. REVOKE revokes the grant through the
 * standard path; a grant already revoked outside the campaign still counts
 * as a successful REVOKE (the desired end state already holds).
 */
export async function attestDecision(input: AttestDecisionInput, ctx: ActionContext = {}) {
  const decision = await prisma.accessCertificationDecision.findUnique({
    where: { id: input.decisionId },
    include: { campaign: { select: { id: true, status: true } } },
  });
  if (!decision) {
    throw new AdminAccessCertificationError('DECISION_NOT_FOUND', `No decision with id "${input.decisionId}".`);
  }
  if (decision.campaign.status !== 'OPEN') {
    throw new AdminAccessCertificationError('CAMPAIGN_NOT_OPEN', 'This campaign is no longer open.');
  }
  if (decision.state !== 'PENDING') {
    throw new AdminAccessCertificationError('ALREADY_ATTESTED', `This decision is already ${decision.state}.`);
  }
  if (decision.holderId === input.actorId) {
    throw new AdminAccessCertificationError(
      'SELF_ATTESTATION_FORBIDDEN',
      'An administrator cannot certify their own capability grants.'
    );
  }

  let revokeExecuted = false;
  if (input.decision === 'REVOKE') {
    try {
      await revokeCapability(
        {
          userId: decision.holderId,
          capability: decision.capability as any,
          revokedBy: input.actorId,
          reason: `Access certification: ${input.reason}`,
        },
        ctx
      );
      revokeExecuted = true;
    } catch (err) {
      if (!(err instanceof AdminCapabilityError && err.code === 'GRANT_NOT_FOUND')) throw err;
    }
  }

  const updated = await prisma.accessCertificationDecision.update({
    where: { id: input.decisionId },
    data: {
      state: input.decision,
      decidedById: input.actorId,
      decidedAt: new Date(),
      reason: input.reason,
    },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_ATTEST_ACCESS_CERTIFICATION',
    entityType: 'ACCESS_CERTIFICATION_DECISION',
    entityId: input.decisionId,
    capability: 'ADMIN_ROLE_MANAGE',
    reason: input.reason,
    disposition: input.decision,
    relatedRefs: {
      campaignId: decision.campaignId,
      holderId: decision.holderId,
      grantCapability: decision.capability,
      revokeExecuted,
    },
    req: ctx.req,
  });

  return { ...updated, revokeExecuted };
}

export interface CampaignActionInput {
  campaignId: string;
  actorId: string;
  reason: string;
}

/** Completes a campaign — only allowed once every decision is attested. */
export async function completeCampaign(input: CampaignActionInput, ctx: ActionContext = {}) {
  const campaign = await prisma.accessCertificationCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, status: true, name: true },
  });
  if (!campaign) {
    throw new AdminAccessCertificationError('CAMPAIGN_NOT_FOUND', `No campaign with id "${input.campaignId}".`);
  }
  if (campaign.status !== 'OPEN') {
    throw new AdminAccessCertificationError('CAMPAIGN_NOT_OPEN', `This campaign is already ${campaign.status}.`);
  }

  const pending = await prisma.accessCertificationDecision.count({
    where: { campaignId: input.campaignId, state: 'PENDING' },
  });
  if (pending > 0) {
    throw new AdminAccessCertificationError(
      'DECISIONS_PENDING',
      `${pending} decision(s) are still pending attestation.`
    );
  }

  await prisma.accessCertificationCampaign.update({
    where: { id: input.campaignId },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_COMPLETE_ACCESS_CERTIFICATION',
    entityType: 'ACCESS_CERTIFICATION_CAMPAIGN',
    entityId: input.campaignId,
    capability: 'ADMIN_ROLE_MANAGE',
    reason: input.reason,
    relatedRefs: { name: campaign.name },
    req: ctx.req,
  });

  return { status: 'COMPLETED' as const };
}

export async function cancelCampaign(input: CampaignActionInput, ctx: ActionContext = {}) {
  const campaign = await prisma.accessCertificationCampaign.findUnique({
    where: { id: input.campaignId },
    select: { id: true, status: true, name: true },
  });
  if (!campaign) {
    throw new AdminAccessCertificationError('CAMPAIGN_NOT_FOUND', `No campaign with id "${input.campaignId}".`);
  }
  if (campaign.status !== 'OPEN') {
    throw new AdminAccessCertificationError('CAMPAIGN_NOT_OPEN', `This campaign is already ${campaign.status}.`);
  }

  await prisma.accessCertificationCampaign.update({
    where: { id: input.campaignId },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  await recordAdminAction({
    actorId: input.actorId,
    action: 'ADMIN_CANCEL_ACCESS_CERTIFICATION',
    entityType: 'ACCESS_CERTIFICATION_CAMPAIGN',
    entityId: input.campaignId,
    capability: 'ADMIN_ROLE_MANAGE',
    reason: input.reason,
    relatedRefs: { name: campaign.name },
    req: ctx.req,
  });

  return { status: 'CANCELLED' as const };
}
