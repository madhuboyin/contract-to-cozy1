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
  let summaryTone: 'DEFAULT' | 'POSITIVE' | 'CAUTION' = 'DEFAULT';

  if (report.insights.length > 0) {
    summaryTone = actionInsights.length > 0 ? 'CAUTION' : 'DEFAULT';
    const countsParts: string[] = [];
    if (actionInsights.length > 0) countsParts.push(plural(actionInsights.length, 'action-level alert'));
    if (watchInsights.length > 0) countsParts.push(plural(watchInsights.length, 'watch item'));
    if (infoInsights.length > 0) countsParts.push(plural(infoInsights.length, 'informational note'));
    summaryTitle = `${plural(report.insights.length, 'active environmental insight')} for ${locationLabel}`;
    summaryLead = `Your Environment Report has ${countsParts.join(', ')}: ${report.insights.map((i) => i.title).join('; ')}.`;
  } else if (conditionSourcesComplete) {
    summaryTone = 'POSITIVE';
    summaryTitle = `No immediate weather or air-quality alerts for ${locationLabel}`;
    summaryLead = 'No heavy rain, freeze, heat, snow, high-wind, air-quality, or drought thresholds are triggered in the current forecast window.';
  } else {
    summaryTone = 'DEFAULT';
    summaryTitle = `Environment Report for ${locationLabel} (partial source coverage)`;
    summaryLead = 'No thresholds were triggered in the available feeds, though one or more condition sources could not be checked.';
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

  const sections: GroupedSection[] = [];

  // 1. Active insights
  if (report.insights.length > 0) {
    const insightItems: GroupedItem[] = report.insights.map((insight) => {
      const prep = insight.relatedIncident;
      const detailedPrep = prep ? activePreparations[prep.id] : undefined;
      const prepText = prep
        ? detailedPrep
          ? `Checklist: ${detailedPrep.progress.completed}/${detailedPrep.progress.total} steps completed (${prep.status === 'MITIGATED' ? 'Completed' : 'In progress'}).`
          : `Checklist: ${prep.status === 'MITIGATED' ? 'Completed' : 'In progress'}.`
        : insight.recommendedActions.length > 0
          ? `Recommended steps: ${insight.recommendedActions.slice(0, 3).join('; ')}.`
          : '';
      const systemsText = insight.affectedSystems.length > 0 ? `Affected systems: ${insight.affectedSystems.join(', ')}.` : '';
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
        title: insight.title,
        description: [insight.summary, insight.homeImplication, systemsText, prepText].filter(Boolean).join(' '),
        meta: [INSIGHT_SEVERITY_LABELS[insight.severity], insight.timeframe, insight.source].filter(Boolean),
        badgeLabel: INSIGHT_SEVERITY_LABELS[insight.severity],
        status: insight.severity.toUpperCase(),
        href: null,
        entityType: ENVIRONMENT_INSIGHT_ENTITY_TYPE,
        actions: rowActions,
      };
    });
    sections.push({
      id: 'active-insights',
      title: `Active Weather & Environment Insights (${insightItems.length})`,
      count: insightItems.length,
      items: insightItems,
    });
  }

  // 2. Active Weather Preparation Checklists (inline step controls)
  const preparationEntries = report.insights
    .map((insight) => {
      const incidentId = insight.relatedIncident?.id;
      const detailed = incidentId ? activePreparations[incidentId] : undefined;
      return detailed ? { insight, preparation: detailed } : null;
    })
    .filter((entry): entry is { insight: EnvironmentInsight; preparation: WeatherPreparationPlan } => entry !== null);

  for (const { insight, preparation } of preparationEntries) {
    const prepItems: GroupedItem[] = preparation.items.map((item) => {
      const statusBadge = item.status === 'COMPLETED' ? 'Done' : item.status === 'CANCELED' ? 'Not needed' : 'To do';
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
        id: stepEntityId,
        title: item.label,
        description: `${preparation.status === 'MITIGATED' ? 'Checklist completed' : 'Active checklist'} · ${statusBadge}`,
        meta: [statusBadge, insight.title],
        badgeLabel: statusBadge,
        status: item.status,
        href: null,
        entityType: WEATHER_PREPARATION_ITEM_ENTITY_TYPE,
        actions: itemActions,
      };
    });
    sections.push({
      id: `weather-preparation-${preparation.id}`,
      title: `Preparation Checklist: ${insight.title} (${preparation.progress.completed}/${preparation.progress.total} done)`,
      count: prepItems.length,
      items: prepItems,
    });
  }

  // 3. Current Conditions & Short-Range Outlook (Weather, Air Quality, Drought)
  const conditionItems: GroupedItem[] = [];
  if (report.sections.weather.status === 'ok' && report.sections.weather.data) {
    const w = report.sections.weather.data;
    const tenDayHighs = w.tenDayForecast.map((d) => d.tempMaxF);
    const tenDayLows = w.tenDayForecast.map((d) => d.tempMinF);
    const totalTenDayRain = w.tenDayForecast.reduce((sum, d) => sum + (d.precipitationSumIn || 0), 0);
    const forecastSummary = w.tenDayForecast.length > 0
      ? `10-day range: ${Math.round(Math.min(...tenDayLows))}°F to ${Math.round(Math.max(...tenDayHighs))}°F, ${totalTenDayRain.toFixed(2)} in. total forecast precipitation.`
      : '';
    conditionItems.push({
      id: 'section-weather',
      title: 'Weather & 10-Day Forecast',
      description: [
        `Feels like ${Math.round(w.current.apparentTemperatureF)}°F, humidity ${Math.round(w.current.humidityPercent)}%, wind ${Math.round(w.current.windSpeedMph)} mph, current precipitation ${w.current.precipitationIn.toFixed(2)} in.`,
        forecastSummary,
      ].filter(Boolean).join(' '),
      meta: [
        `${Math.round(w.current.temperatureF)}°F`,
        weatherConditionLabel(w.current.weatherCode),
        `Wind ${Math.round(w.current.windSpeedMph)} mph`,
      ],
      badgeLabel: `${Math.round(w.current.temperatureF)}°F`,
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.weather);
    conditionItems.push({
      id: 'section-weather',
      title: 'Weather & 10-Day Forecast',
      description: `Weather forecast and 30-day history could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  if (report.sections.airQuality.status === 'ok' && report.sections.airQuality.data) {
    const aq = report.sections.airQuality.data;
    const cur = aq.current;
    const maxHistoryAqi = aq.history.reduce((max, day) => (day.avgAqi != null && day.avgAqi > max ? day.avgAqi : max), 0);
    const catLabel = cur ? aqiCategoryLabel(cur.aqi) : 'No current reading';
    conditionItems.push({
      id: 'section-air-quality',
      title: 'Air Quality (US AQI)',
      description: cur
        ? `PM2.5: ${cur.pm2_5 !== null ? `${cur.pm2_5.toFixed(1)} µg/m³` : '—'}, PM10: ${cur.pm10 !== null ? `${cur.pm10.toFixed(1)} µg/m³` : '—'}.${maxHistoryAqi > 0 ? ` Highest daily average AQI in history window: ${Math.round(maxHistoryAqi)}.` : ''}`
        : 'Current air quality readings were not reported for this coordinate.',
      meta: cur ? [catLabel, `AQI ${cur.aqi ?? '—'}`] : ['No current reading'],
      badgeLabel: cur?.aqi !== null && cur?.aqi !== undefined ? `AQI ${cur.aqi}` : 'Available',
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.airQuality);
    conditionItems.push({
      id: 'section-air-quality',
      title: 'Air Quality (US AQI)',
      description: `Air quality readings could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  if (report.sections.drought.status === 'ok' && report.sections.drought.data) {
    const d = report.sections.drought.data;
    const dominantCat = d.current?.dominantCategory ?? 'None';
    const label = DROUGHT_CATEGORY_LABELS[dominantCat] ?? dominantCat;
    conditionItems.push({
      id: 'section-drought',
      title: 'U.S. Drought Monitor',
      description: `County status (${report.location?.countyFips ? `FIPS ${report.location.countyFips}` : 'local county'}): ${label} across ${d.history.length} recent weekly snapshots.`,
      meta: [label, `${d.history.length} weekly snapshots`],
      badgeLabel: dominantCat,
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.drought);
    conditionItems.push({
      id: 'section-drought',
      title: 'U.S. Drought Monitor',
      description: `County drought status could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  sections.push({
    id: 'current-conditions',
    title: 'Current Conditions & Short-Range Outlook',
    count: conditionItems.length,
    items: conditionItems,
  });

  // 4. Environmental Hazards & Climate Normals (Flood, Radon, EPA ECHO, Climate, Long-Term Hazard Context, Plant Care)
  const hazardClimateItems: GroupedItem[] = [];

  if (report.sections.floodElevation.status === 'ok' && report.sections.floodElevation.data) {
    const fl = report.sections.floodElevation.data;
    const zoneLabel = fl.femaFloodZone ? `Zone ${fl.femaFloodZone}` : 'Unmapped / Zone not returned';
    const elevLabel = fl.elevationFeet !== null ? `${Math.round(fl.elevationFeet)} ft elevation` : 'Elevation unavailable';
    hazardClimateItems.push({
      id: 'section-flood-elevation',
      title: 'Flood Zone & Elevation (FEMA NFHL / USGS 3DEP)',
      description: [
        fl.femaFloodZone
          ? `FEMA flood zone ${fl.femaFloodZone}${fl.femaZoneSubtype ? ` (${fl.femaZoneSubtype})` : ''}.`
          : 'FEMA NFHL did not return a mapped flood zone polygon for these coordinates.',
        fl.elevationFeet !== null ? `Ground elevation is approximately ${Math.round(fl.elevationFeet)} feet above sea level.` : '',
      ].filter(Boolean).join(' '),
      meta: [zoneLabel, elevLabel],
      badgeLabel: zoneLabel,
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.floodElevation);
    hazardClimateItems.push({
      id: 'section-flood-elevation',
      title: 'Flood Zone & Elevation (FEMA NFHL / USGS 3DEP)',
      description: `Flood zone and elevation could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  if (report.sections.radon.status === 'ok' && report.sections.radon.data) {
    const r = report.sections.radon.data;
    const zoneBadge = r.zone !== null ? `Zone ${r.zone}` : 'Unclassified';
    hazardClimateItems.push({
      id: 'section-radon',
      title: 'County Radon Potential (EPA)',
      description: r.zoneDescription,
      meta: [zoneBadge, ...(r.countyName ? [`${r.countyName}${r.stateName ? `, ${r.stateName}` : ''}`] : [])],
      badgeLabel: zoneBadge,
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.radon);
    hazardClimateItems.push({
      id: 'section-radon',
      title: 'County Radon Potential (EPA)',
      description: `County radon zone could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  if (report.sections.hazards.status === 'ok' && report.sections.hazards.data) {
    const hz = report.sections.hazards.data;
    const topNames = hz.facilities
      .slice(0, 3)
      .map((f) => (f.distanceMiles !== null ? `${f.name} (${f.distanceMiles.toFixed(1)} mi)` : f.name))
      .join(', ');
    hazardClimateItems.push({
      id: 'section-hazards',
      title: `Nearby Regulated Facilities (EPA ECHO, ${hz.searchRadiusMiles}-mi radius)`,
      description: hz.totalFacilitiesInRadius > 0
        ? `${plural(hz.totalFacilitiesInRadius, 'EPA-tracked facility', 'EPA-tracked facilities')} within ${hz.searchRadiusMiles} miles.${topNames ? ` Closest: ${topNames}.` : ''}`
        : `No EPA ECHO regulated facilities were returned within ${hz.searchRadiusMiles} miles of this home.`,
      meta: [`${plural(hz.totalFacilitiesInRadius, 'facility', 'facilities')}`, `${hz.searchRadiusMiles}-mi radius`],
      badgeLabel: `${hz.totalFacilitiesInRadius}`,
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.hazards);
    hazardClimateItems.push({
      id: 'section-hazards',
      title: 'Nearby Regulated Facilities (EPA ECHO)',
      description: `Nearby facility records could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  if (report.sections.climate.status === 'ok' && report.sections.climate.data) {
    const cl = report.sections.climate.data;
    const hzData = cl.hardinessZone.status === 'ok' ? cl.hardinessZone.data : null;
    const normalsData = cl.normals.status === 'ok' ? cl.normals.data : null;
    const hzLabel = hzData?.zone ? `Zone ${hzData.zone.toUpperCase()}` : 'Hardiness zone unavailable';
    const normalsText = normalsData
      ? `NOAA 1991–2020 normals (${normalsData.stationName}): ${normalsData.annualHeatingDegreeDays ?? '—'} heating degree days, ${normalsData.annualCoolingDegreeDays ?? '—'} cooling degree days.`
      : 'NOAA 30-year station normals were not returned for this ZIP code.';
    hazardClimateItems.push({
      id: 'section-climate',
      title: 'USDA Hardiness Zone & Climate Normals',
      description: normalsText,
      meta: [
        hzLabel,
        ...(hzData?.temperatureRangeF ? [`${hzData.temperatureRangeF}°F extreme minimum`] : []),
      ],
      badgeLabel: hzLabel,
      href: null,
    });
  } else {
    const reason = sectionReason(report.sections.climate);
    hazardClimateItems.push({
      id: 'section-climate',
      title: 'USDA Hardiness Zone & Climate Normals',
      description: `Hardiness zone and climate normals could not be loaded (${unavailableReasonText(reason)}).`,
      meta: ['Unavailable', unavailableReasonText(reason)],
      badgeLabel: 'Unavailable',
      href: null,
    });
  }

  if (report.longTermHazardContext?.hazards?.length > 0) {
    const topHazards = report.longTermHazardContext.hazards
      .slice(0, 3)
      .map((h) => `${h.title} (${h.hazardLabel})`)
      .join('; ');
    hazardClimateItems.push({
      id: 'section-long-term-hazards',
      title: 'Long-Term Hazard Context (Home Risk Replay)',
      description: `Matched county/ZIP hazard history: ${topHazards}.`,
      meta: [plural(report.longTermHazardContext.hazards.length, 'recorded hazard match', 'recorded hazard matches')],
      badgeLabel: `${report.longTermHazardContext.hazards.length}`,
      href: null,
      actions: [
        {
          id: ENVIRONMENT_REPORT_ACTION_IDS.OPEN_PAST_HAZARDS,
          label: 'Review past hazard exposure',
          interactionType: 'CONVERSATION_CONTINUE',
          message: 'Show my past hazard exposure',
          operationId: 'PAST_HAZARD_EXPOSURE',
          style: 'SECONDARY',
        },
      ],
    });
  }

  if (report.plantAdvisorModules.length > 0) {
    const mod = report.plantAdvisorModules[0]!;
    hazardClimateItems.push({
      id: 'section-plant-weather',
      title: mod.title,
      description: mod.summary,
      meta: ['Plant care weather guidance', ...(mod.plantNames.length > 0 ? [mod.plantNames.slice(0, 3).join(', ')] : [])],
      badgeLabel: 'Plant care',
      href: null,
      actions: [
        {
          id: ENVIRONMENT_REPORT_ACTION_IDS.OPEN_PLANT_CARE,
          label: 'Review plant care for this weather',
          interactionType: 'CONVERSATION_CONTINUE',
          message: 'Show my plant care outlook',
          operationId: 'PLANT_CARE_OUTLOOK',
          style: 'SECONDARY',
        },
      ],
    });
  }

  sections.push({
    id: 'hazards-and-climate',
    title: 'Environmental Hazards & Climate Normals',
    count: hazardClimateItems.length,
    items: hazardClimateItems,
  });

  // 5. Missing resilience / maintenance details that sharpen active insights
  if (report.questions.length > 0) {
    const questionItems: GroupedItem[] = report.questions.map((question) => {
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
        id: isHvacFilter ? propertyId : `question-${question.id}`,
        title: question.prompt,
        description: question.reason,
        meta: ['Missing home resilience detail', readableCode(question.field)],
        badgeLabel: 'Refines alert',
        href: null,
        entityType: isHvacFilter ? ENVIRONMENT_HVAC_FILTER_ENTITY_TYPE : null,
        actions,
      };
    });
    sections.push({
      id: 'environment-questions',
      title: `Home Details That Refine These Alerts (${questionItems.length})`,
      count: questionItems.length,
      items: questionItems,
    });
  }

  const totalSectionItems = sections.reduce((sum, s) => sum + s.count, 0);
  const hasLimitations = unavailableSections.length > 0 || featureApplicability?.status === 'UNKNOWN';
  const blocks: AskPresentationBlock[] = [
    {
      type: 'SUMMARY',
      id: 'environment-report-summary',
      title: summaryTitle,
      body: [summaryLead, ...conditionHighlights].filter(Boolean).join(' '),
      tone: summaryTone,
      actions: summaryActions,
    },
    {
      type: 'GROUPED_LIST',
      id: 'environment-report-details',
      title: 'Environment Report Details',
      filters: [],
      sections,
      collection: collectionDescriptor({
        sourceTotal: totalSectionItems,
        fetchedCount: totalSectionItems,
        sections,
        nextPageAvailable: false,
      }),
      actions: [],
    },
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
