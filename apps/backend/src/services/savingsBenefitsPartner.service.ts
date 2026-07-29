import type { Request } from 'express';
import {
  Prisma,
  SavingsBenefitHandoffStatus,
  SavingsBenefitPartnerComplaintStatus,
  SavingsBenefitPartnerStatus,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { recordAdminAction } from './adminAudit.service';

export interface SavingsBenefitPartnerInput {
  id: string;
  name: string;
  status?: SavingsBenefitPartnerStatus;
  supportedJurisdictions: string[];
  disclosureVersion: string;
  compensationDisclosure: string;
  rankingDisclosure: string;
  privacyDisclosure: string;
  fulfillmentSlaHours: number;
  effectiveAt: Date;
  expiresAt?: Date | null;
}

export async function listSavingsBenefitPartners() {
  return prisma.savingsBenefitPartner.findMany({ orderBy: [{ status: 'asc' }, { name: 'asc' }] });
}

export async function listSavingsBenefitHandoffs(now = new Date()) {
  const actions = await prisma.savingsBenefitAction.findMany({
    where: { partnerId: { not: null }, handoffStatus: { not: null } },
    include: {
      partner: true,
      hiddenAssetOutcomes: {
        where: { revokedAt: null },
        orderBy: { recordedAt: 'desc' },
        take: 1,
      },
      homeSavingsOutcomes: {
        where: { revokedAt: null },
        orderBy: { recordedAt: 'desc' },
        take: 1,
      },
      complaints: { where: { status: 'OPEN' }, select: { id: true } },
    },
    orderBy: { startedAt: 'asc' },
  });

  return actions.map((action) => {
    const slaStartedAt = action.handoffSubmittedAt ?? action.startedAt;
    const dueAt = action.partner
      ? new Date(slaStartedAt.getTime() + action.partner.fulfillmentSlaHours * 60 * 60 * 1000)
      : null;
    const terminal = ['FULFILLED', 'FAILED', 'REVOKED'].includes(action.handoffStatus!);
    const outcome = action.hiddenAssetOutcomes[0] ?? action.homeSavingsOutcomes[0] ?? null;
    return {
      id: action.id,
      propertyId: action.propertyId,
      state: action.state,
      handoffStatus: action.handoffStatus,
      startedAt: action.startedAt,
      submittedAt: action.handoffSubmittedAt,
      acknowledgedAt: action.handoffAcknowledgedAt,
      fulfilledAt: action.handoffFulfilledAt,
      dueAt,
      overdue: Boolean(dueAt && !terminal && dueAt < now),
      partner: action.partner,
      openComplaintCount: action.complaints.length,
      outcome: outcome
        ? {
            id: outcome.id,
            stage: outcome.stage,
            verificationState: outcome.verificationState,
            recordedAt: outcome.recordedAt,
          }
        : null,
    };
  });
}

export async function upsertSavingsBenefitPartner(
  input: SavingsBenefitPartnerInput,
  actorId: string,
  req?: Pick<Request, 'ip' | 'headers'> | null,
) {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.savingsBenefitPartner.findUnique({ where: { id: input.id } });
    const partner = await tx.savingsBenefitPartner.upsert({
      where: { id: input.id },
      create: {
        ...input,
        name: input.name.trim(),
        supportedJurisdictions: input.supportedJurisdictions.map((value) => value.trim().toUpperCase()),
        disclosureVersion: input.disclosureVersion.trim(),
        compensationDisclosure: input.compensationDisclosure.trim(),
        rankingDisclosure: input.rankingDisclosure.trim(),
        privacyDisclosure: input.privacyDisclosure.trim(),
        status: input.status ?? 'ACTIVE',
      },
      update: {
        name: input.name.trim(),
        supportedJurisdictions: input.supportedJurisdictions.map((value) => value.trim().toUpperCase()),
        disclosureVersion: input.disclosureVersion.trim(),
        compensationDisclosure: input.compensationDisclosure.trim(),
        rankingDisclosure: input.rankingDisclosure.trim(),
        privacyDisclosure: input.privacyDisclosure.trim(),
        fulfillmentSlaHours: input.fulfillmentSlaHours,
        effectiveAt: input.effectiveAt,
        expiresAt: input.expiresAt ?? null,
        status: input.status ?? 'ACTIVE',
      },
    });
    await recordAdminAction({
      actorId,
      action: previous
        ? 'ADMIN_SAVINGS_BENEFITS_PARTNER_UPDATE'
        : 'ADMIN_SAVINGS_BENEFITS_PARTNER_CREATE',
      entityType: 'SAVINGS_BENEFIT_PARTNER',
      entityId: partner.id,
      capability: 'SAVINGS_BENEFITS_PUBLISH',
      reason: previous ? 'Partner governance record updated.' : 'Partner governance record created.',
      disposition: partner.status,
      oldValues: previous ? JSON.parse(JSON.stringify(previous)) : undefined,
      newValues: JSON.parse(JSON.stringify(partner)),
      req,
    }, tx);
    return partner;
  });
}

export async function getEligibleSavingsBenefitPartner(
  partnerId: string,
  jurisdiction: string | null | undefined,
  now = new Date(),
) {
  const partner = await prisma.savingsBenefitPartner.findUnique({ where: { id: partnerId } });
  if (
    !partner
    || partner.status !== 'ACTIVE'
    || partner.effectiveAt > now
    || (partner.expiresAt !== null && partner.expiresAt <= now)
  ) {
    throw new Error('The requested partner is not currently approved for Savings & Benefits handoffs.');
  }
  const normalizedJurisdiction = jurisdiction?.trim().toUpperCase();
  if (
    partner.supportedJurisdictions.length > 0
    && (!normalizedJurisdiction || !partner.supportedJurisdictions.includes(normalizedJurisdiction))
  ) {
    throw new Error('The requested partner does not support this property jurisdiction.');
  }
  return partner;
}

const HANDOFF_TRANSITIONS: Record<SavingsBenefitHandoffStatus, SavingsBenefitHandoffStatus[]> = {
  CONSENTED: ['SUBMITTED', 'REVOKED'],
  SUBMITTED: ['ACKNOWLEDGED', 'FAILED', 'REVOKED'],
  ACKNOWLEDGED: ['FULFILLED', 'FAILED', 'REVOKED'],
  FULFILLED: [],
  FAILED: [],
  REVOKED: [],
};

export async function transitionSavingsBenefitHandoff(
  actionId: string,
  nextStatus: SavingsBenefitHandoffStatus,
  actorId: string,
  reason: string,
  req?: Pick<Request, 'ip' | 'headers'> | null,
) {
  return prisma.$transaction(async (tx) => {
    const action = await tx.savingsBenefitAction.findUnique({
      where: { id: actionId },
      include: { partner: true },
    });
    if (!action?.partnerId || !action.handoffStatus) {
      throw new Error('Partner handoff not found.');
    }
    if (!HANDOFF_TRANSITIONS[action.handoffStatus].includes(nextStatus)) {
      throw new Error(`Cannot transition a handoff from ${action.handoffStatus} to ${nextStatus}.`);
    }
    const now = new Date();
    const updated = await tx.savingsBenefitAction.updateMany({
      where: { id: action.id, handoffStatus: action.handoffStatus },
      data: {
        handoffStatus: nextStatus,
        ...(nextStatus === 'SUBMITTED' ? { handoffSubmittedAt: now, submittedAt: now } : {}),
        ...(nextStatus === 'ACKNOWLEDGED' ? { handoffAcknowledgedAt: now } : {}),
        ...(nextStatus === 'FULFILLED' ? { handoffFulfilledAt: now } : {}),
        ...(nextStatus === 'REVOKED'
          ? { handoffRevokedAt: now, handoffRevocationReason: reason }
          : {}),
      },
    });
    if (updated.count !== 1) throw new Error('Handoff changed concurrently. Refresh and try again.');
    await recordAdminAction({
      actorId,
      action: 'ADMIN_SAVINGS_BENEFITS_HANDOFF_TRANSITION',
      entityType: 'SAVINGS_BENEFIT_ACTION',
      entityId: action.id,
      capability: 'SAVINGS_BENEFITS_PUBLISH',
      reason,
      disposition: nextStatus,
      oldValues: { handoffStatus: action.handoffStatus },
      newValues: { handoffStatus: nextStatus },
      relatedRefs: { partnerId: action.partnerId },
      req,
    }, tx);
    return tx.savingsBenefitAction.findUniqueOrThrow({ where: { id: action.id } });
  });
}

async function assertActionForHomeowner(propertyId: string, actionId: string, userId: string) {
  const property = await prisma.property.findFirst({
    where: { id: propertyId, homeownerProfile: { userId } },
    select: { id: true },
  });
  if (!property) throw new Error('Property not found or access denied.');
  const action = await prisma.savingsBenefitAction.findFirst({ where: { id: actionId, propertyId } });
  if (!action) throw new Error('Action not found or access denied.');
  return action;
}

export async function revokeSavingsBenefitHandoff(
  propertyId: string,
  actionId: string,
  userId: string,
  reason: string,
) {
  const action = await assertActionForHomeowner(propertyId, actionId, userId);
  if (!action.partnerId || !action.handoffStatus) throw new Error('Partner handoff not found.');
  if (!HANDOFF_TRANSITIONS[action.handoffStatus].includes('REVOKED')) {
    throw new Error(`Cannot revoke a ${action.handoffStatus} handoff.`);
  }
  return prisma.savingsBenefitAction.updateMany({
    where: { id: action.id, handoffStatus: action.handoffStatus },
    data: {
      handoffStatus: 'REVOKED',
      handoffRevokedAt: new Date(),
      handoffRevocationReason: reason,
    },
  });
}

export async function createSavingsBenefitPartnerComplaint(
  propertyId: string,
  actionId: string,
  userId: string,
  category: string,
  description: string,
) {
  const action = await assertActionForHomeowner(propertyId, actionId, userId);
  if (!action.partnerId) throw new Error('This action has no partner handoff.');
  return prisma.savingsBenefitPartnerComplaint.create({
    data: {
      actionId,
      reportedBy: userId,
      category: category.trim(),
      description: description.trim(),
    },
  });
}

export async function listSavingsBenefitPartnerComplaints(
  status?: SavingsBenefitPartnerComplaintStatus,
) {
  return prisma.savingsBenefitPartnerComplaint.findMany({
    where: status ? { status } : {},
    include: { action: { include: { partner: true } } },
    orderBy: { createdAt: 'asc' },
  });
}

export async function resolveSavingsBenefitPartnerComplaint(
  complaintId: string,
  status: Extract<SavingsBenefitPartnerComplaintStatus, 'RESOLVED' | 'DISMISSED'>,
  resolution: string,
  actorId: string,
  req?: Pick<Request, 'ip' | 'headers'> | null,
) {
  return prisma.$transaction(async (tx) => {
    const complaint = await tx.savingsBenefitPartnerComplaint.findUnique({ where: { id: complaintId } });
    if (!complaint) throw new Error('Complaint not found.');
    if (complaint.status !== 'OPEN') throw new Error('Complaint is already closed.');
    const updated = await tx.savingsBenefitPartnerComplaint.update({
      where: { id: complaint.id },
      data: {
        status,
        resolution: resolution.trim(),
        resolvedAt: new Date(),
        resolvedBy: actorId,
      },
    });
    await recordAdminAction({
      actorId,
      action: 'ADMIN_SAVINGS_BENEFITS_PARTNER_COMPLAINT_RESOLVE',
      entityType: 'SAVINGS_BENEFIT_PARTNER_COMPLAINT',
      entityId: complaint.id,
      capability: 'SAVINGS_BENEFITS_REVIEW',
      reason: resolution,
      disposition: status,
      oldValues: JSON.parse(JSON.stringify(complaint)),
      newValues: JSON.parse(JSON.stringify(updated)),
      req,
    }, tx);
    return updated;
  });
}

export type SavingsBenefitPartnerRecord = Awaited<ReturnType<typeof getEligibleSavingsBenefitPartner>>;
