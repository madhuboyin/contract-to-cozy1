// Home basics (exact-four starter source, inventory D-O4). A launch-only read (HOME_BASICS_GUIDE is non-routable) over the pure authored
// builder in support/homeBasicsGuide.ts. The authored content reads nothing about the home; the handler only verifies the caller's existing access
// so mutation launchers are omitted for viewers.
import { HouseholdRole } from '@prisma/client';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { buildHomeBasicsResult, homeBasicsFocus, HOME_BASICS_MONTHLY_MESSAGE, HOME_BASICS_SAFETY_MESSAGE } from '../support/homeBasicsGuide';

export { HOME_BASICS_MONTHLY_MESSAGE, HOME_BASICS_SAFETY_MESSAGE };

registerCapabilityHandler('home-basics.guide', async (envelope, deps) => {
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, envelope.propertyId!);
  return buildHomeBasicsResult(homeBasicsFocus(envelope.message), access.role !== HouseholdRole.VIEWER);
});
