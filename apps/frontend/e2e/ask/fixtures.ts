import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = 'ask-property-fixture';
const apiOrigin = 'http://localhost:8080';

function capabilityExecution(unavailable = false) {
  const capability = {
    id: 'mortgage-refinance-radar', label: 'Mortgage Refinance Radar',
    description: 'Watch this mortgage for a refinance opportunity and compare the real tradeoffs.',
    expectedOutput: 'A property-specific opportunity conclusion and recorded refinance decision.',
    href: `/dashboard/properties/${propertyId}/tools/mortgage-refinance-radar`,
    readiness: unavailable ? 'UNAVAILABLE' : 'NEEDS_CONTEXT',
    readinessLabel: unavailable ? 'Not ready for the current context' : 'More home details will improve the result',
    readinessReasons: unavailable ? ['This tool is disabled by the current rollout policy.'] : ['Add current mortgage facts before running a comparison.'],
    releaseStage: 'ACTIVE',
  };
  return {
    schemaVersion: '1.0', executionId: `execution-capability-${unavailable ? 'unavailable' : 'ready'}`, sessionId: 'ask-acceptance-session', question: 'Is there a tool to help with refinancing?',
    status: unavailable ? 'UNAVAILABLE' : 'ANSWERED', property: { id: propertyId, label: 'Acceptance Home' }, operation: { id: 'CAPABILITY_DISCOVERY', version: '1.0', family: 'CAPABILITY_DISCOVERY' },
    contextVersion: 'capability-context-v1', blocks: unavailable
      ? [{ type: 'CAPABILITY_LIST', id: 'unavailable-capability', title: 'Requested tool availability', description: 'Unavailable tools are never presented as launchable.', capabilities: [capability] }]
      : [
        { type: 'CAPABILITY_LIST', id: 'capability-matches', title: 'Best match for your goal', description: 'Ranked from reviewed homeowner language.', capabilities: [capability] },
        { type: 'CAPABILITY_LIST', id: 'related-capabilities', title: 'Related tools for what comes next', description: 'Filtered for this home.', capabilities: [{ ...capability, id: 'break-even', label: 'Break-Even', href: `/dashboard/properties/${propertyId}/tools/break-even`, readiness: 'READY', readinessLabel: 'Ready for this home', readinessReasons: [] }] },
      ],
    captureRequests: [], confirmation: null, suggestions: ['What information does this tool need?'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

function execution(kind: 'refrigerator' | 'refinance', captured = false) {
  const capture = kind === 'refrigerator' ? {
    requirementId: 'repair-replace:refrigerator:lifecycle', captureKey: 'INVENTORY_ITEM_LIFECYCLE_UPDATE', classification: 'ENHANCEMENT_ACCURACY', state: 'UNKNOWN',
    title: 'Improve refrigerator lifecycle estimate', question: 'About when was the refrigerator installed, and what condition is it in?', helpText: 'Approximate dates are welcome.',
    inputSchema: { type: 'RELATIONAL_UPDATE', entityType: 'INVENTORY_ITEM', entityId: 'fridge-1', updateLabel: 'Save item details', currentValues: {}, fields: [
      { key: 'condition', label: 'Current condition', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Good', value: 'GOOD' }, { label: 'Fair', value: 'FAIR' }] } },
      { key: 'purchasedOn', label: 'Purchase date', required: true, inputSchema: { type: 'APPROXIMATE_DATE' } },
    ] },
    allowNotSure: true, sensitivity: 'STANDARD', destinationLabel: null, confirmationText: null, fallbackHref: `/dashboard/properties/${propertyId}/inventory`, expectedContextVersion: 'context-v1',
  } : {
    requirementId: 'refinance:profile', captureKey: 'FINANCING_PROFILE_REFINANCE_INPUTS', classification: 'REQUIRED_CALCULATION', state: 'UNKNOWN',
    title: 'Add current mortgage details', question: 'Add the minimum details needed to evaluate refinancing.', helpText: null,
    inputSchema: { type: 'GROUP', fields: [
      { key: 'currentMortgageBalanceUsd', label: 'Mortgage balance', required: true, inputSchema: { type: 'DECIMAL', min: 1000, max: 100000000, unit: 'USD' } },
      { key: 'interestRatePct', label: 'Current interest rate', required: true, inputSchema: { type: 'DECIMAL', min: 0.01, max: 30, unit: '%' } },
      { key: 'remainingTermYears', label: 'Remaining term', required: true, inputSchema: { type: 'DECIMAL', min: 1, max: 50, unit: 'years' } },
    ] },
    allowNotSure: false, sensitivity: 'FINANCIAL', destinationLabel: null, confirmationText: 'Save these details to my Financing Profile.', fallbackHref: `/dashboard/properties/${propertyId}/tools/financing/profile`, expectedContextVersion: 'context-v1',
  };
  return {
    schemaVersion: '1.0', executionId: `execution-${kind}`, sessionId: 'ask-acceptance-session', question: kind === 'refrigerator' ? 'When should I replace my refrigerator?' : 'Is refinancing a good option?',
    status: captured ? 'ANSWERED' : 'NEEDS_CONTEXT', property: { id: propertyId, label: 'Acceptance Home' }, operation: { id: kind === 'refrigerator' ? 'REPLACEMENT_GUIDANCE' : 'REFINANCE_ANALYSIS', version: '1.0', family: 'DECISION' },
    contextVersion: captured ? 'context-v2' : 'context-v1', blocks: [{ type: 'SUMMARY', id: 'summary', title: captured ? 'Updated answer' : 'A little more context will improve this answer', body: captured ? 'The saved home details were applied automatically.' : 'Complete the inline card to continue.', tone: 'DEFAULT', actions: [] }],
    captureRequests: captured ? [] : [capture], confirmation: null, suggestions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

export async function installAskContext(context: BrowserContext) {
  await context.addCookies([{ name: 'ctc.at', value: 'ask-acceptance-token', domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Strict' }]);
}

export async function installAskApi(page: Page, options: { conflictOnce?: boolean; permissionDenied?: boolean } = {}) {
  const captureBodies: Array<Record<string, unknown>> = [];
  let captureAttempts = 0;
  await page.route(`${apiOrigin}/api/csrf-token`, (route) => fulfill(route, { csrfToken: 'ask-acceptance-csrf' }));
  await page.route(`${apiOrigin}/api/properties*`, (route) => fulfill(route, { success: true, data: { properties: [{ id: propertyId, name: 'Acceptance Home', addressLine1: '1 Cozy Way', city: 'Boston', state: 'MA', zipCode: '02108' }] } }));
  await page.route(`${apiOrigin}/api/ask/sessions/*`, (route) => fulfill(route, { success: true, data: { executions: [] } }));
  await page.route(`${apiOrigin}/api/ask/executions`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as { message: string };
    if (/disabled refinance tool/i.test(body.message)) {
      await fulfill(route, { success: true, data: capabilityExecution(true) }, 201);
      return;
    }
    if (/tool to help with refinancing/i.test(body.message)) {
      await fulfill(route, { success: true, data: capabilityExecution(false) }, 201);
      return;
    }
    await fulfill(route, { success: true, data: execution(/refinanc/i.test(body.message) ? 'refinance' : 'refrigerator') }, 201);
  });
  await page.route(`${apiOrigin}/api/ask/executions/*/captures/events`, (route) => fulfill(route, {}, 204));
  await page.route(`${apiOrigin}/api/ask/executions/*/captures`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as Record<string, unknown>;
    captureBodies.push(body);
    captureAttempts += 1;
    if (options.permissionDenied) {
      await fulfill(route, { success: false, error: { code: 'ASK_PERMISSION_REQUIRED', message: 'A contributor or owner must update this detail.' } }, 403);
      return;
    }
    if (options.conflictOnce && captureAttempts === 1) {
      const refreshed = execution(body.captureKey === 'FINANCING_PROFILE_REFINANCE_INPUTS' ? 'refinance' : 'refrigerator');
      refreshed.contextVersion = 'context-v2';
      refreshed.captureRequests[0].expectedContextVersion = 'context-v2';
      refreshed.captureRequests[0].state = 'STALE';
      await fulfill(route, { success: false, data: refreshed, error: { code: 'ASK_CONTEXT_VERSION_CONFLICT', message: 'The home record changed.' } }, 409);
      return;
    }
    await fulfill(route, { success: true, data: execution(body.captureKey === 'FINANCING_PROFILE_REFINANCE_INPUTS' ? 'refinance' : 'refrigerator', true) });
  });
  return { captureBodies, captureAttempts: () => captureAttempts };
}

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=ask-acceptance-token');
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(body) });
}
