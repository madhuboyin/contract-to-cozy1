const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

// ASK_COZY_INLINE_WORKSPACE_FRD v1.47: re-audit of the capabilities Appendix D listed as having no Ask operation. Two
// of them read the same canonical source as an existing operation and now launch into it; that exposed a stripped
// reserve-fund link and two renovation links pointing at /projects. Fake prisma throws on any model not given.

const prismaModule = require('../../src/lib/prisma.ts');
// Registers the capability handlers.
require('../../src/services/ask/askOrchestrator.service.ts');
const { capabilityInvoke } = require('../../src/services/ask/capabilityHandlerRegistry.ts');
const { isAskActionApplicable } = require('../../src/services/ask/askAnswerTrustPolicy.ts');
const { capabilityCardLaunch } = require('../../src/services/ask/askCapabilityCardLaunch.ts');
const { resolveAskRoutingCascade } = require('../../src/services/ask/askRoutingCascade.ts');
const renovationCases = require('../../src/services/renovationCase.service.ts');
const renovationReadiness = require('../../src/services/renovationReadiness.service.ts');
const { PermitTrackerService } = require('../../src/services/permitTracker.service.ts');
const propertyAccess = require('../../src/services/propertyAccess.service.ts');

const originals = { prisma: prismaModule.prisma, list: renovationCases.listRenovationCases, readiness: renovationReadiness.getReadiness, permits: PermitTrackerService.prototype.getPermitSummary, resolveAccess: propertyAccess.resolvePropertyAccess };
let cases;

function install() {
  cases = [{ id: 'case-bath', name: 'Bathroom remodel', updatedAt: new Date('2026-09-20') }];
  prismaModule.prisma = new Proxy({}, {
    get(_target, model) {
      if (model === 'then') return undefined;
      throw new Error(`Unexpected prisma.${String(model)} access`);
    },
  });
  renovationCases.listRenovationCases = async () => cases;
  renovationReadiness.getReadiness = async () => ({ summary: { state: 'NOT_READY' }, items: [{ id: 'req-1', title: 'Electrical permit', isBlocking: true, status: 'OPEN' }] });
  PermitTrackerService.prototype.getPermitSummary = async () => ({ totalPermits: 1, openFlags: 0 });
  propertyAccess.resolvePropertyAccess = async () => ({ role: 'OWNER', userId: 'u1', propertyId: 'p1' });
}

function restore() {
  prismaModule.prisma = originals.prisma;
  renovationCases.listRenovationCases = originals.list;
  renovationReadiness.getReadiness = originals.readiness;
  PermitTrackerService.prototype.getPermitSummary = originals.permits;
  propertyAccess.resolvePropertyAccess = originals.resolveAccess;
}

test.beforeEach(install);
test.afterEach(restore);

const readiness = () => capabilityInvoke('RENOVATION_PERMIT_READINESS', { userId: 'u1', propertyId: 'p1', message: 'Is my renovation ready to start?' });
const hrefs = (result) => result.blocks.flatMap((block) => (block.actions ?? []).map((action) => [action.id, action.href]));

test('the renovation case link opens that case\'s readiness page, not /projects', async () => {
  const links = hrefs(await readiness());
  assert.deepEqual(links.find(([id]) => id === 'open-case'), ['open-case', '/dashboard/properties/p1/renovations/case-bath/readiness']);
  assert.ok(!JSON.stringify(links).includes('/projects'), 'no renovation link points at /projects');
});

test('with no renovation case, "Start renovation planning" opens the Renovations page', async () => {
  cases = [];
  const links = hrefs(await readiness());
  assert.deepEqual(links.find(([id]) => id === 'start-renovation'), ['start-renovation', '/dashboard/properties/p1/renovations']);
});

test('the reserve-allocations "Open Reserve Fund" link survives the whitelist (it was always stripped)', () => {
  const action = { id: 'open-reserve-fund', label: 'Open Reserve Fund', href: '/dashboard/properties/p1/tools/reserve-fund', style: 'SECONDARY' };
  assert.equal(isAskActionApplicable({ action, operationId: 'CAPITAL_RESERVE_PLAN', propertyId: 'p1', householdRole: 'OWNER', authoritativeSourceAvailable: true }), true);
});

test('reserve-fund and the renovation advisor launch inline, and their messages route to those operations', () => {
  for (const [capabilityId, operationId] of [['reserve-fund', 'CAPITAL_RESERVE_PLAN'], ['home-renovation-risk-advisor', 'RENOVATION_PERMIT_READINESS']]) {
    const launch = capabilityCardLaunch(capabilityId).inlineLaunch;
    assert.equal(launch.operationId, operationId, capabilityId);
    assert.equal(resolveAskRoutingCascade(launch.message, { localRoutingEnabled: true }).operation.operationId, operationId, capabilityId);
  }
});

test('capabilities whose page reads different records than any Ask operation are not launched into a substitute', () => {
  // FRD v1.65: every capability the v1.47 re-audit held back now launches its own operation or, for emergency, the one
  // the product decision chose. A capability added to that held-back set again belongs in this loop.
  for (const capabilityId of []) {
    assert.equal(capabilityCardLaunch(capabilityId).inlineLaunch, null, capabilityId);
  }
  // FRD v1.61: home-timeline now launches HOME_TIMELINE_EVENTS, its own operation reading the page's own records
  // (listHomeEvents), not a substitute.
  assert.equal(capabilityCardLaunch('home-timeline').inlineLaunch.operationId, 'HOME_TIMELINE_EVENTS');
  // FRD v1.62: material-specs now launches MATERIAL_SPECS_LIST, its own operation reading the page's own records
  // (listSpecs), not the document-promotion operations the bridge also maps to it.
  assert.equal(capabilityCardLaunch('material-specs').inlineLaunch.operationId, 'MATERIAL_SPECS_LIST');
  // FRD v1.63: property-brief now launches PROPERTY_BRIEFS_LIST, its own operation reading the page's own records
  // (listPropertyBriefs), not the PROPERTY_SUMMARY/MAJOR_EVENT_ENTRY operations the bridge also maps to it.
  assert.equal(capabilityCardLaunch('property-brief').inlineLaunch.operationId, 'PROPERTY_BRIEFS_LIST');
  // FRD v1.64 (product decision, option A): emergency launches INCIDENT_CONTINUATION. Its page is an AI chat with no
  // records of its own; the answer carries a labelled handoff to it rather than substituting for it.
  assert.equal(capabilityCardLaunch('emergency').inlineLaunch.operationId, 'INCIDENT_CONTINUATION');
  // FRD v1.65 (product decision, option A): guidance-overview launches GUIDANCE_JOURNEYS_LIST, reading the page's own
  // getPropertyGuidance, not GUIDANCE_JOURNEY_CREATE, which the bridge also maps to it.
  assert.equal(capabilityCardLaunch('guidance-overview').inlineLaunch.operationId, 'GUIDANCE_JOURNEYS_LIST');
});
