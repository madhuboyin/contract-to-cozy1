// Seasonal home care (exact-four starter source, inventory D-O4/D-O16). A launch-only read (SEASONAL_HOME_CARE is non-routable): it
// registers the canonical call the operation resolves to and delegates to the pure builders in support/seasonalHomeCare.ts. It reads the
// property's zip code and any saved climate region for the general tasks, and (only to decide which next steps to offer) whether the
// homeowner may set up the season's checklist and whether it already exists. It reads nothing about the home's systems.
import { HouseholdRole, type Season } from '@prisma/client';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { prisma } from '../../../lib/prisma';
import { type CreateAskExecutionRequest } from '../../../productFramework/ask/ask.contract';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { supportsOwnershipCare } from '../../entryContextPolicy';
import {
  buildSeasonalHomeCareResult, buildSeasonalTaskWalkthrough, parseSeasonalTaskEntityId, SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE,
  SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE, SEASONAL_TASK_ENTITY_TYPE, seasonalPlanWindow,
  type SeasonalClimateRegion, type SeasonalHomeCareFocus, type SeasonalSetupContext,
} from '../support/seasonalHomeCare';

export { SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE, SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE };

const NEXT_SEASON_PATTERN = /\bnext season\b|\bget(?:ting)? ready for (?:the )?(?:next|coming|upcoming)\b|\bupcoming season\b/i;

export function seasonalHomeCareFocus(message: string): SeasonalHomeCareFocus {
  return NEXT_SEASON_PATTERN.test(message) ? 'NEXT_SEASON' : 'THIS_SEASON';
}

// Who may set up the season's checklist, and whether it already exists. Mirrors what the generator itself requires (an owner of an
// existing home with automatic checklists on); the setup command re-checks all of it, this only decides which buttons are offered.
async function seasonalSetupContext(
  userId: string,
  propertyId: string,
  property: { onboarding?: { entryPath?: string | null; ownershipState?: string | null } | null; climateSetting?: { autoGenerateChecklists?: boolean | null } | null },
  plan: { season: Season; year: number },
): Promise<SeasonalSetupContext> {
  const access = await ensurePropertyAccess(userId, propertyId);
  const checklist = await prisma.seasonalChecklist.findUnique({
    where: { propertyId_season_year: { propertyId, season: plan.season, year: plan.year } },
    select: { totalTasks: true, tasksAdded: true },
  });
  const ownershipCare = supportsOwnershipCare({ entryPath: property.onboarding?.entryPath, ownershipState: property.onboarding?.ownershipState });
  return {
    canSetUp: access.role === HouseholdRole.OWNER && ownershipCare && property.climateSetting?.autoGenerateChecklists !== false,
    checklist: checklist ? { totalTasks: checklist.totalTasks, tasksAdded: checklist.tasksAdded } : null,
  };
}

async function seasonalHomeCareResult(userId: string, propertyId: string, message: string, now: Date, launchContext?: CreateAskExecutionRequest['launchContext']): Promise<AskOperationResult> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      zipCode: true,
      climateSetting: { select: { climateRegion: true, autoGenerateChecklists: true } },
      onboarding: { select: { entryPath: true, ownershipState: true } },
    },
  });
  if (!property) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'SEASONAL_HOME_CARE_PROPERTY_NOT_FOUND',
      blocks: [{ type: 'SUMMARY', id: 'seasonal-home-care-unavailable', title: 'This home could not be found', body: 'I could not load the selected home, so I cannot show seasonal care for it.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  const base = {
    zipCode: property.zipCode,
    savedClimateRegion: (property.climateSetting?.climateRegion ?? null) as SeasonalClimateRegion | null,
    now,
  };
  // "Walk me through" a task: launched from the plan with the task's own entity id, which also carries which plan it belongs to.
  const task = launchContext?.entityType === SEASONAL_TASK_ENTITY_TYPE ? parseSeasonalTaskEntityId(launchContext.entityId) : null;
  const focus = task?.focus ?? seasonalHomeCareFocus(message);
  const setup = await seasonalSetupContext(userId, propertyId, property, seasonalPlanWindow(now, focus));
  if (task) {
    const walkthrough = buildSeasonalTaskWalkthrough({ ...base, focus: task.focus, taskKey: task.taskKey, setup });
    if (walkthrough) return walkthrough;
  }
  return buildSeasonalHomeCareResult({ ...base, focus, setup });
}

registerCapabilityHandler('seasonal.home-care', async (envelope) => seasonalHomeCareResult(envelope.userId, envelope.propertyId!, envelope.message, new Date(), envelope.launchContext));
