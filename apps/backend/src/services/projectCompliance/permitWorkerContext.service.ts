import { prisma } from '../../lib/prisma';
import { getProjectComplianceContextDecisions } from './context';
import type { ProjectComplianceWorkInput } from './workScope';

export interface PermitWorkerContextResult {
  allowed: boolean;
  contextVersion: string | null;
  userId: string | null;
  reasonCodes: string[];
}

export async function checkPermitWorkerContext(
  propertyId: string,
  work: ProjectComplianceWorkInput = {},
  requireOwnerAction = false,
): Promise<PermitWorkerContextResult> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { homeownerProfile: { select: { userId: true } } },
  });
  const userId = property?.homeownerProfile?.userId ?? null;
  if (!userId) {
    return {
      allowed: false,
      contextVersion: null,
      userId: null,
      reasonCodes: ['PROPERTY_OWNER_CONTEXT_UNAVAILABLE'],
    };
  }

  const context = await getProjectComplianceContextDecisions(
    propertyId,
    userId,
    'PERMIT_TRACKER',
    work,
  );
  const decisions = [context.decisions.permitTracking];
  if (requireOwnerAction) decisions.push(context.decisions.ownerProjectExecution);
  const blocked = decisions.find((decision) => decision.status !== 'APPLICABLE');

  return {
    allowed: !blocked,
    contextVersion: context.contextVersion,
    userId,
    reasonCodes: blocked?.reasonCodes ?? ['PERMIT_WORKER_CONTEXT_APPLICABLE'],
  };
}
