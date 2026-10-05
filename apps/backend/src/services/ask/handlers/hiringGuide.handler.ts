// Hiring guide (exact-four starter source, inventory D-O4). A launch-only read (HIRING_GUIDE is non-routable) over the pure authored builder
// in support/hiringGuide.ts. It reads nothing about the home: no database, no external call.
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { buildHiringGuideResult, HIRING_GUIDE_MESSAGE } from '../support/hiringGuide';

export { HIRING_GUIDE_MESSAGE };

registerCapabilityHandler('hiring-guide.read', async () => buildHiringGuideResult());
