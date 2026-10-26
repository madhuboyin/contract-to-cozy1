// "What loss-prevention work matters most?" in Ask: a read of the Risk Premium Optimizer's saved loss-prevention plan (the desktop Coverage & Premium Review
// "Reduce loss risk" tab), ranked by the premium driver each step addresses and then by readiness to act. Read-only: it never prepares or changes a plan.
// The optimizer's read service serves the home's primary owner only (it holds the premium, deductible and cash buffer), and Ask says so for anyone else.
// A step is loss-prevention work, not a savings promise: a carrier credit is shown only as the plan records it.
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, money } from '../askFormatting';
import { RiskPremiumOptimizerService } from '../../riskPremiumOptimizer.service';
import { OPEN_PLAN_STATUSES, rankMitigationPlanItems, riskPlanRows, type RiskDriverInput, type RiskPlanItemInput } from '../support/riskMitigationPlan';

const optimizer = new RiskPremiumOptimizerService();
const database = prisma as any;

const BOUNDARY = {
  type: 'BOUNDARY' as const, id: 'risk-mitigation-boundary', title: 'Loss-prevention steps—not a savings promise', severity: 'INFO' as const,
  body: 'These steps lower the chance or the cost of a loss. Whether your carrier gives any credit for a step depends on the carrier, and is treated as confirmed only where a step says so. Have a qualified professional do any electrical, gas, roofing or structural work.',
  suggestions: [] as string[],
};
const seeReview = { id: 'risk-plan-see-coverage-review', label: 'Show my coverage review', interactionType: 'START_WORKFLOW' as const, message: 'Show my coverage review', operationId: 'COVERAGE_REVIEW_STATUS' as const, style: 'SECONDARY' as const };

const isPrimaryOwner = async (userId: string, propertyId: string) =>
  Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));

export async function riskMitigationPlanResult(userId: string, propertyId: string): Promise<AskOperationResult> {
  await ensurePropertyAccess(userId, propertyId);
  if (!await isPrimaryOwner(userId, propertyId)) return {
    status: 'BLOCKED', reasonCode: 'RISK_PLAN_PRIMARY_OWNER_ONLY', suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'risk-plan-primary-owner', title: 'The home’s primary owner can see the loss-prevention plan', body: 'The plan is built from the premium, deductible and cash buffer on your insurance, which are kept for the home’s primary account holder. Nothing has changed.', tone: 'CAUTION', actions: [] }],
  };
  let latest: Awaited<ReturnType<typeof optimizer.getLatest>>;
  try { latest = await optimizer.getLatest(propertyId, userId); } catch (error) {
    if ((error as { code?: unknown })?.code === 'COVERAGE_CONFLICT_REVIEW_REQUIRED') return {
      status: 'READY_WITH_LIMITATIONS', reasonCode: 'RISK_PLAN_COVERAGE_CONFLICT', suggestions: [],
      blocks: [{ type: 'SUMMARY', id: 'risk-plan-conflict', title: 'A coverage detail needs to be resolved first', body: 'A newly added policy or warranty record disagrees with one you confirmed, so the plan is held until that is resolved. Your coverage review shows which one.', tone: 'CAUTION', actions: [seeReview] }, BOUNDARY],
    };
    throw error;
  }
  if (!latest.exists) return {
    status: 'READY_WITH_LIMITATIONS', reasonCode: 'RISK_PLAN_NOT_PREPARED', suggestions: [],
    blocks: [{ type: 'SUMMARY', id: 'risk-plan-none', title: 'No loss-prevention plan has been prepared for this home yet', body: 'The plan is prepared from your insurance policy and the home’s details. Preparing it is not currently available in Ask, so there is nothing to rank yet. That is not the same as having nothing to do.', tone: 'DEFAULT', actions: [] }, BOUNDARY],
  };
  const analysis = latest.analysis as unknown as { status: string; computedAt: string; summary?: string; premiumDrivers: RiskDriverInput[]; planItems: RiskPlanItemInput[]; planRebuildRequired?: boolean };
  const drivers = analysis.premiumDrivers ?? [];
  const ranked = rankMitigationPlanItems(analysis.planItems ?? [], drivers);
  const closed = (analysis.planItems ?? []).filter((item) => !OPEN_PLAN_STATUSES.includes(item.status));
  const stale = analysis.status !== 'READY' || Boolean(analysis.planRebuildRequired);
  const prepared = humanDate(new Date(analysis.computedAt)) ?? '';
  const blocks: AskOperationResult['blocks'] = [{
    type: 'SUMMARY', id: 'risk-plan-summary',
    title: ranked.length ? `${ranked[0].title || 'Your first loss-prevention step'} comes first` : 'Every loss-prevention step in your plan is done or set aside',
    body: ranked.length
      ? `${ranked.length} open step${ranked.length === 1 ? '' : 's'}, ranked by how serious the premium driver each one addresses is, then by priority, then by how ready you are to act. Prepared ${prepared}.${analysis.summary ? ` ${analysis.summary}` : ''}`
      : `${closed.length} step${closed.length === 1 ? ' is' : 's are'} done or skipped. Prepared ${prepared}.`,
    tone: 'DEFAULT', actions: [],
  }];
  if (ranked.length) blocks.push({
    type: 'GROUPED_LIST', filters: [], id: 'risk-plan-steps', title: 'Loss-prevention steps', description: 'Most important first. A step is work to do, not a saving: a carrier credit is shown only where the carrier confirmed it.',
    sections: [{ id: 'open', title: 'Open steps', count: ranked.length, items: riskPlanRows(ranked, drivers, money).slice(0, 100) as any, ...(ranked.length > 5 ? { initialVisibleCount: 5 } : {}) }], actions: [],
  });
  if (stale) blocks.push({ type: 'LIMITATION', id: 'risk-plan-stale', severity: 'CAUTION', title: 'This plan may be out of date', body: 'It was prepared before your policy or the home’s details changed, so some steps may no longer apply. Preparing a fresh one is not currently available in Ask.' });
  blocks.push(BOUNDARY);
  return { status: stale ? 'READY_WITH_LIMITATIONS' : 'ANSWERED', reasonCode: stale ? 'RISK_PLAN_MAY_BE_STALE' : undefined, blocks, suggestions: [] };
}

registerCapabilityHandler('risk-mitigation.plan', async (envelope) => riskMitigationPlanResult(envelope.userId, envelope.propertyId!));
