import type { AirQualityData } from './airQuality.service';
import type { DroughtData } from './drought.service';
import type { FloodElevationData } from './floodElevation.service';
import type { WeatherReportData } from './weatherReport.service';
import type { SectionResult } from './types';

export type EnvironmentInsightSeverity = 'info' | 'watch' | 'action';

export interface EnvironmentInsightAction {
  label: string;
  href: string;
  kind: 'primary' | 'secondary';
}

export interface EnvironmentInsight {
  id: string;
  category: 'rain' | 'snow' | 'freeze' | 'heat' | 'storm' | 'air_quality' | 'drought';
  severity: EnvironmentInsightSeverity;
  title: string;
  summary: string;
  homeImplication: string;
  timeframe: string;
  effectiveFrom: string;
  effectiveTo: string;
  affectedSystems: string[];
  recommendedActions: string[];
  actions: EnvironmentInsightAction[];
  source: string;
  relatedIncident?: EnvironmentRelatedIncident;
}

export interface EnvironmentRelatedIncident {
  id: string;
  title: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
  status: string;
  typeKey: string;
  isOfficialAlert: boolean;
}

export interface CorrelatableWeatherIncident extends EnvironmentRelatedIncident {
  hazardFamily?: string | null;
}

export interface EnvironmentInsightProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  hasDrainageIssues: boolean | null;
  hasSumpPumpBackup: boolean | null;
  coolingType: string | null;
  heatingType: string | null;
  hvacInstallYear: number | null;
  roofType: string | null;
  roofReplacementYear: number | null;
  foundationType: string | null;
  hasIrrigation: boolean | null;
  hasSecondaryHeat: boolean | null;
}

export type EnvironmentQuestionField =
  | 'hasDrainageIssues'
  | 'hasSumpPumpBackup'
  | 'coolingType'
  | 'hvacInstallYear'
  | 'roofType'
  | 'roofReplacementYear'
  | 'heatingType'
  | 'hasSecondaryHeat'
  | 'hasIrrigation'
  | 'foundationType';

export interface EnvironmentQuestionOption {
  label: string;
  value: string | number | boolean;
}

export interface EnvironmentQuestion {
  id: string;
  insightId: string;
  field: EnvironmentQuestionField;
  prompt: string;
  reason: string;
  inputType: 'choice' | 'year' | 'text';
  options?: EnvironmentQuestionOption[];
  placeholder?: string;
}

export interface EnvironmentInsightSections {
  weather: SectionResult<WeatherReportData>;
  airQuality: SectionResult<AirQualityData>;
  drought: SectionResult<DroughtData>;
  floodElevation: SectionResult<FloodElevationData>;
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

const weatherHref = (propertyId: string) => `/dashboard/properties/${propertyId}?tab=incidents`;
const maintenanceHref = (propertyId: string) => `/dashboard/maintenance?propertyId=${propertyId}`;
const providersHref = (propertyId: string) => `/dashboard/providers?propertyId=${propertyId}`;
const coverageHref = (propertyId: string) =>
  `/dashboard/properties/${propertyId}/tools/coverage-intelligence`;

function isFloodZone(zone: string | null): boolean {
  if (!zone) return false;
  return /^(A|AE|AH|AO|AR|A99|V|VE)$/i.test(zone.trim());
}

export function deriveEnvironmentInsights(
  property: EnvironmentInsightProperty,
  sections: EnvironmentInsightSections
): EnvironmentInsight[] {
  const insights: EnvironmentInsight[] = [];
  const weather = sections.weather.status === 'ok' ? sections.weather.data : null;
  const flood = sections.floodElevation.status === 'ok' ? sections.floodElevation.data : null;

  if (weather) {
    const rainDay = weather.tenDayForecast.find(day => day.precipitationSumIn >= 1);
    if (rainDay) {
      const elevatedPropertyRisk = Boolean(property.hasDrainageIssues || isFloodZone(flood?.femaFloodZone ?? null));
      const reasons = [
        property.hasDrainageIssues ? 'recorded drainage issues' : null,
        isFloodZone(flood?.femaFloodZone ?? null) ? `FEMA flood zone ${flood?.femaFloodZone}` : null,
      ].filter(Boolean);
      insights.push({
        id: `heavy-rain-${rainDay.date}`,
        category: 'rain',
        severity: elevatedPropertyRisk || rainDay.precipitationSumIn >= 2 ? 'action' : 'watch',
        title: `Heavy rain expected ${dayLabel(rainDay.date)}`,
        summary: `About ${rainDay.precipitationSumIn.toFixed(1)} inches of rain is forecast.`,
        homeImplication: elevatedPropertyRisk
          ? `Water-intrusion risk may be higher for this home because of ${reasons.join(' and ')}.`
          : 'Heavy rainfall can overwhelm gutters and exterior drainage and may cause basement or foundation water intrusion.',
        timeframe: dayLabel(rainDay.date),
        effectiveFrom: rainDay.date,
        effectiveTo: rainDay.date,
        affectedSystems: ['Gutters', 'Drainage', 'Basement / foundation'],
        recommendedActions: [
          'Clear gutters and exterior drains before the rain begins.',
          property.hasSumpPumpBackup
            ? 'Test the sump pump and backup power.'
            : 'Check the basement or lowest level and confirm water can drain away from the foundation.',
          'Move valuables away from low floors and known leak areas.',
        ],
        actions: [
          { label: 'Start storm preparation', href: maintenanceHref(property.id), kind: 'primary' },
          { label: 'Check weather coverage', href: coverageHref(property.id), kind: 'secondary' },
        ],
        source: elevatedPropertyRisk || property.hasSumpPumpBackup !== null
          ? 'Open-Meteo forecast and property profile'
          : 'Open-Meteo forecast',
      });
    }

    const snowDay = weather.tenDayForecast.find(day => [71, 73, 75, 77, 85, 86].includes(day.weatherCode));
    if (snowDay) {
      const roofAge = property.roofReplacementYear ? new Date().getFullYear() - property.roofReplacementYear : null;
      const elevatedRoofRisk = property.roofType === 'FLAT' || (roofAge !== null && roofAge >= 20);
      const roofContext = [
        property.roofType && property.roofType !== 'UNKNOWN' ? `${property.roofType.toLowerCase()} roof` : null,
        roofAge !== null ? `approximately ${roofAge} years since replacement` : null,
      ].filter(Boolean).join(' with ');
      insights.push({
        id: `snow-${snowDay.date}`,
        category: 'snow',
        severity: snowDay.weatherCode === 75 || snowDay.weatherCode === 86 || elevatedRoofRisk ? 'action' : 'watch',
        title: `Snow expected ${dayLabel(snowDay.date)}`,
        summary: `Snow is forecast with temperatures between ${Math.round(snowDay.tempMinF)}° and ${Math.round(snowDay.tempMaxF)}°F.`,
        homeImplication: roofContext
          ? `This home has a ${roofContext}. Snow and refreezing may increase roof, vent, walkway, and plumbing exposure.`
          : 'Snow and refreezing can block exterior vents, create unsafe walkways, and expose plumbing to freezing conditions.',
        timeframe: dayLabel(snowDay.date),
        effectiveFrom: snowDay.date,
        effectiveTo: snowDay.date,
        affectedSystems: ['Exterior plumbing', 'Roof', 'Walkways', 'Exterior vents'],
        recommendedActions: ['Disconnect exterior hoses.', 'Check that exterior vents remain clear.', 'Prepare ice melt and snow-removal equipment.'],
        actions: [
          { label: 'Prepare for snow', href: maintenanceHref(property.id), kind: 'primary' },
          { label: 'Find snow or home help', href: providersHref(property.id), kind: 'secondary' },
        ],
        source: 'Open-Meteo forecast',
      });
    }

    const freezeDay = weather.tenDayForecast.find(day => day.tempMinF <= 28 && ![71, 73, 75, 77, 85, 86].includes(day.weatherCode));
    if (freezeDay) {
      const heatPumpWithoutBackup = property.heatingType === 'HEAT_PUMP' && property.hasSecondaryHeat === false;
      insights.push({
        id: `freeze-${freezeDay.date}`,
        category: 'freeze',
        severity: freezeDay.tempMinF <= 20 || heatPumpWithoutBackup ? 'action' : 'watch',
        title: `Freeze risk ${dayLabel(freezeDay.date)}`,
        summary: `The low is forecast near ${Math.round(freezeDay.tempMinF)}°F.`,
        homeImplication: heatPumpWithoutBackup
          ? 'This home uses a heat pump and no backup heat source is recorded. Extreme cold can reduce heating performance while exposed plumbing remains vulnerable.'
          : property.heatingType && property.heatingType !== 'UNKNOWN'
            ? `This home uses ${property.heatingType.toLowerCase().replace('_', ' ')} heat. Exposed pipes and fixtures may still freeze in unheated areas.`
            : 'Exposed pipes and exterior fixtures may freeze, especially in unheated or poorly insulated areas.',
        timeframe: dayLabel(freezeDay.date),
        effectiveFrom: freezeDay.date,
        effectiveTo: freezeDay.date,
        affectedSystems: ['Plumbing', 'Exterior faucets', 'Heating'],
        recommendedActions: ['Disconnect hoses and cover exterior faucets.', 'Keep vulnerable interior spaces heated.', 'Know where the main water shutoff is located.'],
        actions: [{ label: 'Review freeze checklist', href: maintenanceHref(property.id), kind: 'primary' }],
        source: 'Open-Meteo forecast',
      });
    }

    const heatDays = weather.tenDayForecast.filter(day => day.tempMaxF >= 95);
    if (heatDays.length > 0) {
      const first = heatDays[0];
      const last = heatDays[heatDays.length - 1];
      const hvacAge = property.hvacInstallYear ? new Date().getFullYear() - property.hvacInstallYear : null;
      const olderHvac = hvacAge !== null && hvacAge >= 15;
      insights.push({
        id: `heat-${first.date}`,
        category: 'heat',
        severity: heatDays.length >= 2 || Math.max(...heatDays.map(day => day.tempMaxF)) >= 100 || olderHvac ? 'action' : 'watch',
        title: heatDays.length >= 2 ? 'Multi-day heat risk ahead' : `High heat expected ${dayLabel(first.date)}`,
        summary: `${heatDays.length} day${heatDays.length === 1 ? '' : 's'} may reach 95°F or higher.`,
        homeImplication: olderHvac
          ? `The recorded cooling system is approximately ${hvacAge} years old. Sustained heat may increase strain and the chance of reduced performance.`
          : property.coolingType && property.coolingType !== 'UNKNOWN'
            ? `This home uses ${property.coolingType.toLowerCase().replace('_', ' ')} cooling. Sustained heat can increase system demand, energy use, and indoor humidity.`
          : 'No cooling-system type is recorded for this home, so confirm there is a safe plan for keeping indoor temperatures down.',
        timeframe: heatDays.length > 1 ? `${dayLabel(first.date)} – ${dayLabel(last.date)}` : dayLabel(first.date),
        effectiveFrom: first.date,
        effectiveTo: last.date,
        affectedSystems: ['Cooling system', 'Electrical', 'Indoor air'],
        recommendedActions: ['Replace or inspect the HVAC filter.', 'Keep outdoor condenser areas clear.', 'Use shades and avoid peak-hour heat-generating activities.'],
        actions: [
          { label: 'Prepare the cooling system', href: maintenanceHref(property.id), kind: 'primary' },
          { label: 'Find an HVAC professional', href: providersHref(property.id), kind: 'secondary' },
        ],
        source: olderHvac || (property.coolingType !== null && property.coolingType !== 'UNKNOWN')
          ? 'Open-Meteo forecast and property profile'
          : 'Open-Meteo forecast',
      });
    }

    const stormDay = weather.tenDayForecast.find(day => [95, 96, 99].includes(day.weatherCode));
    if (stormDay) {
      insights.push({
        id: `storm-${stormDay.date}`,
        category: 'storm',
        severity: stormDay.weatherCode === 99 ? 'action' : 'watch',
        title: `Thunderstorm risk ${dayLabel(stormDay.date)}`,
        summary: 'Thunderstorms are present in the forecast.',
        homeImplication: 'Strong winds, lightning, and intense rainfall can affect trees, roofing, outdoor items, and power service.',
        timeframe: dayLabel(stormDay.date),
        effectiveFrom: stormDay.date,
        effectiveTo: stormDay.date,
        affectedSystems: ['Roof', 'Trees', 'Electrical service', 'Outdoor property'],
        recommendedActions: ['Secure loose outdoor items.', 'Charge backup batteries and devices.', 'Avoid exterior inspection while the storm is active.'],
        actions: [{ label: 'Review weather risk details', href: weatherHref(property.id), kind: 'primary' }],
        source: 'Open-Meteo forecast',
      });
    }
  }

  if (sections.airQuality.status === 'ok' && sections.airQuality.data.current.aqi > 100) {
    const { aqi } = sections.airQuality.data.current;
    insights.push({
      id: `air-quality-${sections.airQuality.data.current.observedAt}`,
      category: 'air_quality',
      severity: aqi > 150 ? 'action' : 'watch',
      title: 'Poor outdoor air quality',
      summary: `Current AQI is ${aqi}, which may be unhealthy for sensitive people.`,
      homeImplication: 'Outdoor particles can enter through open windows and place additional demand on home filtration.',
      timeframe: 'Current conditions',
      effectiveFrom: sections.airQuality.data.current.observedAt,
      effectiveTo: sections.airQuality.data.current.observedAt,
      affectedSystems: ['Indoor air', 'HVAC filtration'],
      recommendedActions: ['Close windows while air quality remains poor.', 'Use HVAC recirculation where available.', 'Check or replace the HVAC filter if it is due.'],
      actions: [{ label: 'Review indoor-air maintenance', href: maintenanceHref(property.id), kind: 'primary' }],
      source: 'Open-Meteo air quality',
    });
  }

  if (sections.drought.status === 'ok' && ['D2', 'D3', 'D4'].includes(sections.drought.data.current?.dominantCategory ?? '')) {
    const category = sections.drought.data.current!.dominantCategory;
    insights.push({
      id: `drought-${sections.drought.data.current!.date}`,
      category: 'drought',
      severity: category === 'D4' ? 'action' : 'watch',
      title: `${category} drought conditions`,
      summary: 'Severe or worse drought conditions are reported for the area.',
      homeImplication: property.foundationType && property.foundationType !== 'Unknown'
        ? `This home has a ${property.foundationType.toLowerCase()} foundation${property.hasIrrigation ? ' and an irrigation system' : ''}. Dry soil can stress landscaping and contribute to soil movement around the foundation.`
        : 'Dry soil can stress landscaping and may contribute to soil movement or gaps around the foundation.',
      timeframe: 'Current weekly outlook',
      effectiveFrom: sections.drought.data.current!.date,
      effectiveTo: sections.drought.data.current!.date,
      affectedSystems: ['Foundation perimeter', 'Landscaping', 'Irrigation'],
      recommendedActions: ['Follow local watering restrictions.', 'Inspect for widening soil gaps near the foundation.', 'Avoid overwatering directly against the foundation.'],
      actions: [{ label: 'Review exterior maintenance', href: maintenanceHref(property.id), kind: 'primary' }],
      source: 'US Drought Monitor',
    });
  }

  const severityOrder: Record<EnvironmentInsightSeverity, number> = { action: 0, watch: 1, info: 2 };
  return insights.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]).slice(0, 5);
}

const knownEnum = (value: string | null) => Boolean(value);

export function deriveEnvironmentQuestions(
  property: EnvironmentInsightProperty,
  insights: EnvironmentInsight[]
): EnvironmentQuestion[] {
  const questions: EnvironmentQuestion[] = [];
  const add = (question: EnvironmentQuestion) => {
    if (questions.length < 2 && !questions.some(existing => existing.field === question.field)) questions.push(question);
  };

  for (const insight of insights) {
    if (questions.length >= 2) break;

    if (insight.category === 'rain') {
      if (property.hasDrainageIssues === null) {
        add({
          id: `${insight.id}-drainage`,
          insightId: insight.id,
          field: 'hasDrainageIssues',
          prompt: 'Has this home had drainage or water-pooling problems?',
          reason: 'This helps us estimate water-intrusion risk from the approaching rain.',
          inputType: 'choice',
          options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
        });
      }
      if (property.hasSumpPumpBackup === null) {
        add({
          id: `${insight.id}-sump-backup`,
          insightId: insight.id,
          field: 'hasSumpPumpBackup',
          prompt: 'Does the sump pump have battery or generator backup?',
          reason: 'Backup power materially changes basement protection during a storm outage.',
          inputType: 'choice',
          options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
        });
      }
    }

    if (insight.category === 'heat') {
      if (!knownEnum(property.coolingType)) {
        add({
          id: `${insight.id}-cooling`,
          insightId: insight.id,
          field: 'coolingType',
          prompt: 'How is this home primarily cooled?',
          reason: 'Cooling type helps us tailor heat-wave preparation and service guidance.',
          inputType: 'choice',
          options: [
            { label: 'Central air', value: 'CENTRAL_AC' },
            { label: 'Window units', value: 'WINDOW_AC' },
            { label: 'Not sure', value: 'UNKNOWN' },
          ],
        });
      }
      if (property.hvacInstallYear === null) {
        add({
          id: `${insight.id}-hvac-year`,
          insightId: insight.id,
          field: 'hvacInstallYear',
          prompt: 'What year was the cooling system installed?',
          reason: 'System age helps us identify elevated strain during sustained heat.',
          inputType: 'year',
          placeholder: 'e.g. 2016',
        });
      }
    }

    if (insight.category === 'snow' || insight.category === 'storm') {
      if (!knownEnum(property.roofType)) {
        add({
          id: `${insight.id}-roof-type`,
          insightId: insight.id,
          field: 'roofType',
          prompt: 'What type of roof does this home have?',
          reason: 'Roof material affects which weather impacts and inspections matter most.',
          inputType: 'choice',
          options: [
            { label: 'Shingle', value: 'SHINGLE' },
            { label: 'Tile', value: 'TILE' },
            { label: 'Flat', value: 'FLAT' },
            { label: 'Metal', value: 'METAL' },
            { label: 'Not sure', value: 'UNKNOWN' },
          ],
        });
      }
      if (property.roofReplacementYear === null) {
        add({
          id: `${insight.id}-roof-year`,
          insightId: insight.id,
          field: 'roofReplacementYear',
          prompt: 'When was the roof last replaced?',
          reason: 'Roof age helps us determine whether post-weather inspection should be prioritized.',
          inputType: 'year',
          placeholder: 'e.g. 2012',
        });
      }
    }

    if (insight.category === 'freeze') {
      if (!knownEnum(property.heatingType)) {
        add({
          id: `${insight.id}-heating`,
          insightId: insight.id,
          field: 'heatingType',
          prompt: 'What is the primary heating system?',
          reason: 'Heating type helps us tailor freeze protection and backup-heat guidance.',
          inputType: 'choice',
          options: [
            { label: 'HVAC', value: 'HVAC' },
            { label: 'Furnace', value: 'FURNACE' },
            { label: 'Heat pump', value: 'HEAT_PUMP' },
            { label: 'Radiators', value: 'RADIATORS' },
            { label: 'Not sure', value: 'UNKNOWN' },
          ],
        });
      }
      if (property.hasSecondaryHeat === null) {
        add({
          id: `${insight.id}-secondary-heat`,
          insightId: insight.id,
          field: 'hasSecondaryHeat',
          prompt: 'Does this home have a backup heat source?',
          reason: 'Backup heat improves resilience during extreme cold or a power interruption.',
          inputType: 'choice',
          options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
        });
      }
    }

    if (insight.category === 'drought') {
      if (property.hasIrrigation === null) {
        add({
          id: `${insight.id}-irrigation`,
          insightId: insight.id,
          field: 'hasIrrigation',
          prompt: 'Does this property have an irrigation system?',
          reason: 'This helps tailor drought and foundation-perimeter recommendations.',
          inputType: 'choice',
          options: [{ label: 'Yes', value: true }, { label: 'No', value: false }],
        });
      }
      if (!property.foundationType) {
        add({
          id: `${insight.id}-foundation`,
          insightId: insight.id,
          field: 'foundationType',
          prompt: 'What type of foundation does this home have?',
          reason: 'Foundation type helps us tailor soil-movement and moisture guidance.',
          inputType: 'choice',
          options: [
            { label: 'Basement', value: 'Basement' },
            { label: 'Crawl space', value: 'Crawl space' },
            { label: 'Slab', value: 'Slab' },
            { label: 'Not sure', value: 'Unknown' },
          ],
        });
      }
    }
  }

  return questions;
}

function incidentMatchesInsight(insight: EnvironmentInsight, incident: CorrelatableWeatherIncident): boolean {
  const hazard = String(incident.hazardFamily || '').toUpperCase();
  const typeKey = String(incident.typeKey || '').toUpperCase();
  switch (insight.category) {
    case 'rain': return hazard === 'FLOOD' || hazard === 'HURRICANE';
    case 'storm': return hazard === 'STORM' || hazard === 'HURRICANE';
    case 'snow': return hazard === 'SNOW';
    case 'heat': return hazard === 'HEATWAVE';
    case 'freeze': return typeKey === 'FREEZE_RISK' || hazard === 'SNOW';
    default: return false;
  }
}

export function attachRelatedWeatherIncidents(
  propertyId: string,
  insights: EnvironmentInsight[],
  incidents: CorrelatableWeatherIncident[]
): EnvironmentInsight[] {
  return insights.map(insight => {
    const incident = incidents
      .filter(candidate => incidentMatchesInsight(insight, candidate))
      .sort((a, b) => {
        const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;
        return rank[a.severity ?? 'INFO'] - rank[b.severity ?? 'INFO'];
      })[0];
    if (!incident) return insight;

    const existingPreparation = insight.actions.find(action => action.kind === 'primary') ?? insight.actions[0];
    return {
      ...insight,
      relatedIncident: {
        id: incident.id,
        title: incident.title,
        severity: incident.severity,
        status: incident.status,
        typeKey: incident.typeKey,
        isOfficialAlert: incident.isOfficialAlert,
      },
      actions: [
        {
          label: 'Review active incident',
          href: `/dashboard/properties/${propertyId}/incidents/${incident.id}`,
          kind: 'primary' as const,
        },
        ...(existingPreparation
          ? [{ ...existingPreparation, kind: 'secondary' as const }]
          : []),
      ],
    };
  });
}
