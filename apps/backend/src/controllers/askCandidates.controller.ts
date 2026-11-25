// BICC-BUY-002/004/005: the buyer's candidate homes, over HTTP. Everything is scoped to the authenticated person; the ask router already requires an Ask-eligible account (D09).
// A candidate is not a Property: nothing here takes a propertyId.
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../types/auth.types';
import { APIError } from '../middleware/error.middleware';
import { candidatePropertyService, type CandidateInput, type CandidatePatch } from '../services/ask/buyer/candidateProperty.service';
import { candidatePromotionService } from '../services/ask/buyer/candidatePromotion.service';
import { candidateComparisonStateService } from '../services/ask/buyer/candidateComparisonState.service';
import { buyerCostBreakdown, compareCandidates, COMPARISON_DIMENSIONS, type CandidateFacts } from '../services/ask/buyer/candidateComparison';

const need = (req: AuthRequest): string => { if (!req.user) throw new APIError('Authentication required.', 401, 'AUTH_REQUIRED'); return req.user.userId; };
const body = (req: AuthRequest): Record<string, unknown> => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {});
const toFacts = (row: Record<string, unknown>): CandidateFacts => row as unknown as CandidateFacts;

export async function listAskCandidates(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const status = req.query.status === 'ARCHIVED' ? 'ARCHIVED' : req.query.status === 'PROMOTED' ? 'PROMOTED' : 'ACTIVE';
    return res.json({ success: true, data: { candidates: await candidatePropertyService.list(need(req), status), dimensions: COMPARISON_DIMENSIONS.map(({ key, label }) => ({ key, label })) } });
  } catch (error) { return next(error); }
}

export async function createAskCandidate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const input = body(req) as unknown as CandidateInput;
    return res.status(201).json({ success: true, data: await candidatePropertyService.create(need(req), input, 'USER_ENTERED') });
  } catch (error) { return next(error); }
}

export async function updateAskCandidate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    return res.json({ success: true, data: await candidatePropertyService.update(need(req), req.params.candidateId, body(req) as CandidatePatch, 'USER_ENTERED') });
  } catch (error) { return next(error); }
}

export async function deleteAskCandidate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await candidatePropertyService.remove(need(req), req.params.candidateId);
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) { return next(error); }
}

export async function compareAskCandidates(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const userId = need(req);
    const { candidateIds, dimensions } = body(req);
    if (!Array.isArray(candidateIds) || candidateIds.length < 2 || candidateIds.length > 6 || !candidateIds.every((id) => typeof id === 'string')) throw new APIError('Choose between two and six of your homes to compare.', 400, 'CANDIDATE_COMPARE_INVALID');
    if (!Array.isArray(dimensions) || !dimensions.every((key) => typeof key === 'string')) throw new APIError('Choose what to compare.', 400, 'CANDIDATE_COMPARE_INVALID');
    const unique = [...new Set(candidateIds as string[])];
    const rows = await Promise.all(unique.map((id) => candidatePropertyService.get(userId, id)));
    // One id that is not the caller's (or does not exist) fails the whole request the same way, so it cannot be used to probe for other people's homes.
    if (rows.some((row) => !row)) throw new APIError('One of those homes was not found.', 404, 'CANDIDATE_NOT_FOUND');
    const result = compareCandidates(rows.map((row) => toFacts(row as unknown as Record<string, unknown>)), dimensions as string[]);
    if ('error' in result) throw new APIError(result.error === 'NEED_AT_LEAST_TWO' ? 'Choose at least two different homes to compare.' : 'None of those items can be compared.', 400, 'CANDIDATE_COMPARE_INVALID');
    return res.json({ success: true, data: result });
  } catch (error) { return next(error); }
}

export async function getAskCandidateCost(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const row = await candidatePropertyService.get(need(req), req.params.candidateId);
    if (!row) throw new APIError('That home was not found.', 404, 'CANDIDATE_NOT_FOUND');
    return res.json({ success: true, data: buyerCostBreakdown(toFacts(row as unknown as Record<string, unknown>)) });
  } catch (error) { return next(error); }
}

/** BUY-007 step 1: what promoting would create. Writes nothing. */
export async function reviewAskCandidatePromotion(req: AuthRequest, res: Response, next: NextFunction) {
  try { return res.json({ success: true, data: await candidatePromotionService.review(need(req), req.params.candidateId) }); } catch (error) { return next(error); }
}

/** BUY-007 step 2: explicit confirmation carrying the review's token. */
export async function confirmAskCandidatePromotion(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { token, linkToExistingHome, targetCloseDate } = body(req);
    if (typeof token !== 'string' || !token) throw new APIError('Review the home before moving it.', 400, 'CANDIDATE_PROMOTION_INVALID');
    if (targetCloseDate !== undefined && targetCloseDate !== null && (typeof targetCloseDate !== 'string' || Number.isNaN(Date.parse(targetCloseDate)))) throw new APIError('Enter a valid closing date.', 400, 'CANDIDATE_PROMOTION_INVALID');
    const result = await candidatePromotionService.confirm(need(req), req.params.candidateId, { token, linkToExistingHome: linkToExistingHome === true, targetCloseDate: typeof targetCloseDate === 'string' ? new Date(targetCloseDate).toISOString() : null });
    return res.status(201).json({ success: true, data: result });
  } catch (error) { return next(error); }
}

/** BUY-007: delete the candidate record of a home that was moved to "my homes". The home itself is untouched. */
export async function deleteAskPromotedCandidateRecord(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await candidatePropertyService.removePromotedRecord(need(req), req.params.candidateId);
    return res.json({ success: true, data: { deleted: true } });
  } catch (error) { return next(error); }
}

/** BUY-002: the saved comparison (null when none, or when fewer than two of its homes are still active). */
export async function getAskCandidateComparison(req: AuthRequest, res: Response, next: NextFunction) {
  try { return res.json({ success: true, data: { comparison: await candidateComparisonStateService.get(need(req)) } }); } catch (error) { return next(error); }
}

export async function saveAskCandidateComparison(req: AuthRequest, res: Response, next: NextFunction) {
  try { return res.json({ success: true, data: { comparison: await candidateComparisonStateService.save(need(req), body(req) as { candidateIds: unknown; dimensions: unknown }) } }); } catch (error) { return next(error); }
}

export async function clearAskCandidateComparison(req: AuthRequest, res: Response, next: NextFunction) {
  try { await candidateComparisonStateService.clear(need(req)); return res.json({ success: true, data: { comparison: null } }); } catch (error) { return next(error); }
}
