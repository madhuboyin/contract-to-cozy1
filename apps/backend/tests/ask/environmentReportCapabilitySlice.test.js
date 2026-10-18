const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node/register');

const { resolveAskOperation, isAskMessageRoutableOperation } = require('../../src/services/ask/askOperationRegistry.ts');
const { CARD_ENTRY_BINDINGS, ASK_DISCOVERY_BINDINGS } = require('../../src/services/ask/askCapabilityBindings.ts');
const { environmentReportFromView } = require('../../src/services/ask/askOrchestrator.service.ts');
const {
  ENVIRONMENT_REPORT_ACTION_IDS,
  ENVIRONMENT_REPORT_COMMAND_MESSAGES,
  WEATHER_PREPARATION_ITEM_ENTITY_TYPE,
  ENVIRONMENT_INSIGHT_ENTITY_TYPE,
  ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE,
  buildWeatherPreparationStepEntityId,
  parseWeatherPreparationStepEntityId,
  parseEnvironmentHvacFilterAnswer,
} = require('../../src/services/ask/support/environmentReportCommand.ts');

function sampleEnvironmentReport(overrides = {}) {
  return {
    propertyId: 'prop-1',
    property: {
      name: 'Maple Home',
      address: '123 Maple St',
      city: 'Austin',
      state: 'TX',
      zipCode: '78701',
    },
    location: {
      latitude: 30.2672,
      longitude: -97.7431,
      countyFips: '48453',
      zipCode: '78701',
    },
    generatedAt: '2026-10-17T12:00:00.000Z',
    applicability: {
      feature: { status: 'APPLICABLE', reasonCodes: ['PROPERTY_LOCATION_AVAILABLE'], missingFactKeys: [] },
      hvacFilterMaintenance: { status: 'APPLICABLE', reasonCodes: ['HVAC_FILTER_MAINTENANCE_APPLICABLE'], missingFactKeys: [] },
    },
    insights: [
      {
        id: 'insight-1',
        category: 'freeze',
        severity: 'action',
        title: 'Freeze Watch Preparation',
        summary: 'Sub-freezing overnight temperatures expected within 48 hours.',
        homeImplication: 'Exposed pipes and outdoor faucets can freeze and burst.',
        timeframe: 'Next 48 hours',
        effectiveFrom: '2026-10-17',
        effectiveTo: '2026-10-19',
        affectedSystems: ['Plumbing', 'Outdoor Faucets'],
        recommendedActions: ['Cover outdoor faucets', 'Disconnect garden hoses'],
        actions: [],
        source: 'Open-Meteo',
        relatedIncident: {
          id: 'inc-1',
          title: 'Freeze Watch Preparation',
          severity: 'WARNING',
          status: 'ACTIVE',
          typeKey: 'WEATHER_PREP_INSIGHT_1',
          isOfficialAlert: false,
        },
      },
      {
        id: 'insight-2',
        category: 'air_quality',
        severity: 'watch',
        title: 'Air Quality Watch',
        summary: 'Elevated particulate levels expected this afternoon.',
        homeImplication: 'Keep windows closed and check HVAC filter condition.',
        timeframe: 'Today through tomorrow',
        effectiveFrom: '2026-10-17',
        effectiveTo: '2026-10-18',
        affectedSystems: ['HVAC'],
        recommendedActions: ['Inspect HVAC air filter', 'Keep windows closed during peak hours'],
        actions: [],
        source: 'Open-Meteo Air Quality',
      },
    ],
    questions: [
      {
        id: 'q-hvac-filter',
        insightId: 'insight-2',
        field: 'hvacFilterLastCompletedDate',
        prompt: 'When did you last change your HVAC filter?',
        reason: 'Keeping a fresh filter improves indoor air quality during high pollen or smoke days.',
        inputType: 'date',
      },
    ],
    plantAdvisorModules: [
      {
        id: 'plant-mod-1',
        trigger: 'freeze',
        relatedInsightId: 'insight-1',
        title: 'Outdoor Plant Care for Freeze',
        summary: 'Bring frost-sensitive potted plants indoors ahead of the freeze watch.',
        contextLevel: 'added_plants',
        plantNames: ['Meyer Lemon', 'Fern'],
        roomNames: ['Patio'],
        action: { label: 'Open Plant Advisor', href: '/dashboard/properties/prop-1/tools/plant-advisor' },
      },
    ],
    longTermHazardContext: {
      coverage: {
        state: 'CURRENT',
        checkedThrough: new Date('2026-10-17T00:00:00.000Z'),
        limitations: [],
        sources: [],
      },
      hazards: [
        {
          propertyMatchId: 'match-1',
          hazardType: 'WINTER_WEATHER',
          hazardLabel: 'Winter Storm',
          category: 'LONG_TERM_CONTEXT',
          title: '2021 Regional Freeze Exposure',
          factualSummary: 'County-level winter storm record.',
          lifecycleStatus: 'ACTIVE',
          observedAt: null,
          effectiveFrom: null,
          effectiveTo: null,
          geography: { precision: 'COUNTY', distanceMiles: null },
          source: { family: 'NWS', provider: 'NOAA', key: 'noaa' },
          propertyEffect: { status: 'UNKNOWN', note: null, recordedAt: null },
        },
      ],
      emptyState: null,
      pastHazardHref: '/dashboard/properties/prop-1/tools/home-risk-replay',
    },
    sections: {
      weather: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          current: {
            temperatureF: 78,
            apparentTemperatureF: 79,
            humidityPercent: 54,
            windSpeedMph: 9,
            precipitationIn: 0,
            weatherCode: 2,
            observedAt: '2026-10-17T12:00:00.000Z',
          },
          tenDayForecast: [
            { date: '2026-10-17', tempMaxF: 81, tempMinF: 62, precipitationProbabilityMax: 10, precipitationSumIn: 0, windSpeedMaxMph: 12, weatherCode: 2 },
            { date: '2026-10-18', tempMaxF: 68, tempMinF: 30, precipitationProbabilityMax: 0, precipitationSumIn: 0, windSpeedMaxMph: 15, weatherCode: 0 },
          ],
          thirtyDayHistory: [],
        },
      },
      airQuality: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          current: {
            aqi: 32,
            pm2_5: 7.4,
            pm10: 14.1,
            observedAt: '2026-10-17T12:00:00.000Z',
          },
          history: [
            { date: '2026-10-16', avgAqi: 44, avgPm2_5: 9.2 },
          ],
        },
      },
      drought: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          current: {
            date: '2026-10-15',
            dominantCategory: 'D1',
            percentArea: { None: 20, D0: 80, D1: 55, D2: 0, D3: 0, D4: 0 },
          },
          history: [
            {
              date: '2026-10-15',
              dominantCategory: 'D1',
              percentArea: { None: 20, D0: 80, D1: 55, D2: 0, D3: 0, D4: 0 },
            },
          ],
        },
      },
      floodElevation: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          femaFloodZone: 'X',
          femaZoneSubtype: 'AREA OF MINIMAL FLOOD HAZARD',
          elevationFeet: 542,
        },
      },
      radon: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          zone: 3,
          zoneDescription: 'Low potential (predicted average < 2 pCi/L)',
          countyName: 'Travis County',
          stateName: 'TX',
        },
      },
      hazards: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          facilities: [
            {
              registryId: 'epa-1',
              name: 'Austin Print Works',
              address: '400 Industrial Blvd',
              programs: ['CAA'],
              complianceStatus: 'No Violation Identified',
              significantNoncompliance: false,
              inspectionCount: 1,
              lastInspectionDate: '2025-05-01',
              penaltyCount: 0,
              latitude: 30.27,
              longitude: -97.74,
              distanceMiles: 0.6,
            },
          ],
          totalFacilitiesInRadius: 1,
          totalPenaltiesInRadius: null,
          searchRadiusMiles: 1,
        },
      },
      climate: {
        status: 'ok',
        fetchedAt: '2026-10-17T12:00:00.000Z',
        data: {
          hardinessZone: {
            status: 'ok',
            fetchedAt: '2026-10-17T12:00:00.000Z',
            data: { zone: '9a', temperatureRangeF: '20 to 25' },
          },
          normals: {
            status: 'ok',
            fetchedAt: '2026-10-17T12:00:00.000Z',
            data: {
              stationId: 'GHCND:USW00013958',
              stationName: 'AUSTIN CAMP MABRY, TX US',
              monthly: [],
              annualHeatingDegreeDays: 1500,
              annualCoolingDegreeDays: 3100,
              firstFrostDate: null,
              lastFrostDate: null,
            },
          },
        },
      },
    },
    ...overrides,
  };
}

function sampleActivePreparations() {
  return {
    'inc-1': {
      id: 'inc-1',
      propertyId: 'prop-1',
      insightId: 'insight-1',
      title: 'Freeze Watch Preparation',
      summary: 'Sub-freezing overnight temperatures expected within 48 hours.',
      timeframe: 'Next 48 hours',
      effectiveFrom: '2026-10-17',
      effectiveTo: '2026-10-19',
      source: 'Open-Meteo',
      status: 'ACTIVE',
      progress: {
        completed: 1,
        skipped: 0,
        resolved: 1,
        total: 2,
      },
      items: [
        {
          id: 'step-1',
          label: 'Cover outdoor faucets',
          status: 'COMPLETED',
          sortOrder: 0,
        },
        {
          id: 'step-2',
          label: 'Disconnect garden hoses',
          status: 'CREATED',
          sortOrder: 1,
        },
      ],
    },
  };
}

test('ENVIRONMENT_REPORT routing and capability card binding', () => {
  assert.equal(isAskMessageRoutableOperation('ENVIRONMENT_REPORT'), true);
  assert.equal(isAskMessageRoutableOperation('ENVIRONMENT_REPORT_COMMAND'), false);

  assert.deepEqual(CARD_ENTRY_BINDINGS['environment-report'], {
    operationId: 'ENVIRONMENT_REPORT',
    message: 'Show my environment report',
  });
  assert.equal(
    ASK_DISCOVERY_BINDINGS.some((b) => b.capabilityId === 'environment-report' && b.operationId === 'ENVIRONMENT_REPORT'),
    true,
  );

  for (const prompt of [
    'Show my environment report',
    'What are the weather, air quality, and drought conditions for my home?',
    'What radon zone and hardiness zone is my home in?',
    'Are there EPA regulated facilities near my home?',
    'Shwo my environment report',
  ]) {
    assert.equal(resolveAskOperation(prompt).operationId, 'ENVIRONMENT_REPORT', prompt);
  }

  // Must not steal neighboring tools
  assert.equal(resolveAskOperation('Show my plant care outlook').operationId, 'PLANT_CARE_OUTLOOK');
  assert.equal(resolveAskOperation('Show my home risk replay').operationId, 'PAST_HAZARD_EXPOSURE');
  assert.equal(resolveAskOperation('Show my home event radar feed').operationId, 'HOME_EVENT_RADAR_FEED');
});

test('environmentReportFromView renders structured ENVIRONMENT_REPORT dashboard block, active preparation steps, and contributor actions with no desktop links', () => {
  const result = environmentReportFromView(sampleEnvironmentReport(), {
    propertyId: 'prop-1',
    canContribute: true,
    activePreparations: sampleActivePreparations(),
  });

  assert.equal(result.status, 'ANSWERED');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('/dashboard/'), false, 'must never emit desktop /dashboard/ links');

  assert.equal(result.blocks[0].type, 'ENVIRONMENT_REPORT');
  const envBlock = result.blocks.find((block) => block.type === 'ENVIRONMENT_REPORT');
  assert.ok(envBlock);
  assert.equal(envBlock.property.address, '123 Maple St');
  assert.equal(envBlock.sections.weather.data.current.temperatureF, 78);
  assert.equal(envBlock.sections.airQuality.data.current.aqi, 32);
  assert.equal(envBlock.sections.floodElevation.data.femaFloodZone, 'X');
  assert.equal(envBlock.sections.radon.data.zone, 3);
  assert.equal(envBlock.sections.hazards.data.totalFacilitiesInRadius, 1);

  assert.equal(envBlock.preparations.length, 1);
  const prep = envBlock.preparations[0];
  assert.equal(prep.id, 'inc-1');
  assert.equal(prep.items.length, 2);

  const completedStep = prep.items.find((item) => item.entityId === 'inc-1:step-1');
  assert.ok(completedStep);
  assert.equal(completedStep.entityType, WEATHER_PREPARATION_ITEM_ENTITY_TYPE);
  assert.equal(completedStep.actions.length, 1);
  assert.equal(completedStep.actions[0].id, ENVIRONMENT_REPORT_ACTION_IDS.REOPEN_STEP);

  const openStep = prep.items.find((item) => item.entityId === 'inc-1:step-2');
  assert.ok(openStep);
  assert.equal(openStep.entityType, WEATHER_PREPARATION_ITEM_ENTITY_TYPE);
  assert.deepEqual(
    openStep.actions.map((a) => a.id),
    [ENVIRONMENT_REPORT_ACTION_IDS.COMPLETE_STEP, ENVIRONMENT_REPORT_ACTION_IDS.SKIP_STEP],
  );

  const notStartedInsight = envBlock.insights.find((item) => item.id === 'insight-2');
  assert.ok(notStartedInsight);
  assert.equal(notStartedInsight.entityType, ENVIRONMENT_INSIGHT_ENTITY_TYPE);
  assert.equal(notStartedInsight.actions.length, 1);
  assert.equal(notStartedInsight.actions[0].id, ENVIRONMENT_REPORT_ACTION_IDS.START_PREPARATION);
  assert.equal(notStartedInsight.actions[0].message, ENVIRONMENT_REPORT_COMMAND_MESSAGES.START_PREPARATION);

  const hvacQuestion = envBlock.questions[0];
  assert.ok(hvacQuestion);
  assert.equal(hvacQuestion.entityType, ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE);
  assert.equal(hvacQuestion.actions.length, 1);
  assert.equal(hvacQuestion.actions[0].id, ENVIRONMENT_REPORT_ACTION_IDS.RECORD_HVAC_FILTER);
});

test('environmentReportFromView discloses partial source unavailability and handles NOT_APPLICABLE', () => {
  const base = sampleEnvironmentReport();
  const partialReport = sampleEnvironmentReport({
    sections: {
      ...base.sections,
      drought: {
        status: 'unavailable',
        reason: 'upstream_error',
      },
    },
  });
  const partialResult = environmentReportFromView(partialReport, { canContribute: false });
  assert.equal(partialResult.status, 'READY_WITH_LIMITATIONS');
  const limitationBlock = partialResult.blocks.find((block) => block.type === 'LIMITATION');
  assert.ok(limitationBlock);
  assert.match(limitationBlock.body, /U\.S\. Drought Monitor/);

  const notApplicableReport = sampleEnvironmentReport({
    applicability: {
      ...base.applicability,
      feature: {
        status: 'NOT_APPLICABLE',
        reasonCodes: ['OUTSIDE_COVERAGE_AREA'],
        missingFactKeys: [],
      },
    },
  });
  const naResult = environmentReportFromView(notApplicableReport);
  assert.equal(naResult.status, 'NOT_APPLICABLE');
});

test('weather preparation entity ID and HVAC filter date parser helpers', () => {
  const encoded = buildWeatherPreparationStepEntityId('inc-1', 'step-2');
  assert.deepEqual(parseWeatherPreparationStepEntityId(encoded), {
    preparationId: 'inc-1',
    itemId: 'step-2',
  });
  assert.equal(parseWeatherPreparationStepEntityId('invalid'), null);

  assert.deepEqual(parseEnvironmentHvacFilterAnswer({ completedDate: '2026-09-15' }), {
    success: true,
    data: { completedDate: '2026-09-15' },
  });
  assert.equal(parseEnvironmentHvacFilterAnswer({ completedDate: '2099-01-01' }).success, false);
  assert.equal(parseEnvironmentHvacFilterAnswer({}).success, false);
});
