import type { Page } from '@playwright/test';

export const PROPERTY_ID = 'savings-benefits-acceptance-property';

function responseBody(handoff = false) {
  return {
    success: true,
    data: {
      propertyId: PROPERTY_ID,
      inProgress: [{
        id: 'match-acceptance',
        family: 'BENEFIT',
        lifecycle: 'IN_PROGRESS',
        title: 'State energy rebate',
        category: 'REBATE',
        explanation: 'The property is in the reviewed program jurisdiction.',
        estimatedValue: 500,
        estimatedValueBasis: 'ONE_TIME',
        realizedValue: null,
        currency: 'USD',
        deadline: '2026-12-31T00:00:00.000Z',
        sourceLabel: 'State energy office',
        statusLabel: 'Pursuing',
        outcomeStage: null,
        verificationState: null,
        detailHref: '#opportunity-detail',
        updatedAt: '2026-07-29T12:00:00.000Z',
        mutuallyExclusiveWith: [],
        canonicalAction: {
          id: handoff ? 'handoff-action' : 'prepare-action',
          actionType: handoff ? 'PARTNER_HANDOFF_CONSENTED' : 'PREPARE',
          state: 'STARTED',
          handoffStatus: handoff ? 'ACKNOWLEDGED' : null,
          partner: handoff ? { id: 'partner-1', name: 'Approved Energy Help' } : null,
        },
      }],
      realized: [{
        id: 'match-realized',
        family: 'BENEFIT',
        lifecycle: 'REALIZED',
        title: 'Local efficiency credit',
        category: 'ENERGY_CREDIT',
        explanation: 'Award letter attached.',
        estimatedValue: 200,
        estimatedValueBasis: 'ONE_TIME',
        realizedValue: 200,
        currency: 'USD',
        deadline: null,
        sourceLabel: 'City sustainability office',
        statusLabel: 'Received',
        outcomeStage: 'RECEIVED',
        verificationState: 'VERIFIED',
        detailHref: '#realized-detail',
        updatedAt: '2026-07-29T12:00:00.000Z',
        mutuallyExclusiveWith: [],
        canonicalAction: null,
      }],
      relatedOpportunities: [],
      totals: {
        inProgressCount: 1,
        realizedCount: 1,
        realizedValueTotal: 200,
        realizedValueCurrency: 'USD',
        realizedValueByCurrency: { USD: 200 },
        verifiedValueByCurrency: { USD: 200 },
        realizedValueByFamily: { BENEFIT: { USD: 200 }, RECURRING_COST: {} },
        exclusionConflicts: [],
      },
    },
  };
}

export async function installSavingsBenefitsRoutes(page: Page, handoff = false) {
  const actionPayloads: Array<Record<string, unknown>> = [];
  await page.route(`**/api/properties/${PROPERTY_ID}/savings-benefits`, (route) =>
    route.fulfill({ json: responseBody(handoff) }));
  await page.route(`**/api/properties/${PROPERTY_ID}/savings-benefits/partners`, (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          partners: [{
            id: 'partner-1',
            name: 'Approved Energy Help',
            disclosureVersion: 'partner-v1',
            compensationMayOccur: true,
            compensationDisclosure: 'Contract to Cozy may receive a referral payment.',
            rankingDisclosure: 'Compensation does not influence organic ranking.',
            privacyDisclosure: 'Only the fields listed in this dialog are shared.',
          }],
        },
      },
    }));
  await page.route('**/api/properties/**/savings-benefits/opportunities/**/actions', async (route) => {
    actionPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 201, json: { success: true, data: { id: 'handoff-action' } } });
  });
  await page.route('**/api/properties/**/savings-benefits/actions/**/handoff/revoke', (route) =>
    route.fulfill({ json: { success: true, data: {} } }));
  await page.route('**/api/properties/**/savings-benefits/actions/**/handoff/complaints', (route) =>
    route.fulfill({ status: 201, json: { success: true, data: { id: 'complaint-1' } } }));
  return { actionPayloads };
}
