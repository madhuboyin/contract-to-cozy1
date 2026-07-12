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
        source: 'Open-Meteo forecast and property profile',
      });
    }

    const snowDay = weather.tenDayForecast.find(day => [71, 73, 75, 77, 85, 86].includes(day.weatherCode));
    if (snowDay) {
      insights.push({
        id: `snow-${snowDay.date}`,
        category: 'snow',
        severity: snowDay.weatherCode === 75 || snowDay.weatherCode === 86 ? 'action' : 'watch',
        title: `Snow expected ${dayLabel(snowDay.date)}`,
        summary: `Snow is forecast with temperatures between ${Math.round(snowDay.tempMinF)}° and ${Math.round(snowDay.tempMaxF)}°F.`,
        homeImplication: 'Snow and refreezing can block exterior vents, create unsafe walkways, and expose plumbing to freezing conditions.',
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
      insights.push({
        id: `freeze-${freezeDay.date}`,
        category: 'freeze',
        severity: freezeDay.tempMinF <= 20 ? 'action' : 'watch',
        title: `Freeze risk ${dayLabel(freezeDay.date)}`,
        summary: `The low is forecast near ${Math.round(freezeDay.tempMinF)}°F.`,
        homeImplication: 'Exposed pipes and exterior fixtures may freeze, especially in unheated or poorly insulated areas.',
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
      insights.push({
        id: `heat-${first.date}`,
        category: 'heat',
        severity: heatDays.length >= 2 || Math.max(...heatDays.map(day => day.tempMaxF)) >= 100 ? 'action' : 'watch',
        title: heatDays.length >= 2 ? 'Multi-day heat risk ahead' : `High heat expected ${dayLabel(first.date)}`,
        summary: `${heatDays.length} day${heatDays.length === 1 ? '' : 's'} may reach 95°F or higher.`,
        homeImplication: property.coolingType
          ? 'Sustained heat can strain the cooling system, increase energy use, and worsen indoor humidity.'
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
        source: 'Open-Meteo forecast and property profile',
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
      homeImplication: 'Dry soil can stress landscaping and may contribute to soil movement or gaps around the foundation.',
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
