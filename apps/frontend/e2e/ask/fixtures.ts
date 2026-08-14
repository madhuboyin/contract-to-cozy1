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

export async function installAskApi(page: Page, options: { conflictOnce?: boolean; permissionDenied?: boolean; noDecision?: boolean } = {}) {
  const captureBodies: Array<Record<string, unknown>> = [];
  const executionQuestions: string[] = [];
  const executionBodies: Array<Record<string, unknown>> = [];
  let captureAttempts = 0;
  await page.route(`${apiOrigin}/api/csrf-token`, (route) => fulfill(route, { csrfToken: 'ask-acceptance-csrf' }));
  await page.route(`${apiOrigin}/api/properties*`, (route) => fulfill(route, { success: true, data: { properties: [{ id: propertyId, name: 'Acceptance Home', addressLine1: '1 Cozy Way', city: 'Boston', state: 'MA', zipCode: '02108' }] } }));
  await page.route(`${apiOrigin}/api/ask/pending*`, (route) => fulfill(route, { success: true, data: { items: [] } }));
  await page.route(`${apiOrigin}/api/ask/concierge-home*`, (route) => fulfill(route, { success: true, data: {
    propertyId, generatedAt: new Date().toISOString(),
    priorityList: {
      state: 'AVAILABLE', rankingPolicyVersion: 'acceptance-v1', generatedAt: new Date().toISOString(), truncated: false, href: `/dashboard?propertyId=${propertyId}`,
      items: [{ homeActionId: 'action-1', title: 'Schedule HVAC service', askQuestion: 'What should I do next for “Schedule HVAC service”?', askCategoryId: 'MAINTAIN', askCategoryLabel: 'Maintain', consumerPriority: 'PLAN_SOON', comparativeReasonCodes: ['COST_AVOIDANCE'], confidenceLabel: 'HIGH', deadlineAt: '2026-09-01T12:00:00.000Z', cta: { label: 'Review action', href: '/dashboard/actions/action-1' }, watchState: null, suppressed: false, completed: false, unavailable: false, stale: false }],
    },
    changes: { state: 'AVAILABLE', windowDays: 30, items: [{ id: 'change-1', source: 'Home action', summary: 'Home action updated.', materiality: 'MEANINGFUL', detectedAt: new Date().toISOString(), effectiveAt: null }], href: `/dashboard/ask?propertyId=${propertyId}` },
    decisions: options.noDecision
      ? { state: 'NO_DECISIONS', items: [], href: `/dashboard/ask?propertyId=${propertyId}` }
      : { state: 'AVAILABLE', items: [{ decisionThreadId: 'decision-1', title: 'Repair or replace the refrigerator', lifecycleStatus: 'IN_PROGRESS', contextStatus: 'CURRENT', verdict: null, confidenceLabel: 'MEDIUM', updatedAt: '2026-08-12T12:00:00.000Z' }], href: `/dashboard/ask?propertyId=${propertyId}` },
    capabilityGroups: [
      { id: 'UNDERSTAND', label: 'Understand your home', description: 'Turn home records into a clear, useful picture.', capabilityIds: ['property-brief'], prompts: [{ id: 'understand-summary', categoryId: 'UNDERSTAND', categoryLabel: 'Understand', question: 'Give me a summary of my home record.' }] },
      { id: 'MAINTAIN', label: 'Maintain and prevent', description: 'Stay ahead of maintenance and prevent avoidable problems.', capabilityIds: ['maintenance'], prompts: [{ id: 'maintain-due', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What maintenance tasks are due this month?' }] },
      { id: 'PROTECT', label: 'Protect your home', description: 'Find coverage gaps, risks, and important changes.', capabilityIds: ['coverage-intelligence'], prompts: [{ id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?' }] },
      { id: 'SAVE', label: 'Reduce costs', description: 'Understand spending and uncover relevant savings.', capabilityIds: ['savings-benefits'], prompts: [{ id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?' }] },
      { id: 'DECIDE', label: 'Compare and decide', description: 'Compare options with the relevant home context.', capabilityIds: ['replace-repair'], prompts: [{ id: 'decide-replace', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me compare repair and replacement options for a home system or appliance.' }] },
      { id: 'PLAN_MONITOR', label: 'Plan and monitor', description: 'Build plans and keep watch on important deadlines.', capabilityIds: ['capital-timeline'], prompts: [{ id: 'plan-reserve', categoryId: 'PLAN_MONITOR', categoryLabel: 'Plan', question: 'Create a capital reserve plan for future replacements.' }] },
    ],
    featuredPrompts: [
      { id: 'decision-decision-1', categoryId: 'DECIDE', categoryLabel: 'Decide', question: 'Help me continue this decision: Repair or replace the refrigerator', context: { entityType: 'DECISION_THREAD', entityId: 'decision-1' }, source: 'PERSONALIZED' },
      { id: 'attention-action-1', categoryId: 'MAINTAIN', categoryLabel: 'Maintain', question: 'What should I do next for “Schedule HVAC service”?', context: { entityType: 'HOME_ACTION', entityId: 'action-1', actionId: 'action-1', capabilityId: 'home-operations' }, source: 'PERSONALIZED' },
      { id: 'protect-coverage', categoryId: 'PROTECT', categoryLabel: 'Protect', question: 'Which items are missing coverage?', source: 'DISCOVERY' },
      { id: 'save-opportunities', categoryId: 'SAVE', categoryLabel: 'Save', question: 'Where could I save money on this home?', source: 'DISCOVERY' },
    ],
    suggestedQuestions: ['Help me continue this decision: Repair or replace the refrigerator', 'What should I do next for “Schedule HVAC service”?', 'Which items are missing coverage?', 'Where could I save money on this home?'],
  } }));
  await page.route(`${apiOrigin}/api/ask/sessions/*`, (route) => fulfill(route, { success: true, data: { executions: [] } }));
  await page.route(`${apiOrigin}/api/ask/executions`, async (route) => {
    assertAuthenticated(route.request());
    const body = route.request().postDataJSON() as { message: string } & Record<string, unknown>;
    executionBodies.push(body);
    executionQuestions.push(body.message);
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
  return { captureBodies, executionQuestions, executionBodies, captureAttempts: () => captureAttempts };
}

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=ask-acceptance-token');
}

async function fulfill(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: status === 204 ? '' : JSON.stringify(body) });
}
