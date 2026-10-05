// Seasonal home care (exact-four starter source, inventory D-O4/D-O16). A launch-only read (SEASONAL_HOME_CARE is non-routable): it
// registers the canonical call the operation resolves to and delegates to the pure builder in support/seasonalHomeCare.ts. It reads the
// property's zip code and any saved climate region, nothing else about the home.
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { prisma } from '../../../lib/prisma';
import { buildSeasonalHomeCareResult, type SeasonalClimateRegion, type SeasonalHomeCareFocus } from '../support/seasonalHomeCare';

/** The two stored starter messages. The launch's message, not a routing guess, decides which season is shown. */
export const SEASONAL_HOME_CARE_THIS_SEASON_MESSAGE = 'What home care should I do this season?';
export const SEASONAL_HOME_CARE_NEXT_SEASON_MESSAGE = 'What should I do to get ready for next season?';

const NEXT_SEASON_PATTERN = /\bnext season\b|\bget(?:ting)? ready for (?:the )?(?:next|coming|upcoming)\b|\bupcoming season\b/i;

export function seasonalHomeCareFocus(message: string): SeasonalHomeCareFocus {
  return NEXT_SEASON_PATTERN.test(message) ? 'NEXT_SEASON' : 'THIS_SEASON';
}

async function seasonalHomeCareResult(propertyId: string, message: string, now: Date): Promise<AskOperationResult> {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { zipCode: true, climateSetting: { select: { climateRegion: true } } } });
  if (!property) {
    return {
      status: 'UNAVAILABLE', reasonCode: 'SEASONAL_HOME_CARE_PROPERTY_NOT_FOUND',
      blocks: [{ type: 'SUMMARY', id: 'seasonal-home-care-unavailable', title: 'This home could not be found', body: 'I could not load the selected home, so I cannot show seasonal care for it.', tone: 'CAUTION', actions: [] }],
      suggestions: [],
    };
  }
  return buildSeasonalHomeCareResult({
    zipCode: property.zipCode,
    savedClimateRegion: (property.climateSetting?.climateRegion ?? null) as SeasonalClimateRegion | null,
    now,
    focus: seasonalHomeCareFocus(message),
  });
}

registerCapabilityHandler('seasonal.home-care', async (envelope) => seasonalHomeCareResult(envelope.propertyId!, envelope.message, new Date()));
