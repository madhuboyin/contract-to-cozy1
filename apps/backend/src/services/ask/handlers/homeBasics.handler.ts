// Home basics (exact-four starter source, inventory D-O4). A launch-only read (HOME_BASICS_GUIDE is non-routable) over the pure authored
// builder in support/homeBasicsGuide.ts. It reads nothing about the home: no database, no external call.
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { buildHomeBasicsResult, homeBasicsFocus, HOME_BASICS_MONTHLY_MESSAGE, HOME_BASICS_SAFETY_MESSAGE } from '../support/homeBasicsGuide';

export { HOME_BASICS_MONTHLY_MESSAGE, HOME_BASICS_SAFETY_MESSAGE };

registerCapabilityHandler('home-basics.guide', async (envelope) => buildHomeBasicsResult(homeBasicsFocus(envelope.message)));
