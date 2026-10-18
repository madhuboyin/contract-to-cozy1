// Environment Report read handler inside Ask Cozy (`environment-report` capability; `ENVIRONMENT_REPORT` operation).
// Reads the same canonical `getEnvironmentReportForProperty` and `getWeatherPreparation` services as the desktop
// Environment Report and Weather Preparation pages, presenting active insights, weather preparation checklists,
// current/forecast/historical conditions, hazard zones, climate normals, and missing resilience questions inline.
import { HouseholdRole } from '@prisma/client';
import { type AskPresentationBlock } from '../../../productFramework/ask/ask.contract';
import { type AskOperationResult } from '../askOperationRegistry';
import { registerCapabilityHandler } from '../capabilityHandlerRegistry';
import { ensurePropertyAccess } from '../askHandlerSupport';
import { humanDate, readableCode } from '../askFormatting';
import { collectionDescriptor } from '../support/collectionDescriptor';
import {
  getEnvironmentReportForProperty,
  type EnvironmentReportDTO,
} from '../../environmentReport.service';
import { type EnvironmentInsight } from '../../environment/environmentInsights.service';
import { type SectionResult } from '../../environment/types';
import {
  getWeatherPreparation,
  type WeatherPreparationPlan,
} from '../../environment/weatherPreparation.service';
import {
  buildWeatherPreparationStepEntityId,
  ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE,
  ENVIRONMENT_INSIGHT_ENTITY_TYPE,
  ENVIRONMENT_REPORT_ACTION_IDS,
  ENVIRONMENT_REPORT_COMMAND_MESSAGES,
  WEATHER_PREPARATION_ITEM_ENTITY_TYPE,
} from '../support/environmentReportCommand';

type AskSummaryAction = Extract<AskPresentationBlock, { type: 'SUMMARY' }>['actions'][number];
type GroupedSection = Extract<AskPresentationBlock, { type: 'GROUPED_LIST' }>['sections'][number];
type GroupedItem = GroupedSection['items'][number];
type GroupedItemAction = NonNullable<GroupedItem['actions']>[number];

const WMO_WEATHER_LABELS: Readonly<Record<number, string>> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
};

const DROUGHT_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  None: 'No drought',
  D0: 'D0 — Abnormally dry',
  D1: 'D1 — Moderate drought',
  D2: 'D2 — Severe drought',
  D3: 'D3 — Extreme drought',
  D4: 'D4 — Exceptional drought',
};

const UNAVAILABLE_REASON_LABELS: Readonly<Record<string, string>> = {
  no_coordinates: 'property coordinates are not resolved yet',
  no_zip: 'property ZIP code is not set',
  no_fips: 'county FIPS code could not be resolved',
  outside_us: 'dataset covers U.S. locations only',
  upstream_error: 'public data source did not respond in time',
  http_error: 'public data source returned an error response',
  timeout: 'public data source timed out',
  no_station_nearby: 'no nearby monitoring station was found',
  no_data: 'no record was returned for this location',
  parse_error: 'public source returned an unreadable response',
};

const INSIGHT_SEVERITY_LABELS: Readonly<Record<EnvironmentInsight['severity'], string>> = {
  action: 'Action recommended',
  watch: 'Watch',
  info: 'Info',
};

const BOUNDARY_BLOCK: AskPresentationBlock = {
  type: 'BOUNDARY',
  id: 'environment-report-boundary',
  title: 'Screening context from public environmental sources',
  body: 'Weather, air quality, drought, flood zone, radon zone, nearby facility, and climate normal figures come from public federal and meteorological feeds for this home’s coordinates and county. They are informational screening signals — not an official FEMA flood determination, indoor air or radon measurement, or emergency warning service. Use indoor testing (such as a short-term radon test kit) and official local advisories for safety decisions.',
  severity: 'INFO',
  suggestions: [],
};

function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function weatherConditionLabel(code: number): string {
  return WMO_WEATHER_LABELS[code] ?? `Weather code ${code}`;
}

function aqiCategoryLabel(aqi: number | null | undefined): string {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi)) return 'No reading';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very Unhealthy';
  return 'Hazardous';
}

function sectionReason(section: SectionResult<unknown>): string | undefined {
  return section.status === 'unavailable' ? section.reason : undefined;
}

function sectionFetchedAt(section: SectionResult<unknown>, fallback: string): string | null {
  return section.status === 'ok' ? section.fetchedAt : fallback;
}

function unavailableReasonText(reason?: string): string {
  if (!reason) return 'unavailable right now';
  return UNAVAILABLE_REASON_LABELS[reason] ?? readableCode(reason) ?? 'unavailable right now';
}

export interface EnvironmentReportFromViewOptions {
  propertyId?: string;
  canContribute?: boolean;
  activePreparations?: Readonly<Record<string, WeatherPreparationPlan>>;
  sourceExecutionId?: string | null;
}

export function environmentReportFromView(
  report: EnvironmentReportDTO,
  options: EnvironmentReportFromViewOptions = {},
): AskOperationResult {
  const propertyId = options.propertyId ?? report.propertyId;
  const canContribute = options.canContribute === true;
  const activePreparations = options.activePreparations ?? {};
  const locationLabel = report.property?.city || report.location?.zipCode || 'this home';

  const featureApplicability = report.applicability?.feature;
  if (featureApplicability?.status === 'NOT_APPLICABLE') {
    const reasons = (featureApplicability.reasonCodes ?? []).map((code) => readableCode(code)).filter(Boolean).join(', ');
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'ENVIRONMENT_REPORT_NOT_APPLICABLE',
      blocks: [
        {
          type: 'SUMMARY',
          id: 'environment-report-not-applicable',
          title: 'Environment Report does not apply to this property setup',
          body: reasons
            ? `This property record is marked not applicable for environmental screening (${reasons}).`
            : 'This property record does not include the location context required for environmental screening.',
          tone: 'DEFAULT',
          actions: [],
        },
        BOUNDARY_BLOCK,
      ],
      suggestions: ['Show my home summary', 'What needs my attention around the home?'],
    };
  }

  const sectionDescriptors: ReadonlyArray<{
    key: keyof EnvironmentReportDTO['sections'];
    label: string;
    status: 'ok' | 'unavailable';
    reason?: string;
    observedAt: string | null;
  }> = [
    {
      key: 'weather',
      label: 'Weather forecast & history (Open-Meteo)',
      status: report.sections.weather.status,
      reason: sectionReason(report.sections.weather),
      observedAt: sectionFetchedAt(report.sections.weather, report.generatedAt),
    },
    {
      key: 'airQuality',
      label: 'Air quality (Open-Meteo US AQI)',
      status: report.sections.airQuality.status,
      reason: sectionReason(report.sections.airQuality),
      observedAt: sectionFetchedAt(report.sections.airQuality, report.generatedAt),
    },
    {
      key: 'drought',
      label: 'Drought status (U.S. Drought Monitor)',
      status: report.sections.drought.status,
      reason: sectionReason(report.sections.drought),
      observedAt: sectionFetchedAt(report.sections.drought, report.generatedAt),
    },
    {
      key: 'floodElevation',
      label: 'Flood zone & elevation (FEMA NFHL / USGS 3DEP)',
      status: report.sections.floodElevation.status,
      reason: sectionReason(report.sections.floodElevation),
      observedAt: sectionFetchedAt(report.sections.floodElevation, report.generatedAt),
    },
    {
      key: 'radon',
      label: 'County radon potential (EPA Radon Zones)',
      status: report.sections.radon.status,
      reason: sectionReason(report.sections.radon),
      observedAt: sectionFetchedAt(report.sections.radon, report.generatedAt),
    },
    {
      key: 'hazards',
      label: 'Nearby regulated facilities (EPA ECHO)',
      status: report.sections.hazards.status,
      reason: sectionReason(report.sections.hazards),
      observedAt: sectionFetchedAt(report.sections.hazards, report.generatedAt),
    },
    {
      key: 'climate',
      label: 'Hardiness zone & climate normals (USDA / NOAA)',
      status: report.sections.climate.status,
      reason: sectionReason(report.sections.climate),
      observedAt: sectionFetchedAt(report.sections.climate, report.generatedAt),
    },
  ];

  const availableSections = sectionDescriptors.filter((s) => s.status === 'ok');
  const unavailableSections = sectionDescriptors.filter((s) => s.status === 'unavailable');
  const conditionSourcesComplete =
    report.sections.weather.status === 'ok'
    && report.sections.airQuality.status === 'ok'
    && report.sections.drought.status === 'ok';

  if (availableSections.length === 0 && report.insights.length === 0) {
    const primaryReason = unavailableSections[0]?.reason;
    const reasonSummary = primaryReason
      ? `All seven environmental feeds were unavailable (${unavailableReasonText(primaryReason)}).`
      : 'All seven environmental feeds were unavailable right now.';
    return {
      status: 'READY_WITH_LIMITATIONS',
      reasonCode: 'ENVIRONMENT_REPORT_SOURCES_UNAVAILABLE',
      blocks: [
        {
          type: 'SUMMARY',
          id: 'environment-report-unavailable',
          title: 'Environment Report sources are unavailable for this home right now',
          body: `${reasonSummary} Confirm the property address and coordinates on your home record, or try again when the public feeds respond.`,
          tone: 'CAUTION',
          actions: [],
        },
        {
          type: 'LIMITATION',
          id: 'environment-report-limitations',
          severity: 'CAUTION',
          title: 'Unavailable environmental feeds',
          body: `${unavailableSections.map((s) => `${s.label}: ${unavailableReasonText(s.reason)}`).join('; ')}. Ensure the property has a complete street address, city, state, and ZIP code so coordinates and county lookups can run.`,
        },
        BOUNDARY_BLOCK,
      ],
      suggestions: ['Show my home summary', 'What needs my attention around the home?'],
    };
  }

  // Summary headline & body
  const actionInsights = report.insights.filter((i) => i.severity === 'action');
  const watchInsights = report.insights.filter((i) => i.severity === 'watch');
  const infoInsights = report.insights.filter((i) => i.severity === 'info');

  const conditionHighlights: string[] = [];
  if (report.sections.weather.status === 'ok' && report.sections.weather.data) {
    const cur = report.sections.weather.data.current;
    conditionHighlights.push(
      `Current weather is ${Math.round(cur.temperatureF)}°F (${weatherConditionLabel(cur.weatherCode)}, feels like ${Math.round(cur.apparentTemperatureF)}°F, wind ${Math.round(cur.windSpeedMph)} mph).`,
    );
  }
  if (report.sections.airQuality.status === 'ok' && report.sections.airQuality.data?.current) {
    const aq = report.sections.airQuality.data.current;
    conditionHighlights.push(`Air quality is US AQI ${aq.aqi ?? '—'} (${aqiCategoryLabel(aq.aqi)}).`);
  }
  if (report.sections.drought.status === 'ok' && report.sections.drought.data?.current) {
    const dCat = report.sections.drought.data.current.dominantCategory;
    conditionHighlights.push(`Drought monitor status is ${DROUGHT_CATEGORY_LABELS[dCat] ?? dCat}.`);
  }

  let summaryTitle: string;
  let summaryLead: string;

  if (report.insights.length > 0) {
    const countsParts: string[] = [];
    if (actionInsights.length > 0) countsParts.push(plural(actionInsights.length, 'action-level alert'));
    if (watchInsights.length > 0) countsParts.push(plural(watchInsights.length, 'watch item'));
    if (infoInsights.length > 0) countsParts.push(plural(infoInsights.length, 'informational note'));
    summaryTitle = `${plural(report.insights.length, 'active environmental insight')} for ${locationLabel}`;
    summaryLead = `Your Environment Report has ${countsParts.join(', ')}: ${report.insights.map((i) => i.title).join('; ')}.`;
  } else if (conditionSourcesComplete) {
    summaryTitle = `Environmental conditions for ${locationLabel}`;
    summaryLead = 'Active weather, air quality, and drought feeds are within normal local ranges in the current forecast window.';
  } else {
    summaryTitle = `Environment Report for ${locationLabel} (partial source coverage)`;
    summaryLead = 'Available environmental feeds are within normal ranges, though one or more condition sources could not be checked.';
  }

  const summaryActions: AskSummaryAction[] = [];
  const hasHvacFilterQuestion =
    report.questions.some((q) => q.field === 'hvacFilterLastCompletedDate')
    && report.applicability?.hvacFilterMaintenance?.status !== 'NOT_APPLICABLE';
  if (canContribute && hasHvacFilterQuestion) {
    summaryActions.push({
      id: ENVIRONMENT_REPORT_ACTION_IDS.RECORD_HVAC_FILTER,
      label: 'Record HVAC filter change',
      interactionType: 'START_WORKFLOW',
      message: ENVIRONMENT_REPORT_COMMAND_MESSAGES.RECORD_HVAC_FILTER,
      operationId: 'ENVIRONMENT_REPORT_COMMAND',
      entityType: ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE,
      entityId: propertyId,
      actionId: ENVIRONMENT_REPORT_ACTION_IDS.RECORD_HVAC_FILTER,
      style: 'SECONDARY',
    });
  }
  if (report.plantAdvisorModules.length > 0) {
    summaryActions.push({
      id: ENVIRONMENT_REPORT_ACTION_IDS.OPEN_PLANT_CARE,
      label: 'Review plant care for this weather',
      interactionType: 'START_WORKFLOW',
      message: 'Show my plant care outlook',
      operationId: 'PLANT_CARE_OUTLOOK',
      style: 'SECONDARY',
    });
  }
  if (report.longTermHazardContext?.hazards?.length > 0) {
    summaryActions.push({
      id: ENVIRONMENT_REPORT_ACTION_IDS.OPEN_PAST_HAZARDS,
      label: 'Review past hazard exposure',
      interactionType: 'START_WORKFLOW',
      message: 'Show my past hazard exposure',
      operationId: 'PAST_HAZARD_EXPOSURE',
      style: 'SECONDARY',
    });
  }

  const structuredInsights = report.insights.map((insight) => {
    const prep = insight.relatedIncident;
    const rowActions: GroupedItemAction[] = [];
    if (canContribute && !prep && insight.recommendedActions.length > 0) {
      rowActions.push({
        id: ENVIRONMENT_REPORT_ACTION_IDS.START_PREPARATION,
        label: 'Start preparation checklist',
        interactionType: 'MUTATE_RECORD',
        message: ENVIRONMENT_REPORT_COMMAND_MESSAGES.START_PREPARATION,
        operationId: 'ENVIRONMENT_REPORT_COMMAND',
        style: 'PRIMARY',
      });
    }
    return {
      id: insight.id,
      category: insight.category,
      severity: insight.severity,
      title: insight.title,
      summary: insight.summary,
      homeImplication: insight.homeImplication,
      timeframe: insight.timeframe,
      effectiveFrom: insight.effectiveFrom,
      effectiveTo: insight.effectiveTo,
      affectedSystems: insight.affectedSystems.slice(0, 12),
      recommendedActions: insight.recommendedActions.slice(0, 12),
      source: insight.source,
      relatedIncidentId: prep?.id ?? null,
      isOfficialAlert: prep?.isOfficialAlert ?? false,
      entityType: ENVIRONMENT_INSIGHT_ENTITY_TYPE,
      entityId: insight.id,
      actions: rowActions,
    };
  });

  const preparationEntries = report.insights
    .map((insight) => {
      const incidentId = insight.relatedIncident?.id;
      const detailed = incidentId ? activePreparations[incidentId] : undefined;
      return detailed ? { insight, preparation: detailed } : null;
    })
    .filter((entry): entry is { insight: EnvironmentInsight; preparation: WeatherPreparationPlan } => entry !== null);

  const structuredPreparations = preparationEntries.map(({ insight, preparation }) => ({
    id: preparation.id,
    insightId: insight.id,
    title: preparation.title || insight.title,
    summary: preparation.summary || insight.summary,
    timeframe: preparation.timeframe || insight.timeframe,
    status: preparation.status,
    progress: preparation.progress,
    items: preparation.items.slice(0, 30).map((item) => {
      const stepEntityId = buildWeatherPreparationStepEntityId(preparation.id, item.id);
      const itemActions: GroupedItemAction[] = [];
      if (canContribute) {
        if (item.status === 'CREATED') {
          itemActions.push(
            {
              id: ENVIRONMENT_REPORT_ACTION_IDS.COMPLETE_STEP,
              label: 'Mark done',
              interactionType: 'MUTATE_RECORD',
              message: ENVIRONMENT_REPORT_COMMAND_MESSAGES.COMPLETE_STEP,
              operationId: 'ENVIRONMENT_REPORT_COMMAND',
              style: 'PRIMARY',
            },
            {
              id: ENVIRONMENT_REPORT_ACTION_IDS.SKIP_STEP,
              label: 'Not needed',
              interactionType: 'MUTATE_RECORD',
              message: ENVIRONMENT_REPORT_COMMAND_MESSAGES.SKIP_STEP,
              operationId: 'ENVIRONMENT_REPORT_COMMAND',
              style: 'SECONDARY',
            },
          );
        } else if (item.status === 'COMPLETED' || item.status === 'CANCELED') {
          itemActions.push({
            id: ENVIRONMENT_REPORT_ACTION_IDS.REOPEN_STEP,
            label: 'Reopen step',
            interactionType: 'MUTATE_RECORD',
            message: ENVIRONMENT_REPORT_COMMAND_MESSAGES.REOPEN_STEP,
            operationId: 'ENVIRONMENT_REPORT_COMMAND',
            style: 'SECONDARY',
          });
        }
      }
      return {
        id: item.id,
        entityId: stepEntityId,
        entityType: WEATHER_PREPARATION_ITEM_ENTITY_TYPE,
        label: item.label,
        status: item.status,
        sortOrder: item.sortOrder,
        actions: itemActions,
      };
    }),
  }));

  const structuredQuestions = report.questions.slice(0, 15).map((question) => {
    const isHvacFilter =
      question.field === 'hvacFilterLastCompletedDate'
      && report.applicability?.hvacFilterMaintenance?.status !== 'NOT_APPLICABLE';
    const actions: GroupedItemAction[] = isHvacFilter && canContribute
      ? [
          {
            id: ENVIRONMENT_REPORT_ACTION_IDS.RECORD_HVAC_FILTER,
            label: 'Record HVAC filter change',
            interactionType: 'MUTATE_RECORD',
            message: ENVIRONMENT_REPORT_COMMAND_MESSAGES.RECORD_HVAC_FILTER,
            operationId: 'ENVIRONMENT_REPORT_COMMAND',
            style: 'SECONDARY',
          },
        ]
      : [];
    return {
      id: question.id,
      insightId: question.insightId,
      field: question.field,
      prompt: question.prompt,
      reason: question.reason,
      entityType: isHvacFilter ? ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE : null,
      entityId: isHvacFilter ? propertyId : `question-${question.id}`,
      actions,
    };
  });

  const structuredPlantAdvisorModules = report.plantAdvisorModules.slice(0, 10).map((mod) => ({
    id: mod.id,
    trigger: mod.trigger,
    relatedInsightId: mod.relatedInsightId,
    title: mod.title,
    summary: mod.summary,
    contextLevel: mod.contextLevel,
    plantNames: mod.plantNames.slice(0, 20),
    roomNames: mod.roomNames.slice(0, 20),
    actions: [
      {
        id: ENVIRONMENT_REPORT_ACTION_IDS.OPEN_PLANT_CARE,
        label: 'Review plant care for this weather',
        interactionType: 'CONVERSATION_CONTINUE' as const,
        message: 'Show my plant care outlook',
        operationId: 'PLANT_CARE_OUTLOOK',
        style: 'SECONDARY' as const,
      },
    ],
  }));

  const rawLongTerm = report.longTermHazardContext;
  const checkedThroughIso = rawLongTerm?.coverage?.checkedThrough
    ? rawLongTerm.coverage.checkedThrough instanceof Date
      ? rawLongTerm.coverage.checkedThrough.toISOString()
      : String(rawLongTerm.coverage.checkedThrough)
    : null;

  const structuredLongTermHazardContext = rawLongTerm
    ? {
        state: rawLongTerm.coverage?.state ?? 'UNKNOWN',
        checkedThrough: checkedThroughIso,
        emptyState: rawLongTerm.emptyState ?? null,
        hazards: (rawLongTerm.hazards ?? []).slice(0, 20).map((h) => ({
          propertyMatchId: h.propertyMatchId,
          hazardType: h.hazardType,
          hazardLabel: h.hazardLabel,
          title: h.title,
          factualSummary: h.factualSummary ?? null,
          lifecycleStatus: h.lifecycleStatus,
          precision: h.geography?.precision ?? null,
          distanceMiles: h.geography?.distanceMiles ?? null,
          provider: h.source?.provider ?? null,
        })),
        actions: (rawLongTerm.hazards?.length ?? 0) > 0
          ? [
              {
                id: ENVIRONMENT_REPORT_ACTION_IDS.OPEN_PAST_HAZARDS,
                label: 'Review past hazard exposure',
                interactionType: 'CONVERSATION_CONTINUE' as const,
                message: 'Show my past hazard exposure',
                operationId: 'PAST_HAZARD_EXPOSURE',
                style: 'SECONDARY' as const,
              },
            ]
          : [],
      }
    : null;

  const weatherSection = report.sections.weather;
  const airQualitySection = report.sections.airQuality;
  const droughtSection = report.sections.drought;
  const floodElevationSection = report.sections.floodElevation;
  const radonSection = report.sections.radon;
  const hazardsSection = report.sections.hazards;
  const climateSection = report.sections.climate;

  const environmentReportBlock: Extract<AskPresentationBlock, { type: 'ENVIRONMENT_REPORT' }> = {
    type: 'ENVIRONMENT_REPORT',
    id: 'environment-report-dashboard',
    title: summaryTitle,
    summary: [summaryLead, ...conditionHighlights].filter(Boolean).join(' '),
    generatedAt: report.generatedAt,
    property: {
      name: report.property.name ?? null,
      address: report.property.address,
      city: report.property.city,
      state: report.property.state,
      zipCode: report.property.zipCode,
    },
    location: {
      latitude: report.location.latitude,
      longitude: report.location.longitude,
      countyFips: report.location.countyFips,
      zipCode: report.location.zipCode,
    },
    conditionSourcesComplete,
    insights: structuredInsights,
    preparations: structuredPreparations,
    questions: structuredQuestions,
    plantAdvisorModules: structuredPlantAdvisorModules,
    longTermHazardContext: structuredLongTermHazardContext,
    sections: {
      weather: weatherSection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: weatherSection.fetchedAt,
            data: {
              current: {
                temperatureF: weatherSection.data.current.temperatureF,
                apparentTemperatureF: weatherSection.data.current.apparentTemperatureF,
                humidityPercent: weatherSection.data.current.humidityPercent,
                windSpeedMph: weatherSection.data.current.windSpeedMph,
                precipitationIn: weatherSection.data.current.precipitationIn,
                weatherCode: weatherSection.data.current.weatherCode,
                isDay: weatherSection.data.current.isDay ?? true,
                observedAt: weatherSection.data.current.observedAt,
              },
              hourly: (weatherSection.data.hourly ?? []).slice(0, 48).map((p) => ({
                time: p.time,
                temperatureF: p.temperatureF,
                precipitationProbabilityPercent: p.precipitationProbabilityPercent ?? 0,
                weatherCode: p.weatherCode,
              })),
              tenDayForecast: (weatherSection.data.tenDayForecast ?? []).slice(0, 14).map((d) => ({
                date: d.date,
                tempMaxF: d.tempMaxF,
                tempMinF: d.tempMinF,
                precipitationSumIn: d.precipitationSumIn ?? 0,
                weatherCode: d.weatherCode,
              })),
              thirtyDayHistory: (weatherSection.data.thirtyDayHistory ?? []).slice(0, 35).map((h) => ({
                date: h.date,
                tempMaxF: h.tempMaxF,
                tempMinF: h.tempMinF,
                precipitationSumIn: h.precipitationSumIn ?? 0,
              })),
            },
          }
        : { status: 'unavailable', reason: weatherSection.reason },
      airQuality: airQualitySection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: airQualitySection.fetchedAt,
            data: {
              current: {
                aqi: airQualitySection.data.current.aqi,
                pm2_5: airQualitySection.data.current.pm2_5,
                pm10: airQualitySection.data.current.pm10,
                observedAt: airQualitySection.data.current.observedAt,
              },
              history: (airQualitySection.data.history ?? []).slice(0, 35).map((h) => ({
                date: h.date,
                avgAqi: h.avgAqi,
                avgPm2_5: h.avgPm2_5,
              })),
            },
          }
        : { status: 'unavailable', reason: airQualitySection.reason },
      drought: droughtSection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: droughtSection.fetchedAt,
            data: {
              current: droughtSection.data.current
                ? {
                    date: droughtSection.data.current.date,
                    dominantCategory: droughtSection.data.current.dominantCategory,
                    percentArea: droughtSection.data.current.percentArea,
                  }
                : null,
              history: (droughtSection.data.history ?? []).slice(0, 16).map((w) => ({
                date: w.date,
                dominantCategory: w.dominantCategory,
                percentArea: w.percentArea,
              })),
            },
          }
        : { status: 'unavailable', reason: droughtSection.reason },
      floodElevation: floodElevationSection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: floodElevationSection.fetchedAt,
            data: {
              femaFloodZone: floodElevationSection.data.femaFloodZone,
              femaZoneSubtype: floodElevationSection.data.femaZoneSubtype,
              elevationFeet: floodElevationSection.data.elevationFeet,
            },
          }
        : { status: 'unavailable', reason: floodElevationSection.reason },
      radon: radonSection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: radonSection.fetchedAt,
            data: {
              zone: radonSection.data.zone,
              zoneDescription: radonSection.data.zoneDescription,
              countyName: radonSection.data.countyName,
              stateName: radonSection.data.stateName,
            },
          }
        : { status: 'unavailable', reason: radonSection.reason },
      hazards: hazardsSection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: hazardsSection.fetchedAt,
            data: {
              facilities: (hazardsSection.data.facilities ?? []).slice(0, 25).map((f) => ({
                registryId: f.registryId,
                name: f.name,
                address: f.address,
                programs: (f.programs ?? []).slice(0, 12),
                complianceStatus: f.complianceStatus,
                significantNoncompliance: f.significantNoncompliance,
                inspectionCount: f.inspectionCount,
                lastInspectionDate: f.lastInspectionDate,
                penaltyCount: f.penaltyCount,
                latitude: f.latitude,
                longitude: f.longitude,
                distanceMiles: f.distanceMiles,
              })),
              totalFacilitiesInRadius: hazardsSection.data.totalFacilitiesInRadius,
              totalPenaltiesInRadius: hazardsSection.data.totalPenaltiesInRadius,
              searchRadiusMiles: hazardsSection.data.searchRadiusMiles,
            },
          }
        : { status: 'unavailable', reason: hazardsSection.reason },
      climate: climateSection.status === 'ok'
        ? {
            status: 'ok',
            fetchedAt: climateSection.fetchedAt,
            data: {
              normals: climateSection.data.normals.status === 'ok'
                ? {
                    status: 'ok',
                    fetchedAt: climateSection.data.normals.fetchedAt,
                    data: {
                      stationId: climateSection.data.normals.data.stationId,
                      stationName: climateSection.data.normals.data.stationName,
                      monthly: (climateSection.data.normals.data.monthly ?? []).slice(0, 12).map((m) => ({
                        month: m.month,
                        avgTempF: m.avgTempF,
                        avgHighF: m.avgHighF,
                        avgLowF: m.avgLowF,
                      })),
                      annualHeatingDegreeDays: climateSection.data.normals.data.annualHeatingDegreeDays,
                      annualCoolingDegreeDays: climateSection.data.normals.data.annualCoolingDegreeDays,
                    },
                  }
                : { status: 'unavailable', reason: climateSection.data.normals.reason },
              hardinessZone: climateSection.data.hardinessZone.status === 'ok'
                ? {
                    status: 'ok',
                    fetchedAt: climateSection.data.hardinessZone.fetchedAt,
                    data: {
                      zone: climateSection.data.hardinessZone.data.zone,
                      temperatureRangeF: climateSection.data.hardinessZone.data.temperatureRangeF,
                    },
                  }
                : { status: 'unavailable', reason: climateSection.data.hardinessZone.reason },
            },
          }
        : { status: 'unavailable', reason: climateSection.reason },
    },
    actions: summaryActions,
  };

  const hasLimitations = unavailableSections.length > 0 || featureApplicability?.status === 'UNKNOWN';
  const blocks: AskPresentationBlock[] = [
    environmentReportBlock,
    {
      type: 'EVIDENCE',
      id: 'environment-report-evidence',
      title: 'Environmental data sources',
      items: sectionDescriptors.map((s) => ({
        label: s.label,
        source: s.status === 'ok' ? 'Available' : `Unavailable (${unavailableReasonText(s.reason)})`,
        observedAt: s.observedAt,
      })),
    },
  ];

  if (hasLimitations) {
    const limitationParts: string[] = [];
    if (unavailableSections.length > 0) {
      limitationParts.push(
        `Unavailable feeds: ${unavailableSections.map((s) => `${s.label} (${unavailableReasonText(s.reason)})`).join('; ')}.`,
      );
    }
    if (featureApplicability?.status === 'UNKNOWN') {
      const reasons = (featureApplicability.reasonCodes ?? []).map((code) => readableCode(code)).filter(Boolean).join(', ');
      limitationParts.push(
        `Some property location facts are still incomplete${reasons ? ` (${reasons})` : ''}.`,
      );
    }
    limitationParts.push(
      'Treat unavailable sections as unverified rather than clear, and complete missing home details to tailor weather recommendations.',
    );
    blocks.push({
      type: 'LIMITATION',
      id: 'environment-report-limitations',
      severity: 'CAUTION',
      title: 'Some environmental sources or home facts are incomplete',
      body: limitationParts.join(' '),
    });
  }

  blocks.push(BOUNDARY_BLOCK);

  return {
    status: hasLimitations ? 'READY_WITH_LIMITATIONS' : 'ANSWERED',
    reasonCode: hasLimitations ? 'ENVIRONMENT_REPORT_PARTIAL_SOURCES' : 'ENVIRONMENT_REPORT_READY',
    blocks,
    suggestions: [
      'Show my home event radar feed',
      'Show my past hazard exposure',
      'What maintenance is pending?',
    ],
  };
}

registerCapabilityHandler('environment-report.read', async (envelope, deps) => {
  const propertyId = envelope.propertyId!;
  const access = deps.propertyAccess ?? await ensurePropertyAccess(envelope.userId, propertyId);
  const canContribute = access.role !== HouseholdRole.VIEWER;

  const report = await getEnvironmentReportForProperty(propertyId, envelope.userId);
  if (!report) {
    return {
      status: 'NOT_APPLICABLE',
      reasonCode: 'ENVIRONMENT_REPORT_PROPERTY_NOT_FOUND',
      blocks: [
        {
          type: 'SUMMARY',
          id: 'environment-report-property-missing',
          title: 'This property record could not be found',
          body: 'Ask Cozy could not load the property record for this Environment Report.',
          tone: 'CAUTION',
          actions: [],
        },
        BOUNDARY_BLOCK,
      ],
      suggestions: ['Show my home summary'],
    };
  }

  const activePreparations: Record<string, WeatherPreparationPlan> = {};
  const incidentIds = [
    ...new Set(
      report.insights
        .map((insight) => insight.relatedIncident?.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  if (incidentIds.length > 0) {
    const loaded = await Promise.allSettled(
      incidentIds.map((incidentId) => getWeatherPreparation(propertyId, incidentId)),
    );
    for (const outcome of loaded) {
      if (outcome.status === 'fulfilled' && outcome.value) {
        activePreparations[outcome.value.id] = outcome.value;
      }
    }
  }

  return environmentReportFromView(report, {
    propertyId,
    canContribute,
    activePreparations,
    sourceExecutionId: envelope.executionId,
  });
});
