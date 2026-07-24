import type { EnvironmentReportDTO } from '../environmentReport.service';
import { meteorologicalSeason } from './environmentInsights.service';

export type HomeFirstValueInsight = {
  kind: 'WATCH' | 'VERIFIED_OUTLOOK' | 'MONITORING_READY';
  badge: string;
  title: string;
  summary: string;
  detail: string;
  timeframe: string | null;
  source: string;
  href: string;
  generatedAt: string;
};

function seasonalChecks(season: ReturnType<typeof meteorologicalSeason>): string {
  if (season === 'winter') return 'freezing temperatures, snow, heavy rain, thunderstorms, and air quality';
  if (season === 'summer') return 'extreme heat, heavy rain, thunderstorms, and air quality';
  return 'unseasonable heat or freezing, heavy rain, thunderstorms, and air quality';
}

export function buildHomeFirstValueInsight(
  report: EnvironmentReportDTO | null,
): HomeFirstValueInsight | null {
  if (!report) return null;

  // Action-level insights belong in the canonical action feed. Do not
  // re-surface one as passive first-value content after dismissal or snooze.
  if (report.insights.some(insight => insight.severity === 'action')) return null;

  const href = `/dashboard/properties/${report.propertyId}/environment-report`;
  const watch = report.insights.find(insight => insight.severity === 'watch');
  if (watch) {
    return {
      kind: 'WATCH',
      badge: 'Local outlook',
      title: watch.title,
      summary: watch.summary,
      detail: watch.homeImplication,
      timeframe: watch.timeframe,
      source: watch.source,
      href,
      generatedAt: report.generatedAt,
    };
  }

  if (report.sections.weather.status === 'ok' && report.sections.weather.data.tenDayForecast.length > 0) {
    const weather = report.sections.weather.data;
    const localDate = weather.tenDayForecast[0]?.date ?? weather.current.observedAt.slice(0, 10);
    const season = meteorologicalSeason(localDate);
    const area = [report.property.city, report.property.state].filter(Boolean).join(', ');
    return {
      kind: 'VERIFIED_OUTLOOK',
      badge: 'Home outlook checked',
      title: `A quiet ${season} weather window for your home`,
      summary: `No conditions currently cross our preparation thresholds in the 10-day forecast for ${area}.`,
      detail: `We checked ${seasonalChecks(season)} using current conditions, the local forecast, and recent area weather. Current temperature is about ${Math.round(weather.current.temperatureF)}°F.`,
      timeframe: 'Next 10 days',
      source: 'Open-Meteo current conditions, forecast, and recent history',
      href,
      generatedAt: report.generatedAt,
    };
  }

  return {
    kind: 'MONITORING_READY',
    badge: 'Monitoring ready',
    title: `Home protection monitoring is set for ${report.property.city}`,
    summary: 'ContractToCozy will evaluate local weather and environmental conditions for this property.',
    detail: 'Live weather evidence is temporarily unavailable, so no threat is being inferred. The outlook will update when current area data is available.',
    timeframe: null,
    source: 'Property location',
    href,
    generatedAt: report.generatedAt,
  };
}
