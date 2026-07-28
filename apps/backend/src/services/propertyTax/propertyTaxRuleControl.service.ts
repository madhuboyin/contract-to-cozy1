import { prisma } from '../../lib/prisma';

export class PropertyTaxRuleControlService {
  constructor(private readonly db = prisma) {}

  async activate(
    profileId: string,
    actorUserId: string,
    reason: string,
    now = new Date(),
  ) {
    if (!reason.trim()) throw new Error('Activation requires a reason');
    return this.db.$transaction(async (tx) => {
      const profile = await tx.propertyTaxRuleProfile.findUnique({
        where: { id: profileId },
        include: {
          citations: true,
          deadlineRules: true,
        },
      });
      if (!profile) throw new Error('Property tax rule profile not found');
      if (profile.expiresAt <= now) throw new Error('Expired rule profiles cannot be activated');
      if (profile.reviewedAt > now) throw new Error('Rule review timestamp cannot be in the future');
      if (profile.citations.length === 0) {
        throw new Error('Reviewed rule profiles require official citations');
      }
      if (profile.deadlineRules.some((rule) => !rule.officialUrl)) {
        throw new Error('Every deadline rule requires an official URL');
      }

      await tx.propertyTaxRuleProfile.updateMany({
        where: {
          jurisdictionId: profile.jurisdictionId,
          propertyClass: profile.propertyClass,
          status: 'ACTIVE',
          id: { not: profile.id },
        },
        data: { status: 'SUPERSEDED' },
      });
      const activated = await tx.propertyTaxRuleProfile.update({
        where: { id: profile.id },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          disabledAt: null,
          disabledByUserId: null,
          disabledReason: null,
        },
      });
      await tx.propertyTaxRuleControlEvent.create({
        data: {
          ruleProfileId: profile.id,
          action: 'ACTIVATED',
          actorUserId,
          reason: reason.trim(),
        },
      });
      return activated;
    });
  }

  async emergencyDisable(
    profileId: string,
    actorUserId: string,
    reason: string,
    now = new Date(),
  ) {
    if (!reason.trim()) throw new Error('Emergency disable requires a reason');
    return this.db.$transaction(async (tx) => {
      const disabled = await tx.propertyTaxRuleProfile.update({
        where: { id: profileId },
        data: {
          status: 'DISABLED',
          disabledAt: now,
          disabledByUserId: actorUserId,
          disabledReason: reason.trim(),
        },
      });
      await tx.propertyTaxRuleControlEvent.create({
        data: {
          ruleProfileId: profileId,
          action: 'EMERGENCY_DISABLED',
          actorUserId,
          reason: reason.trim(),
        },
      });
      return disabled;
    });
  }

  async rollback(
    profileId: string,
    actorUserId: string,
    reason: string,
    now = new Date(),
  ) {
    if (!reason.trim()) throw new Error('Rollback requires a reason');
    return this.db.$transaction(async (tx) => {
      const current = await tx.propertyTaxRuleProfile.findUnique({
        where: { id: profileId },
        include: { supersedesProfile: true },
      });
      if (!current) throw new Error('Property tax rule profile not found');
      const target = current.supersedesProfile;
      if (!target) throw new Error('No prior rule profile is available for rollback');
      if (target.expiresAt <= now) throw new Error('Rollback target is expired');
      if (
        target.effectiveFrom > now
        || (target.effectiveTo && target.effectiveTo < now)
      ) {
        throw new Error('Rollback target is not currently effective');
      }

      await tx.propertyTaxRuleProfile.update({
        where: { id: current.id },
        data: {
          status: 'DISABLED',
          disabledAt: now,
          disabledByUserId: actorUserId,
          disabledReason: `Rolled back: ${reason.trim()}`,
        },
      });
      const restored = await tx.propertyTaxRuleProfile.update({
        where: { id: target.id },
        data: {
          status: 'ACTIVE',
          activatedAt: now,
          disabledAt: null,
          disabledByUserId: null,
          disabledReason: null,
        },
      });
      await tx.propertyTaxRuleControlEvent.create({
        data: {
          ruleProfileId: current.id,
          action: 'ROLLED_BACK',
          actorUserId,
          reason: reason.trim(),
          metadataJson: { restoredProfileId: target.id },
        },
      });
      return restored;
    });
  }
}

export const propertyTaxRuleControlService =
  new PropertyTaxRuleControlService();
