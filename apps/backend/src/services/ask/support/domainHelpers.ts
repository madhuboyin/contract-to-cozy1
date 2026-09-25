// Ask handler support: domainHelpers. Moved out of askHandlerSupport.ts unchanged (FRD v1.110); that file re-exports these modules.
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { HouseholdRole } from '@prisma/client';
import { type AskOperationId, type AskOperationResult } from '../askOperationRegistry';
import { skillContextProviderKey } from '../../skills/context/skillContextProviderRegistry';
import { PROPERTY_JOURNEY_CONTEXT_PROVIDER, type PropertyJourneyContext } from '../../skills/context/propertyJourneyContext.contract';
import type { ComposedSkillContext } from '../../skills/context/skillContext.contract';
import { APIError } from '../../../middleware/error.middleware';
import { radarQueryService } from '../../../modules/homeEventRadar/services/radarQuery.service';
import { InvitableHouseholdRole } from './commandInputs';

// F05 fix, extracted as a pure function for direct unit testing (same
// convention as parseRefinanceScenarioEdit/isAllPropertyAttentionRequest --
// this is the "brain" of the fix; capitalReservePlanResult's DB fetches
// around it are not independently testable without a live database). See
// the F05 fix comment inside capitalReservePlanResult for why this must
// compare against getFinancialContextDecisions's contextVersion specifically,
// not evaluateFeatureContext's.
export function isCapitalTimelineAnalysisStale(
  analysis: { inputsSnapshot: unknown } | null | undefined,
  currentContextVersion: string,
): boolean {
  if (!analysis) return false;
  const storedContextVersion = analysis.inputsSnapshot && typeof analysis.inputsSnapshot === 'object' && !Array.isArray(analysis.inputsSnapshot)
    ? (analysis.inputsSnapshot as Record<string, unknown>)._propertyContextVersion
    : undefined;
  return storedContextVersion !== currentContextVersion;
}

// Home Capital Timeline "re-run with a different horizon" write (FRD Appendix D
// planning/refinement follow-up): the traditional page's ONLY real
// homeowner-facing "different assumptions" lever is this 5yr/10yr toggle
// (CapitalTimelineClient.tsx's `([5, 10] as const)` -- confirmed no other
// horizon and no homeowner-editable rate/assumption-set control exists
// anywhere in the app). Parsed the same way propertyTaxAppealReadinessResult
// parses `ground` from free text, and exported for direct unit testing per
// this file's own isCapitalTimelineAnalysisStale/parseRefinanceScenarioEdit
// convention.
export function parseCapitalTimelineHorizonRequest(message: string): 5 | 10 | null {
  if (/\b5[\s-]*year/i.test(message)) return 5;
  if (/\b10[\s-]*year/i.test(message)) return 10;
  return null;
}

// Shared with confirmBuyerFindingDisposition's own result copy, so the
// conflict message and the eventual success message describe a
// disposition the same way, not two independently-maintained label sets.
export const BUYER_FINDING_DISPOSITION_LABELS: Record<string, string> = {
  VERIFIED_FACT: 'verified fact', PRE_CLOSE_NEGOTIATION: 'seller negotiation', POST_CLOSE_ACTION: 'post-close work', DISMISSED: 'dismissed', PENDING_REVIEW: 'pending review',
};

export function durableFreeTextClarification(operationId: AskOperationId, question: string): Pick<AskOperationResult, 'clarification' | 'parameters'> {
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  return {
    clarification: { version: 1, question, options: [], allowFreeText: true, expiresAt },
    parameters: { clarification: { version: 1, candidateOperationIds: [operationId], expiresAt } },
  };
}

export function journeyContextFrom(composedContext: ComposedSkillContext | null): PropertyJourneyContext | null {
  if (!composedContext) return null;
  const value = composedContext.values[skillContextProviderKey(PROPERTY_JOURNEY_CONTEXT_PROVIDER)];
  if (!value || typeof value !== 'object') return null;
  return value as PropertyJourneyContext;
}

// Canonical re-read of one match for this user; null when it no longer exists for this property.
export async function loadRadarMatchForWrite(propertyId: string, matchId: string, userId: string): Promise<Record<string, any> | null> {
  try {
    return await radarQueryService.getDetail(propertyId, matchId, userId) as Record<string, any>;
  } catch (error) {
    if (error instanceof APIError && error.code === 'RADAR_MATCH_NOT_FOUND') return null;
    throw error;
  }
}

export function exactEntityMatch<T extends { id: string }>(rows: readonly T[], message: string, launchContext?: CreateAskExecutionRequest['launchContext']): T | null {
  const launched = launchContext?.entityId ? rows.find((row) => row.id === launchContext.entityId) : null;
  if (launched) return launched;
  const normalized = message.toLowerCase();
  const matches = rows.filter((row) => {
    const label = 'title' in row && typeof row.title === 'string' ? row.title : 'homeSystem' in row && typeof row.homeSystem === 'string' ? row.homeSystem : '';
    return normalized.includes(row.id.toLowerCase()) || (label.length >= 3 && normalized.includes(label.toLowerCase()));
  });
  return matches.length === 1 ? matches[0] : null;
}

export function invitationRoleCopy(role: InvitableHouseholdRole): string {
  return role === HouseholdRole.CONTRIBUTOR
    ? 'Contributor — can view records, complete tasks, log events, and add inventory'
    : 'Viewer — read-only access; cannot create or modify home records';
}

// Ask Intelligence FRD Phase 9A ("What changed?", §16). Reads the existing
// PropertyChange ledger (FRD §16's HomeChangeView, see propertyChange.service.ts)
// rather than a new store -- this operation is a thin presentation layer over
// already-governed materiality/dedup/supersession, not a second change system.
export const HOME_CHANGE_SUMMARY_WINDOW_DAYS = 30;
