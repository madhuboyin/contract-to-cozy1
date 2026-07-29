import type { NextFunction, Response } from 'express';
import type { CustomRequest as Request } from '../types';
import * as service from '../services/renovationCase.service';
import * as exploreService from '../services/renovationExplore.service';
import * as requirementService from '../services/renovationRequirement.service';
import * as complianceService from '../services/renovationComplianceWorkflow.service';

export async function getComplianceWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.getComplianceWorkflow(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function attachComplianceRecord(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.attachComplianceRecord(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createComplianceCondition(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.createCondition(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function updateComplianceCondition(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.updateCondition(
      req.params.propertyId,
      req.params.caseId,
      req.params.conditionId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createHoaDocumentReview(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.createHoaDocumentReview(
      req.params.propertyId,
      req.params.caseId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function reviewHoaDocumentExtraction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await complianceService.reviewHoaDocumentExtraction(
      req.params.propertyId,
      req.params.caseId,
      req.params.reviewId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function generateRequirements(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await requirementService.generateRequirementCandidates(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function listRequirements(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await requirementService.listRequirements(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function determineRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await requirementService.determineRequirement(
      req.params.propertyId,
      req.params.caseId,
      req.params.requirementId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createAuthorityProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await requirementService.upsertAuthorityProfile(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function listAuthorityProfiles(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await requirementService.listAuthorityProfiles(
      req.params.propertyId,
      req.params.caseId,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createExploration(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await exploreService.createExploration(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getExploration(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await exploreService.getExploration(
      req.params.propertyId,
      req.params.explorationId,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function updateOptionDisposition(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await exploreService.updateOptionDisposition(
      req.params.propertyId,
      req.params.explorationId,
      req.params.optionId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function convertOptionToCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await exploreService.convertOptionToCase(
      req.params.propertyId,
      req.params.explorationId,
      req.params.optionId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function listCases(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listRenovationCases(
      req.params.propertyId,
      req.query.includeArchived === 'true',
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createRenovationCase(
      req.params.propertyId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function getCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.getRenovationCase(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function updateCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.updateRenovationCase(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function transitionCase(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.transitionRenovationCase(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.json({ success: true, data });
  } catch (error) { next(error); }
}

export async function archiveCase(req: Request, res: Response, next: NextFunction) {
  try {
    await service.archiveRenovationCase(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body.reason,
    );
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function createScopeVersion(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.createScopeVersion(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function createLink(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.linkContributor(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function deleteLink(req: Request, res: Response, next: NextFunction) {
  try {
    await service.unlinkContributor(
      req.params.propertyId,
      req.params.caseId,
      req.params.linkId,
      req.user!.userId,
    );
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function addParticipant(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.addParticipant(
      req.params.propertyId,
      req.params.caseId,
      req.user!.userId,
      req.body,
    );
    res.status(201).json({ success: true, data });
  } catch (error) { next(error); }
}

export async function removeParticipant(req: Request, res: Response, next: NextFunction) {
  try {
    await service.removeParticipant(
      req.params.propertyId,
      req.params.caseId,
      req.params.participantId,
      req.user!.userId,
    );
    res.status(204).send();
  } catch (error) { next(error); }
}

export async function listEvents(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await service.listRenovationCaseEvents(req.params.propertyId, req.params.caseId);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}
