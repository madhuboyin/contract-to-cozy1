// Scanning a home for benefits and rebates inside Ask (parity with the desktop Benefits & rebates "Scan" and "Re-scan"). One declared step on the savings
// answer, a kind of the existing SAVINGS_BENEFIT_COMMAND, behind a review card and a confirmation, through the same HiddenAssetService the route calls.
// The scan is pure evaluation: it checks the reviewed programs that cover this home's area against what is on record for the home. It sends nothing anywhere
// and applies for nothing. It can add matches, and mark matches that no longer apply as expired or inactive; a match the household dismissed or is pursuing
// keeps its status. The service serves the home's primary owner only, refuses a second scan within five minutes, and Ask says each of these plainly.
import { createHash } from 'node:crypto';
import { HouseholdRole } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { type AskOperationResult } from '../askOperationRegistry';
import { type ConfirmCapabilityContext, type ConfirmCapabilityResult } from '../confirmCapabilityHandlerRegistry';
import { reconcileAskExecutionSideEffects } from '../execution/executeOperation';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { HiddenAssetService } from '../../hiddenAssets.service';

const CONFIRMATION_MINUTES = 30;
const SCAN_GUARD_MINUTES = 5;
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const database = prisma as any;
const hiddenAssetService = new HiddenAssetService();

export interface BenefitsScanLaunch { entityId: string; sourceExecutionId: string | null }

const backToSavings = { id: 'savings-benefit-back', label: 'Back to my savings', interactionType: 'START_WORKFLOW' as const, message: 'Show my savings opportunities', operationId: 'SAVINGS_OPPORTUNITIES' as const, style: 'SECONDARY' as const };
const blocked = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'BLOCKED', reasonCode, blocks: [{ type: 'SUMMARY', id: 'savings-scan-blocked', title, body, tone: 'CAUTION', actions: [] }], suggestions: [],
});
const unavailable = (reasonCode: string, title: string, body: string): AskOperationResult => ({
  status: 'NOT_APPLICABLE', reasonCode, blocks: [{ type: 'SUMMARY', id: 'savings-scan-unavailable', title, body, tone: 'DEFAULT', actions: [backToSavings] }], suggestions: [],
});
const stale = (message: string, code = 'ASK_CONFIRMATION_NOT_ACTIVE') => Object.assign(new Error(message), { code });

const isPrimaryOwner = async (userId: string, propertyId: string) =>
  Boolean(await database.property.findFirst({ where: { id: propertyId, homeownerProfile: { userId } }, select: { id: true } }));

/** The newest scan run, and whether one is already running within the service's own five-minute guard. */
async function scanState(propertyId: string) {
  const latest = await database.propertyHiddenAssetScanRun.findFirst({ where: { propertyId }, orderBy: { startedAt: 'desc' }, select: { id: true, status: true, startedAt: true } }) as { id: string; status: string; startedAt: Date } | null;
  const running = await database.propertyHiddenAssetScanRun.findFirst({
    where: { propertyId, status: 'RUNNING', startedAt: { gte: new Date(Date.now() - SCAN_GUARD_MINUTES * 60 * 1000) } }, select: { id: true },
  });
  return { latest, running: Boolean(running), version: sha(`savings:SCAN:${propertyId}:${latest?.id ?? 'none'}:${latest?.status ?? ''}`) };
}

/** What a finished scan says, in the desktop's own words: a scan that found nothing is a statement about the programs checked, never about the home. */
export function benefitsScanOutcome(result: { matchesFound: number; programsEvaluated: number; matchesExpired?: number; matchesInactivated?: number }): { title: string; description: string } {
  const noun = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const changes = [
    ...(result.matchesExpired ? [`${noun(result.matchesExpired, 'match expired', 'matches expired')}`] : []),
    ...(result.matchesInactivated ? [`${noun(result.matchesInactivated, 'match no longer applies', 'matches no longer apply')}`] : []),
  ];
  const tail = changes.length ? ` ${changes.join(' and ')} since the last scan.` : '';
  if (result.matchesFound > 0) return { title: 'Scan complete', description: `Found ${noun(result.matchesFound, 'potential benefit', 'potential benefits')} for this home.${tail}` };
  if (result.programsEvaluated === 0) {
    return { title: 'Scan complete', description: `No reviewed programs cover this home’s area yet. This is a coverage gap, not confirmation that no benefits exist.${tail}` };
  }
  return { title: 'Scan complete', description: `Checked ${noun(result.programsEvaluated, 'reviewed program', 'reviewed programs')} and none matched this home. That reflects the programs reviewed and what is on record for the home, not whether any benefit exists.${tail}` };
}

export async function benefitsScanResult(userId: string, propertyId: string, launch: BenefitsScanLaunch): Promise<AskOperationResult> {
  const access = await ensurePropertyAccess(userId, propertyId);
  if (access.role === HouseholdRole.VIEWER) return blocked('ASK_PERMISSION_REQUIRED', 'A contributor or owner can change savings records', 'Your role can view this home but not change it. Nothing has changed.');
  if (!await isPrimaryOwner(userId, propertyId)) {
    return blocked('SAVINGS_BENEFIT_PRIMARY_OWNER_ONLY', 'Only the home’s primary owner can scan for benefits', 'A benefits scan is kept for the home’s primary account holder. Nothing has changed.');
  }
  const state = await scanState(propertyId);
  if (state.running) return unavailable('SAVINGS_SCAN_IN_PROGRESS', 'A scan is already running', 'A scan started a moment ago for this home. Wait for it to finish, then ask again. Nothing has changed.');
  const expiresAt = new Date(Date.now() + CONFIRMATION_MINUTES * 60 * 1000);
  return {
    status: 'NEEDS_CONFIRMATION', reasonCode: 'SAVINGS_SCAN_CONFIRMATION_REQUIRED', contextVersion: state.version,
    parameters: { savingsCommand: { kind: 'SCAN', entityId: launch.entityId }, savingsContextVersion: state.version, sourceExecutionId: launch.sourceExecutionId, confirmationVersion: 1, confirmationExpiresAt: expiresAt.toISOString() },
    blocks: [{ type: 'SUMMARY', id: 'savings-scan-review', title: state.latest ? 'Scan this home for benefits again?' : 'Scan this home for benefits?', body: 'Nothing changes until you confirm.', tone: 'DEFAULT', actions: [] }],
    confirmation: {
      confirmationId: `savings-scan-${sha(`${propertyId}:${state.version}`).slice(0, 12)}-1`, version: 1,
      title: state.latest ? 'Scan this home for benefits again?' : 'Scan this home for benefits?',
      description: 'This checks the reviewed programs that cover this home’s area against what is on record for the home, for tax exemptions, rebates, discounts and similar programs. It can add new matches, and mark matches that no longer apply as expired or inactive; a match you dismissed or are pursuing keeps its status. Nothing is applied for and nothing is sent anywhere. A scan that finds nothing is not proof that no benefit exists.',
      fields: [{ label: 'Checks', value: 'Reviewed programs for this home’s area' }, { label: 'Last scan', value: state.latest ? state.latest.startedAt.toISOString().slice(0, 10) : 'Never scanned' }],
      editableFields: [], confirmLabel: state.latest ? 'Scan again' : 'Scan for benefits',
      consentText: 'I authorize this change to the shared home record.', expiresAt: expiresAt.toISOString(),
    },
    suggestions: [],
  };
}

export async function confirmBenefitsScan(ctx: ConfirmCapabilityContext): Promise<ConfirmCapabilityResult> {
  const { execution, userId, parameters } = ctx;
  const propertyId = execution.propertyId;
  if (!await isPrimaryOwner(userId, propertyId)) throw stale('Only the home’s primary owner can scan for benefits.', 'ASK_PERMISSION_REQUIRED');
  const state = await scanState(propertyId);
  if (parameters.savingsContextVersion !== state.version) throw stale('This home was scanned while the confirmation was open. Review it again and try again.', 'ASK_CONTEXT_VERSION_CONFLICT');
  let outcome: { title: string; description: string };
  let artifactId = propertyId;
  try {
    const result = await hiddenAssetService.refreshMatchesForProperty(propertyId, userId);
    outcome = benefitsScanOutcome(result);
    artifactId = result.scanRunId ?? propertyId;
  } catch (error) {
    // The service's own guard and refusals are written for a person.
    if (error instanceof Error && error.message === 'SCAN_IN_PROGRESS') throw stale('A scan is already running for this home. Wait a moment and try again.');
    if (error instanceof Error && !(error as { code?: unknown }).code) throw stale(error.message);
    throw error;
  }
  const result: AskOperationResult = {
    status: 'COMPLETED', reasonCode: 'SAVINGS_BENEFIT_SCAN_COMPLETED',
    blocks: [{ type: 'WORKFLOW_PROGRESS', id: `savings-scan-${artifactId}`, title: outcome.title, status: 'COMPLETED', description: outcome.description, details: [], actions: [{ ...backToSavings, label: 'See my savings', style: 'PRIMARY' as const }] }],
    suggestions: [],
  };
  const refresh = await reconcileAskExecutionSideEffects(userId, execution, parameters);
  if (refresh.attemptedAndFailed) {
    result.blocks.push({ type: 'LIMITATION', id: `savings-scan-refresh-failed-${artifactId}`, severity: 'CAUTION', title: 'Scanned; view could not refresh', body: 'The scan finished. The answer you were viewing could not refresh automatically, so ask for it again to see the results.' });
  }
  return { result, artifactType: 'SAVINGS_BENEFIT_SCAN', artifactId, refreshedExecutions: refresh.refreshedExecutions };
}
