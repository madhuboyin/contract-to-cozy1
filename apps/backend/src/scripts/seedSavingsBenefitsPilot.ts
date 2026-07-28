import 'dotenv/config';

import { prisma } from '../lib/prisma';
import {
  HiddenAssetProgramInput,
  HiddenAssetSourceInput,
  savingsBenefitsAdminService,
} from '../services/savingsBenefitsAdmin.service';
import { transitionSavingsBenefitProgram } from '../services/savingsBenefitsGovernance.service';

/**
 * Pilot reviewed-source seed for the Savings and Benefits registry
 * (HIDDEN_SAVINGS_AND_BENEFITS_CAPABILITY_AUDIT_AND_IMPLEMENTATION_PLAN.md
 * Slice 2). Seeds one real, verifiable source (NJ Division of Taxation) and
 * two real, currently-documented state benefit programs, then drives each
 * program through the actual governance transitions (SUBMIT_FOR_REVIEW →
 * APPROVE → PUBLISH) rather than inserting PUBLISHED directly — running
 * this script is itself a live proof that the review workflow works.
 *
 * Lives under src/scripts/ (not prisma/) so it compiles into
 * dist/scripts/seedSavingsBenefitsPilot.js — tsconfig.json excludes
 * prisma/**\/* from the build, and the production image only ships dist/.
 * Run in production via run-savings-benefits-seed-job.sh (a one-off
 * Kubernetes Job), mirroring run-property-tax-seed-job.sh.
 *
 * Program names, official URLs, and eligibility summaries were verified
 * against nj.gov on 2026-07-28. Income limits, benefit amounts, and
 * deadlines on official sources change yearly — an admin must periodically
 * re-review these programs (see docs/operations/savings-benefits-source-runbook.md).
 *
 * Income, age, and residency-duration eligibility are not yet modeled
 * attributes in the rule engine (Slice 0 finding) — only region (state=NJ)
 * is machine-evaluated here. The real criteria are recorded in
 * eligibilityNotes for the homeowner to verify, which is the correctly
 * scoped behavior until a dedicated consented eligibility-fact store exists.
 *
 * Neither program sets fundingStatus or an application window here (both
 * left at their safe defaults — UNKNOWN / unset, see Slice 6) since this
 * pilot seed hasn't independently verified either program's current-cycle
 * funding or application-window state against nj.gov; an admin should set
 * those once that verification happens, not this seed.
 */

const SEED_ACTOR = 'SYSTEM_REVIEWED_SEED';

const NJ_SOURCE: HiddenAssetSourceInput = {
  name: 'New Jersey Division of Taxation',
  sourceKind: 'OFFICIAL_GOVERNMENT',
  officialUrl: 'https://www.nj.gov/treasury/taxation/relief.shtml',
  reviewSlaDays: 180,
  status: 'ACTIVE',
};

const NJ_PROGRAMS: Omit<HiddenAssetProgramInput, 'sourceId'>[] = [
  {
    name: 'Senior Freeze (Property Tax Reimbursement)',
    category: 'TAX_EXEMPTION',
    description:
      'Reimburses eligible senior or disabled New Jersey homeowners for property tax increases above their qualifying base-year amount.',
    regionType: 'STATE',
    regionValue: 'NJ',
    benefitType: 'TAX_CREDIT',
    benefitEstimateMin: null,
    benefitEstimateMax: null,
    // Reimburses that year's tax increase — a homeowner reapplies annually,
    // not a one-time payment.
    benefitPeriod: 'ANNUAL',
    sourceUrl: 'https://www.nj.gov/treasury/taxation/ptr/',
    sourceLabel: 'NJ Division of Taxation — Senior Freeze (Property Tax Reimbursement)',
    eligibilityNotes:
      'Not yet machine-evaluated — verify directly with the official source: applicant must be age 65+ or receiving Social Security/Railroad Retirement disability benefits, an NJ resident for 10+ consecutive years, living in the current home for 3+ years, with income at or below the current-year limit (2025: $172,475), and all property taxes for the claimed year paid in full.',
    rules: [{ attribute: 'state', operator: 'EQUALS', value: 'NJ' }],
  },
  {
    name: 'ANCHOR (Affordable New Jersey Communities for Homeowners and Renters)',
    category: 'TAX_EXEMPTION',
    description:
      'Property tax relief for New Jersey homeowners and renters based on income, paid as a benefit rather than an assessment reduction.',
    regionType: 'STATE',
    regionValue: 'NJ',
    benefitType: 'REBATE',
    benefitEstimateMin: null,
    benefitEstimateMax: 1750,
    // A yearly benefit tied to that year's income/age — a homeowner
    // reapplies annually, not a one-time payment.
    benefitPeriod: 'ANNUAL',
    sourceUrl: 'https://www.nj.gov/treasury/media/anchor/index.shtml',
    sourceLabel: 'NJ Division of Taxation — ANCHOR Program',
    eligibilityNotes:
      'Not yet machine-evaluated — verify directly with the official source: homeowners must own and occupy the home as a principal residence as of the qualifying date and have gross income at or below the current-year limit (2025: $250,000 for homeowners, $150,000 for renters). Benefit amount depends on age and income.',
    rules: [{ attribute: 'state', operator: 'EQUALS', value: 'NJ' }],
  },
];

async function ensureSource(): Promise<string> {
  const existing = await prisma.hiddenAssetSource.findFirst({ where: { name: NJ_SOURCE.name } });
  if (existing) return existing.id;
  const created = await savingsBenefitsAdminService.createSource(NJ_SOURCE, SEED_ACTOR);
  return created.id;
}

async function ensureProgramPublished(sourceId: string, input: Omit<HiddenAssetProgramInput, 'sourceId'>) {
  let program = await prisma.hiddenAssetProgram.findFirst({ where: { name: input.name, sourceId } });

  if (!program) {
    const result = await savingsBenefitsAdminService.createProgram({ ...input, sourceId });
    program = result;
  }

  const reason = 'Initial reviewed pilot seed — real, verifiable New Jersey benefit program.';
  if (program.reviewStatus === 'DRAFT') {
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: SEED_ACTOR,
      action: 'SUBMIT_FOR_REVIEW',
      reason,
    });
  }
  const afterSubmit = await prisma.hiddenAssetProgram.findUniqueOrThrow({ where: { id: program.id } });
  if (afterSubmit.reviewStatus === 'IN_REVIEW') {
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: SEED_ACTOR,
      action: 'APPROVE',
      reason,
    });
  }
  const afterApprove = await prisma.hiddenAssetProgram.findUniqueOrThrow({ where: { id: program.id } });
  if (afterApprove.reviewStatus === 'APPROVED') {
    await transitionSavingsBenefitProgram({
      programId: program.id,
      actorId: SEED_ACTOR,
      action: 'PUBLISH',
      reason,
    });
  }

  return prisma.hiddenAssetProgram.findUniqueOrThrow({ where: { id: program.id } });
}

export async function seedSavingsBenefitsPilot() {
  const sourceId = await ensureSource();
  const programs = [];
  for (const input of NJ_PROGRAMS) {
    programs.push(await ensureProgramPublished(sourceId, input));
  }
  return { sourceId, programs };
}

if (require.main === module) {
  seedSavingsBenefitsPilot()
    .then(({ sourceId, programs }) => {
      const published = programs.filter((p) => p.reviewStatus === 'PUBLISHED').length;
      console.log(
        `Seeded source ${sourceId} and ${programs.length} program(s), ${published} PUBLISHED.`,
      );
    })
    .catch((error) => {
      console.error('Failed to seed Savings and Benefits pilot data.', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
