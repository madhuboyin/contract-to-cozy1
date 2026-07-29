import { NextFunction, Response } from 'express';
import { CustomRequest } from '../types';
import {
  confirmQuoteProposal,
  createQuoteProposal,
  createQuoteProposalFromDocument,
  getOrCreateQuoteComparisonWorkspace,
  getQuoteComparisonWorkspace,
  getWorkspaceComparability,
  addQuoteDecisionContextLink,
  selectQuoteForDecision,
  transitionQuoteDecision,
  updateQuoteProposal,
  createQuoteClarification,
  deleteQuoteProposal,
  resolveQuoteClarification,
  setQuoteProposalDisposition,
} from '../services/quoteComparison.service';
import {
  assertProjectComplianceDecisionsApplicable,
  getProjectComplianceEnvelope,
} from '../services/projectCompliance/context';

async function assertQuoteComparisonMutationAllowed(
  propertyId: string,
  userId: string,
  serviceCategory?: string | null,
) {
  await assertProjectComplianceDecisionsApplicable(
    propertyId,
    userId,
    'QUOTE_COMPARISON',
    { serviceCategory: serviceCategory ?? 'UNSPECIFIED' },
    ['quoteComparison', 'providerBooking'],
  );
}

export async function getOrCreateWorkspace(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(
      req.params.propertyId,
      req.user!.userId,
      req.body.serviceCategory,
    );
    const result = await getOrCreateQuoteComparisonWorkspace(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    const propertyContext = await getProjectComplianceEnvelope(
      req.params.propertyId,
      req.user!.userId,
      'QUOTE_COMPARISON',
      { serviceCategory: req.body.serviceCategory },
    );
    res.status(result.reused ? 200 : 201).json({
      success: true,
      data: { ...result, propertyContext },
    });
  } catch (error) {
    next(error);
  }
}

export async function getWorkspace(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const workspace = await getQuoteComparisonWorkspace(req.params.propertyId, req.params.workspaceId);
    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
}

export async function addQuoteProposal(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(
      req.params.propertyId,
      req.user!.userId,
      req.body.serviceCategory,
    );
    const quote = await createQuoteProposal(req.params.propertyId, req.params.workspaceId, req.body);
    res.status(201).json({ success: true, data: { quote } });
  } catch (error) {
    next(error);
  }
}

export async function updateQuote(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(
      req.params.propertyId,
      req.user!.userId,
      req.body.serviceCategory,
    );
    const quote = await updateQuoteProposal(
      req.params.propertyId,
      req.params.workspaceId,
      req.params.quoteId,
      req.body,
    );
    res.json({ success: true, data: { quote } });
  } catch (error) {
    next(error);
  }
}

export async function addQuoteFromDocument(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const quote = await createQuoteProposalFromDocument(
      req.params.propertyId,
      req.params.workspaceId,
      req.user!.userId,
      req.body.documentId,
    );
    res.status(201).json({ success: true, data: { quote } });
  } catch (error) {
    next(error);
  }
}

export async function confirmQuote(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const quote = await confirmQuoteProposal(
      req.params.propertyId,
      req.params.workspaceId,
      req.params.quoteId,
      req.user!.userId,
    );
    res.json({ success: true, data: { quote } });
  } catch (error) {
    next(error);
  }
}

export async function getComparability(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    const comparability = await getWorkspaceComparability(req.params.propertyId, req.params.workspaceId);
    res.json({ success: true, data: { comparability } });
  } catch (error) {
    next(error);
  }
}

export async function selectQuote(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const workspace = await selectQuoteForDecision(
      req.params.propertyId,
      req.params.workspaceId,
      req.body.quoteId,
      req.user!.userId,
    );
    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
}

export async function transitionDecision(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const workspace = await transitionQuoteDecision(
      req.params.propertyId,
      req.params.workspaceId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
}

export async function addContextLink(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const contextLink = await addQuoteDecisionContextLink(
      req.params.propertyId,
      req.params.workspaceId,
      req.body,
    );
    res.status(201).json({ success: true, data: { contextLink } });
  } catch (error) {
    next(error);
  }
}

export async function deleteQuote(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    await deleteQuoteProposal(
      req.params.propertyId,
      req.params.workspaceId,
      req.params.quoteId,
      req.user!.userId,
    );
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function setQuoteDisposition(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const workspace = await setQuoteProposalDisposition(
      req.params.propertyId,
      req.params.workspaceId,
      req.params.quoteId,
      req.user!.userId,
      req.body.decision,
    );
    res.json({ success: true, data: { workspace } });
  } catch (error) {
    next(error);
  }
}

export async function addClarification(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const clarification = await createQuoteClarification(
      req.params.propertyId,
      req.params.workspaceId,
      req.params.quoteId,
      req.user!.userId,
      req.body.question,
    );
    res.status(201).json({ success: true, data: { clarification } });
  } catch (error) {
    next(error);
  }
}

export async function resolveClarification(req: CustomRequest, res: Response, next: NextFunction) {
  try {
    await assertQuoteComparisonMutationAllowed(req.params.propertyId, req.user!.userId);
    const clarification = await resolveQuoteClarification(
      req.params.propertyId,
      req.params.workspaceId,
      req.params.quoteId,
      req.params.clarificationId,
      req.user!.userId,
      req.body.response,
    );
    res.json({ success: true, data: { clarification } });
  } catch (error) {
    next(error);
  }
}
