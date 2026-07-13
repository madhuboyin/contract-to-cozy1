// apps/backend/src/modules/personalization/infrastructure/dailyPulseComparisonRepository.ts
//
// Read-only lookup of Daily Pulse's current PropertyMicroAction state, for
// the migration step 5 shadow-diagnostic comparison. Deliberately queries
// the PropertyMicroAction table directly rather than calling anything in
// dailyHomePulse.service.ts — that service's public methods have creation
// side effects (selectOrCreateMicroAction), which a read-only comparison
// must not trigger.
import { prisma } from '../../../lib/prisma';

export interface DailyPulseHvacFilterState {
  hasActiveHvacFilterCheckAction: boolean;
  actionId?: string;
}

/** Does Daily Pulse currently have a PENDING HVAC_FILTER_CHECK micro-action for this property? */
export async function loadDailyPulseHvacFilterCheckState(
  propertyId: string,
): Promise<DailyPulseHvacFilterState> {
  const action = await prisma.propertyMicroAction.findFirst({
    where: {
      propertyId,
      type: 'HVAC_FILTER_CHECK',
      status: 'PENDING',
    },
    orderBy: { suggestedAt: 'desc' },
    select: { id: true },
  });

  return {
    hasActiveHvacFilterCheckAction: !!action,
    actionId: action?.id,
  };
}
