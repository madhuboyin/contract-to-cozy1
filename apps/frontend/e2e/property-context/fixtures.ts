import { expect, type BrowserContext, type Page, type Request, type Route } from '@playwright/test';

export const propertyId = 'property-browser-fixture';
const apiOrigin = 'http://localhost:8080';

export type Scenario = 'scalar' | 'structured' | 'relational';

type InputSchema = Record<string, unknown>;

const contracts = {
  scalar: {
    featureKey: 'SELLER_PREP',
    operationKey: 'OPEN_PLAN',
    requirementId: 'SELLER_PREP:OPEN_PLAN:core.propertyUse',
    captureKey: 'CORE_PROPERTY_USE',
    mode: 'SCALAR',
    title: 'Property use',
    question: 'How is this property used?',
    factKeys: ['core.propertyUse'],
    inputSchema: {
      type: 'SINGLE_SELECT',
      options: [
        { label: 'Primary residence', value: 'PRIMARY_RESIDENCE' },
        { label: 'Rental', value: 'RENTAL' },
      ],
    },
  },
  structured: {
    featureKey: 'PLANT_ADVISOR',
    operationKey: 'GENERATE_OUTDOOR_RECOMMENDATIONS',
    requirementId: 'PLANT_ADVISOR:GENERATE_OUTDOOR_RECOMMENDATIONS:exterior.hasPrivateOutdoorSpace',
    captureKey: 'OUTDOOR_SPACE_PROFILE',
    mode: 'STRUCTURED',
    title: 'Outdoor space details',
    question: 'Tell us about the outdoor space this home is responsible for.',
    factKeys: ['exterior.hasPrivateOutdoorSpace', 'exterior.outdoorSpaceTypes', 'responsibility.landscaping'],
    inputSchema: {
      type: 'GROUP',
      fields: [
        { key: 'hasPrivateOutdoorSpace', label: 'Private outdoor space', required: true, inputSchema: { type: 'BOOLEAN', trueLabel: 'Yes', falseLabel: 'No' } },
        { key: 'outdoorSpaceTypes', label: 'Outdoor space types', required: true, inputSchema: { type: 'MULTI_SELECT', options: [{ label: 'Patio', value: 'PATIO' }], maxItems: 7 }, when: { fieldKey: 'hasPrivateOutdoorSpace', operator: 'EQUALS', value: true } },
        { key: 'landscapingResponsibility', label: 'Who handles landscaping?', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Homeowner', value: 'HOMEOWNER' }] }, when: { fieldKey: 'hasPrivateOutdoorSpace', operator: 'EQUALS', value: true } },
      ],
    },
  },
  relational: {
    featureKey: 'MAINTENANCE',
    operationKey: 'SET_UP_INSTALLED_SYSTEMS',
    requirementId: 'MAINTENANCE:SET_UP_INSTALLED_SYSTEMS:systems.installedItemTypes',
    captureKey: 'INVENTORY_ITEM_SELECT_OR_CREATE',
    mode: 'RELATIONAL',
    title: 'Add an installed item or system',
    question: 'Which item or home system should this feature use?',
    factKeys: ['inventory.items', 'systems.installedItemTypes'],
    inputSchema: {
      type: 'RELATIONAL_SELECT_CREATE',
      entityType: 'INVENTORY_ITEM',
      selectLabel: 'Select an existing item',
      createLabel: 'Add an item',
      options: [],
      createFields: [
        { key: 'name', label: 'Item or system name', required: true, inputSchema: { type: 'SHORT_TEXT', maxLength: 120 } },
        { key: 'category', label: 'Category', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'HVAC', value: 'HVAC' }] } },
        { key: 'condition', label: 'Current condition', required: true, inputSchema: { type: 'SINGLE_SELECT', options: [{ label: 'Good', value: 'GOOD' }] } },
      ],
    },
  },
} as const satisfies Record<Scenario, {
  featureKey: string;
  operationKey: string;
  requirementId: string;
  captureKey: string;
  mode: string;
  title: string;
  question: string;
  factKeys: readonly string[];
  inputSchema: InputSchema;
}>;

function evaluation(scenario: Scenario, readiness: 'NEEDS_REQUIRED_CONTEXT' | 'READY', version: string) {
  const contract = contracts[scenario];
  return {
    propertyId,
    contextVersion: version,
    featureKey: contract.featureKey,
    operationKey: contract.operationKey,
    policyVersion: '1.0',
    readiness,
    reasonCodes: readiness === 'READY' ? [] : ['ACCEPTANCE_CONTEXT_REQUIRED'],
    usedFactKeys: [...contract.factKeys],
    requirements: readiness === 'READY' ? [] : [{
      requirementId: contract.requirementId,
      factKeys: [...contract.factKeys],
      classification: 'REQUIRED_APPLICABILITY',
      state: 'UNKNOWN',
      reasonCode: 'ACCEPTANCE_CONTEXT_REQUIRED',
      capture: {
        captureKey: contract.captureKey,
        factKeys: [...contract.factKeys],
        mode: contract.mode,
        title: contract.title,
        question: contract.question,
        helpText: 'Browser acceptance fixture for a registered production contract.',
        inputSchema: contract.inputSchema,
        allowNotSure: false,
        actionKey: `CAPTURE_${contract.captureKey}`,
        sensitivity: 'STANDARD',
      },
    }],
    canExecute: readiness === 'READY',
  };
}

function assertAuthenticated(request: Request) {
  expect(request.headers().cookie).toContain('ctc.at=browser-acceptance-token');
  expect(request.headers()['x-csrf-token']).toBe('browser-acceptance-csrf');
}

export async function installAuthenticatedContext(context: BrowserContext) {
  await context.addCookies([{
    name: 'ctc.at',
    value: 'browser-acceptance-token',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Strict',
  }]);
}

export async function installPropertyContextApi(
  page: Page,
  scenario: Scenario,
  options: { evaluationDelayMs?: number; captureFailures?: number } = {},
) {
  let captureAttempts = 0;
  const captureBodies: Array<Record<string, unknown>> = [];

  await page.route(`${apiOrigin}/api/csrf-token`, async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ csrfToken: 'browser-acceptance-csrf' }) });
  });
  await page.route(`${apiOrigin}/api/properties/${propertyId}/context/feature-requirements/evaluate`, async (route) => {
    assertAuthenticated(route.request());
    if (options.evaluationDelayMs) await new Promise((resolve) => setTimeout(resolve, options.evaluationDelayMs));
    await fulfillJson(route, { success: true, data: evaluation(scenario, 'NEEDS_REQUIRED_CONTEXT', 'context-v1') });
  });
  await page.route(`${apiOrigin}/api/properties/${propertyId}/context/captures`, async (route) => {
    assertAuthenticated(route.request());
    captureAttempts += 1;
    captureBodies.push(route.request().postDataJSON());
    if (captureAttempts <= (options.captureFailures ?? 0)) {
      await fulfillJson(route, { success: false, message: 'Temporary capture failure' }, 503);
      return;
    }
    const contract = contracts[scenario];
    await fulfillJson(route, {
      success: true,
      data: {
        captureId: `capture-${scenario}`,
        contextVersion: 'context-v2',
        updatedFactKeys: [...contract.factKeys],
        evidenceIds: [`evidence-${scenario}`],
        evaluation: evaluation(scenario, 'READY', 'context-v2'),
      },
    });
  });

  return {
    captureBodies,
    captureAttempts: () => captureAttempts,
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
