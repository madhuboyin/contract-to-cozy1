// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/environment-report/page.tsx

'use client';

import { useState, type ComponentType, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader, PageHeaderHeading } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Clock3, Loader2, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Flame, ShieldAlert, Snowflake, Sun, Wind, Droplets, Waves, Radiation, Factory, Thermometer, Sprout } from 'lucide-react';
import { navigateBackWithDashboardFallback } from '@/lib/navigation/backNavigation';
import type {
  SectionResult,
  WeatherReportData,
  AirQualityData,
  DroughtData,
  FloodElevationData,
  RadonData,
  EnvironmentalHazardsData,
  ClimateSectionData,
  ClimateNormalsMonthlyPoint,
  EnvironmentInsight,
  EnvironmentQuestion,
  PlantAdvisorWeatherModule,
} from '@/types';

function InlineInsightQuestions({
  propertyId,
  questions,
  onSaved,
}: {
  propertyId: string;
  questions: EnvironmentQuestion[];
  onSaved: (prompt: string) => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const saveAnswer = async (question: EnvironmentQuestion, value: string | number | boolean) => {
    setError(null);
    setSavingId(question.id);
    try {
      if (question.field === 'hvacFilterLastCompletedDate') {
        await api.post<{ taskId: string; completedDate: string }>(
          `/api/environment/report/${propertyId}/maintenance-context`,
          { field: question.field, completedDate: value }
        );
      } else {
        const response = await api.updateProperty(
          propertyId,
          { [question.field]: value } as Parameters<typeof api.updateProperty>[1]
        );
        if (!response.success) throw new Error('message' in response ? response.message : 'Unable to save answer');
      }
      await onSaved(question.prompt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this answer. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  if (questions.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/70 p-4" aria-label="Personalize this insight">
      <p className="text-sm font-semibold text-violet-950">Help us tailor this insight to your home</p>
      <p className="mt-1 text-xs leading-relaxed text-violet-700">These answers are saved to this home and will not be asked again.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {questions.map(question => (
          <div key={question.id} className="rounded-lg border border-violet-200 bg-white p-3">
            <p className="text-sm font-semibold text-slate-950">{question.prompt}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{question.reason}</p>
            {question.inputType === 'choice' ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {question.options?.map(option => (
                  <Button
                    key={String(option.value)}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={savingId !== null}
                    onClick={() => void saveAnswer(question, option.value)}
                  >
                    {savingId === question.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                    {option.label}
                  </Button>
                ))}
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  type={question.inputType === 'date' ? 'date' : 'number'}
                  min={question.inputType === 'date' ? '2000-01-01' : '1700'}
                  max={question.inputType === 'date' ? new Date().toISOString().slice(0, 10) : String(new Date().getFullYear())}
                  placeholder={question.placeholder}
                  value={values[question.id] ?? ''}
                  onChange={event => setValues(current => ({ ...current, [question.id]: event.target.value }))}
                  className="min-h-9 w-44 rounded-md border border-slate-300 bg-white px-3 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={savingId !== null || !values[question.id]}
                  onClick={() => {
                    const rawValue = values[question.id];
                    if (question.inputType === 'date') {
                      if (rawValue) void saveAnswer(question, rawValue);
                      else setError('Enter a valid maintenance date.');
                    } else {
                      const year = Number(rawValue);
                      if (year >= 1700 && year <= new Date().getFullYear()) void saveAnswer(question, year);
                      else setError('Enter a valid four-digit year.');
                    }
                  }}
                >
                  {savingId === question.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            )}
          </div>
        ))}
        {error ? <p role="alert" className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
      </div>
    </div>
  );
}

const INSIGHT_ICONS: Record<EnvironmentInsight['category'], ComponentType<{ className?: string }>> = {
  rain: CloudRain,
  snow: CloudSnow,
  freeze: Snowflake,
  heat: Flame,
  storm: ShieldAlert,
  air_quality: Wind,
  drought: Droplets,
};

function PlantAdvisorWeatherCard({ module }: { module: PlantAdvisorWeatherModule }) {
  const isSetup = module.contextLevel === 'setup';
  return (
    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4" aria-label="Plant Advisor weather guidance">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700"><Sprout className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-emerald-950">{module.title}</p>
            <Badge variant="outline" className="border-emerald-300 bg-white text-emerald-800">Plant Advisor</Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-emerald-900/80">{module.summary}</p>
          {module.contextLevel === 'saved_recommendations' ? (
            <p className="mt-2 text-xs text-emerald-700">Guidance is based on saved recommendations; confirm plants you actually own in Plant Advisor.</p>
          ) : null}
          <Button asChild variant={isSetup ? 'default' : 'outline'} size="sm" className="mt-3">
            <Link href={module.action.href}>{module.action.label}<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function InsightSummary({
  propertyId,
  insights,
  questions,
  plantAdvisorModules,
  onSaved,
}: {
  propertyId: string;
  insights: EnvironmentInsight[];
  questions: EnvironmentQuestion[];
  plantAdvisorModules: PlantAdvisorWeatherModule[];
  onSaved: (prompt: string) => Promise<void>;
}) {
  if (insights.length === 0) {
    return (
      <div className="space-y-3">
        <Card className="border-emerald-200 bg-emerald-50/70">
          <CardContent className="flex items-start gap-3 p-5">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-950">No immediate environment concerns</p>
              <p className="mt-1 text-sm text-emerald-800">We did not detect weather or environmental conditions that need action right now.</p>
            </div>
          </CardContent>
        </Card>
        {plantAdvisorModules.map(module => <PlantAdvisorWeatherCard key={module.id} module={module} />)}
      </div>
    );
  }

  return (
    <section aria-labelledby="environment-attention-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Home protection outlook</p>
          <h2 id="environment-attention-heading" className="mt-1 text-xl font-bold text-slate-950">What needs your attention</h2>
        </div>
        <Badge variant={insights.some(i => i.severity === 'action') ? 'destructive' : 'secondary'}>
          {insights.length} active insight{insights.length === 1 ? '' : 's'}
        </Badge>
      </div>

      {insights.map((insight, index) => {
        const Icon = INSIGHT_ICONS[insight.category];
        const needsAction = insight.severity === 'action';
        const insightQuestions = questions.filter(question => question.insightId === insight.id);
        const plantModules = plantAdvisorModules.filter(module => module.relatedInsightId === insight.id);
        return (
          <Card key={insight.id} className={needsAction ? 'overflow-hidden border-amber-300 shadow-sm' : 'overflow-hidden border-sky-200'}>
            <div className={needsAction ? 'h-1 bg-amber-500' : 'h-1 bg-sky-500'} />
            <CardContent className="p-5 sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className={needsAction ? 'rounded-xl bg-amber-100 p-2.5 text-amber-700' : 'rounded-xl bg-sky-100 p-2.5 text-sky-700'}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={needsAction ? 'destructive' : 'secondary'}>{needsAction ? 'Action recommended' : 'Prepare soon'}</Badge>
                      <Badge variant="outline">
                        {insight.relatedIncident?.isOfficialAlert ? 'Official alert in effect' : 'Forecast-based preparation'}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-slate-500"><Clock3 className="h-3.5 w-3.5" />{insight.timeframe}</span>
                    </div>
                    {insight.relatedIncident ? (
                      <p className="mt-2 text-xs font-medium text-slate-600">
                        Related incident: {insight.relatedIncident.title} · {insight.relatedIncident.severity ?? 'Pending assessment'}
                      </p>
                    ) : null}
                    <h3 className="mt-2 text-lg font-bold text-slate-950">{insight.title}</h3>
                    <p className="mt-1 text-sm text-slate-700">{insight.summary}</p>
                    <div className="mt-4 rounded-lg bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Why this matters to your home</p>
                      <p className="mt-1 text-sm text-slate-700">{insight.homeImplication}</p>
                    </div>
                    <InlineInsightQuestions
                      propertyId={propertyId}
                      questions={insightQuestions}
                      onSaved={onSaved}
                    />
                    {plantModules.map(module => <PlantAdvisorWeatherCard key={module.id} module={module} />)}
                    <div className="mt-4">
                      <p className="text-sm font-semibold text-slate-900">Before conditions begin</p>
                      <ul className="mt-2 space-y-1.5">
                        {insight.recommendedActions.map(action => (
                          <li key={action} className="flex gap-2 text-sm text-slate-700">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{action}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {insight.actions.map(action => (
                        <Button key={action.href} asChild variant={action.kind === 'primary' ? 'default' : 'outline'} size="sm">
                          <Link href={action.href}>{action.label}<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
                        </Button>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-slate-400">Source: {insight.source}</p>
                  </div>
                </div>
                {index === 0 && insight.affectedSystems.length > 0 ? (
                  <div className="w-full rounded-xl border border-slate-200 p-4 lg:w-56">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home areas affected</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {insight.affectedSystems.map(system => <Badge key={system} variant="outline">{system}</Badge>)}
                    </div>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {plantAdvisorModules.filter(module => module.relatedInsightId === null).map(module => (
        <PlantAdvisorWeatherCard key={module.id} module={module} />
      ))}
    </section>
  );
}

function HomeSystemsOutlook({ insights }: { insights: EnvironmentInsight[] }) {
  const systems = new Map<string, { severity: EnvironmentInsight['severity']; hazards: string[] }>();
  insights.forEach(insight => insight.affectedSystems.forEach(system => {
    const existing = systems.get(system);
    const severity = existing?.severity === 'action' || insight.severity === 'action' ? 'action' : insight.severity;
    systems.set(system, { severity, hazards: Array.from(new Set([...(existing?.hazards ?? []), insight.title])) });
  }));
  const entries = Array.from(systems.entries()).slice(0, 8);
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="systems-outlook-heading">
      <div className="mb-3"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Weather-to-home connection</p><h2 id="systems-outlook-heading" className="mt-1 text-xl font-bold text-slate-950">Home systems outlook</h2></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map(([system, context]) => <div key={system} className={context.severity === 'action' ? 'rounded-xl border border-amber-300 bg-amber-50 p-3' : 'rounded-xl border border-sky-200 bg-sky-50/60 p-3'}><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-950">{system}</p><span className={context.severity === 'action' ? 'h-2.5 w-2.5 rounded-full bg-amber-500' : 'h-2.5 w-2.5 rounded-full bg-sky-500'} /></div><p className="mt-2 line-clamp-2 text-xs text-slate-600">{context.hazards.join(' · ')}</p></div>)}
      </div>
    </section>
  );
}

const WEATHER_CODE_LABELS: Record<number, string> = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Heavy rain showers', 82: 'Violent rain showers',
  95: 'Thunderstorm', 96: 'Thunderstorm w/ hail', 99: 'Severe thunderstorm w/ hail',
};
function weatherLabel(code: number): string {
  return WEATHER_CODE_LABELS[code] ?? `Weather code ${code}`;
}

function weatherIcon(code: number): ComponentType<{ className?: string }> {
  if (code === 0 || code === 1) return Sun;
  if (code === 2 || code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if ([51, 53, 55].includes(code)) return CloudDrizzle;
  if ([61, 63, 65, 80, 81, 82].includes(code)) return CloudRain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnow;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return CloudSun;
}

function HourlyWeatherChart({ points }: { points: WeatherReportData['hourly'] }) {
  const data = points.slice(0, 24);
  if (data.length < 2) return <SectionUnavailable reason="hourly_chart_unavailable" />;
  const width = 760;
  const height = 230;
  const left = 42;
  const right = 18;
  const top = 22;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const temps = data.map(point => point.temperatureF);
  const minTemp = Math.floor(Math.min(...temps) - 2);
  const maxTemp = Math.ceil(Math.max(...temps) + 2);
  const tempRange = Math.max(1, maxTemp - minTemp);
  const x = (index: number) => left + (index / (data.length - 1)) * plotWidth;
  const y = (temperature: number) => top + ((maxTemp - temperature) / tempRange) * plotHeight;
  const path = data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.temperatureF).toFixed(1)}`).join(' ');
  const labelIndexes = data.map((_, index) => index).filter(index => index % 4 === 0 || index === data.length - 1);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>Temperature and precipitation chance · next 24 hours</span>
        <span className="flex items-center gap-3"><span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-teal-600" />Temperature</span><span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-sky-300" />Precipitation</span></span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Hourly temperature line and precipitation probability bars" className="h-auto w-full">
        {[0, 0.5, 1].map(fraction => {
          const gridY = top + fraction * plotHeight;
          const label = Math.round(maxTemp - fraction * tempRange);
          return <g key={fraction}><line x1={left} x2={width - right} y1={gridY} y2={gridY} stroke="currentColor" className="text-slate-200" /><text x={left - 8} y={gridY + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{label}°</text></g>;
        })}
        {data.map((point, index) => {
          const barHeight = (point.precipitationProbabilityPercent / 100) * plotHeight;
          const barWidth = Math.max(4, plotWidth / data.length - 5);
          return <rect key={point.time} x={x(index) - barWidth / 2} y={top + plotHeight - barHeight} width={barWidth} height={barHeight} rx="2" className="fill-sky-200/80" />;
        })}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-teal-600" />
        {data.map((point, index) => index % 4 === 0 ? <circle key={point.time} cx={x(index)} cy={y(point.temperatureF)} r="3.5" className="fill-white stroke-teal-600" strokeWidth="2" /> : null)}
        {labelIndexes.map(index => <text key={data[index].time} x={x(index)} y={height - 12} textAnchor="middle" className="fill-slate-500 text-[11px]">{new Date(data[index].time).toLocaleTimeString([], { hour: 'numeric' })}</text>)}
      </svg>
    </div>
  );
}

function AqiGauge({ aqi }: { aqi: number }) {
  const normalized = Math.min(200, Math.max(0, aqi));
  const position = Math.min(99, Math.max(1, (normalized / 200) * 100));
  const label = aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for sensitive groups' : 'Unhealthy';
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Air quality index</p><p className="mt-1 text-3xl font-bold text-slate-950">{aqi}</p></div><Badge variant={aqi > 100 ? 'destructive' : 'secondary'}>{label}</Badge></div>
      <div className="relative mt-5 h-3 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-red-500" aria-label={`AQI ${aqi}, ${label}`}>
        <span className="absolute top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-slate-950 shadow" style={{ left: `${position}%` }} />
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>0 Good</span><span>100</span><span>200 Unhealthy</span></div>
    </div>
  );
}

function AqiTrendChart({ history }: { history: AirQualityData['history'] }) {
  const data = history.slice(-14);
  if (data.length < 2) return <SectionUnavailable reason="air_quality_history_unavailable" />;
  const width = 640;
  const height = 190;
  const pad = { left: 34, right: 14, top: 18, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(100, ...data.map(point => point.avgAqi));
  const x = (index: number) => pad.left + (index / (data.length - 1)) * plotWidth;
  const y = (value: number) => pad.top + ((max - value) / max) * plotHeight;
  const path = data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(point.avgAqi).toFixed(1)}`).join(' ');
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">14-day AQI trend</p>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Fourteen-day air quality index trend" className="mt-2 h-auto w-full">
        <rect x={pad.left} y={y(100)} width={plotWidth} height={Math.max(0, y(50) - y(100))} className="fill-amber-50" />
        {[50, 100].map(value => <g key={value}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="currentColor" className="text-slate-200" /><text x={pad.left - 7} y={y(value) + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{value}</text></g>)}
        <path d={path} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600" />
        {data.map((point, index) => <circle key={point.date} cx={x(index)} cy={y(point.avgAqi)} r={index === data.length - 1 ? 4 : 2.5} className="fill-white stroke-amber-600" strokeWidth="2" />)}
        <text x={pad.left} y={height - 8} className="fill-slate-500 text-[10px]">{new Date(data[0].date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" className="fill-slate-500 text-[10px]">{new Date(data[data.length - 1].date).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>
      </svg>
    </div>
  );
}

function WeatherHistoryChart({ history, normalHigh, normalLow }: { history: WeatherReportData['thirtyDayHistory']; normalHigh?: number | null; normalLow?: number | null }) {
  const data = history.slice(-30);
  if (data.length < 2) return <SectionUnavailable reason="weather_history_unavailable" />;
  const width = 760;
  const height = 250;
  const pad = { left: 42, right: 18, top: 22, bottom: 38 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const values = data.flatMap(point => [point.tempMaxF, point.tempMinF]);
  const min = Math.floor(Math.min(...values, normalLow ?? Infinity) - 3);
  const max = Math.ceil(Math.max(...values, normalHigh ?? -Infinity) + 3);
  const range = Math.max(1, max - min);
  const x = (index: number) => pad.left + (index / (data.length - 1)) * plotWidth;
  const y = (value: number) => pad.top + ((max - value) / range) * plotHeight;
  const pathFor = (selector: (point: typeof data[number]) => number) => data.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index).toFixed(1)} ${y(selector(point)).toFixed(1)}`).join(' ');
  const maxRain = Math.max(0.01, ...data.map(point => point.precipitationSumIn));
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Past 30 days</p><p className="text-sm font-semibold text-slate-900">Temperature range and rainfall</p></div><div className="flex gap-3 text-[11px] text-slate-500"><span>High</span><span>Low</span><span>Rain</span></div></div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Thirty-day high and low temperatures with rainfall and climate normal comparison" className="h-auto w-full">
        {[0, 0.5, 1].map(fraction => { const gridY = pad.top + fraction * plotHeight; const label = Math.round(max - fraction * range); return <g key={fraction}><line x1={pad.left} x2={width - pad.right} y1={gridY} y2={gridY} className="stroke-slate-200" /><text x={pad.left - 7} y={gridY + 4} textAnchor="end" className="fill-slate-400 text-[10px]">{label}°</text></g>; })}
        {normalHigh != null ? <g><line x1={pad.left} x2={width - pad.right} y1={y(normalHigh)} y2={y(normalHigh)} strokeDasharray="5 5" className="stroke-amber-400" /><text x={width - pad.right} y={y(normalHigh) - 5} textAnchor="end" className="fill-amber-600 text-[10px]">Normal high {Math.round(normalHigh)}°</text></g> : null}
        {normalLow != null ? <line x1={pad.left} x2={width - pad.right} y1={y(normalLow)} y2={y(normalLow)} strokeDasharray="5 5" className="stroke-sky-300" /> : null}
        {data.map((point, index) => { const barHeight = (point.precipitationSumIn / maxRain) * plotHeight * 0.35; return <rect key={point.date} x={x(index) - 3} y={pad.top + plotHeight - barHeight} width="6" height={barHeight} rx="2" className="fill-sky-200/80" />; })}
        <path d={pathFor(point => point.tempMaxF)} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-amber-500" />
        <path d={pathFor(point => point.tempMinF)} fill="none" strokeWidth="3" strokeLinecap="round" className="stroke-sky-600" />
        <text x={pad.left} y={height - 8} className="fill-slate-500 text-[10px]">{new Date(`${data[0].date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>
        <text x={width - pad.right} y={height - 8} textAnchor="end" className="fill-slate-500 text-[10px]">{new Date(`${data[data.length - 1].date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>
      </svg>
    </div>
  );
}

function ClimateNormalsChart({ monthly }: { monthly: ClimateNormalsMonthlyPoint[] }) {
  const data = monthly;
  const usable = data.filter(point => point.avgHighF != null && point.avgLowF != null);
  if (usable.length < 2) return <SectionUnavailable reason="climate_normals_unavailable" />;
  const width = 720; const height = 220; const pad = { left: 40, right: 14, top: 18, bottom: 34 };
  const values = usable.flatMap(point => [point.avgHighF!, point.avgLowF!]); const min = Math.floor(Math.min(...values) - 5); const max = Math.ceil(Math.max(...values) + 5); const range = Math.max(1, max - min);
  const x = (index: number) => pad.left + (index / (usable.length - 1)) * (width - pad.left - pad.right); const y = (value: number) => pad.top + ((max - value) / range) * (height - pad.top - pad.bottom);
  const highPath = usable.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.avgHighF!)}`).join(' '); const lowPath = usable.map((point, index) => `${index ? 'L' : 'M'} ${x(index)} ${y(point.avgLowF!)}`).join(' ');
  return <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly climate-normal high and low temperatures" className="h-auto w-full"><path d={highPath} fill="none" strokeWidth="3" className="stroke-amber-500" /><path d={lowPath} fill="none" strokeWidth="3" className="stroke-sky-600" />{usable.map((point, index) => <g key={point.month}><circle cx={x(index)} cy={y(point.avgHighF!)} r="3" className="fill-white stroke-amber-500" strokeWidth="2" /><text x={x(index)} y={height - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">{new Date(2000, point.month - 1, 1).toLocaleDateString([], { month: 'short' })}</text></g>)}</svg>;
}

const DROUGHT_LEVEL: Record<string, number> = { None: 0, D0: 1, D1: 2, D2: 3, D3: 4, D4: 5 };
function DroughtProgression({ history }: { history: DroughtData['history'] }) {
  const data = history.slice(-12);
  if (data.length === 0) return null;
  const tone = (category: string) => category === 'D4' ? 'bg-red-600' : category === 'D3' ? 'bg-orange-600' : category === 'D2' ? 'bg-orange-400' : category === 'D1' ? 'bg-amber-400' : category === 'D0' ? 'bg-yellow-300' : 'bg-emerald-300';
  return <div><div className="flex h-28 items-end gap-1.5" role="img" aria-label="Twelve-week drought severity progression">{data.map(point => <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><span className="text-[9px] text-slate-500">{point.dominantCategory}</span><div className={`w-full rounded-t ${tone(point.dominantCategory)}`} style={{ height: `${18 + DROUGHT_LEVEL[point.dominantCategory] * 12}px` }} title={`${point.date}: ${point.dominantCategory}`} /></div>)}</div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{new Date(`${data[0].date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span><span>Latest</span></div></div>;
}

function FacilityProximityPlot({ facilities, radiusMiles, propertyLat, propertyLon }: { facilities: EnvironmentalHazardsData['facilities']; radiusMiles: number; propertyLat: number | null; propertyLon: number | null }) {
  const located = facilities.filter(facility => facility.distanceMiles != null && facility.latitude != null && facility.longitude != null);
  if (located.length === 0 || propertyLat == null || propertyLon == null) return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">Facility coordinates unavailable for proximity view.</div>;
  const center = 150; const radius = 120;
  return <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proximity view · {radiusMiles} mile radius</p><svg viewBox="0 0 300 300" role="img" aria-label="EPA facility proximity around the property" className="mx-auto mt-2 max-h-72 w-full"><circle cx={center} cy={center} r={radius} className="fill-sky-50 stroke-slate-300" strokeDasharray="5 5" /><circle cx={center} cy={center} r={radius / 2} className="fill-none stroke-slate-200" /><circle cx={center} cy={center} r="10" className="fill-teal-600 stroke-white" strokeWidth="3" /><text x={center} y={center + 25} textAnchor="middle" className="fill-slate-700 text-[10px]">Your home</text>{located.map(facility => { const northMiles = (facility.latitude! - propertyLat) * 69; const eastMiles = (facility.longitude! - propertyLon) * 69 * Math.cos(propertyLat * Math.PI / 180); const dotX = center + Math.max(-radius, Math.min(radius, eastMiles / radiusMiles * radius)); const dotY = center - Math.max(-radius, Math.min(radius, northMiles / radiusMiles * radius)); return <g key={facility.registryId}><circle cx={dotX} cy={dotY} r={facility.significantNoncompliance ? 8 : 6} className={facility.significantNoncompliance ? 'fill-red-500 stroke-white' : 'fill-amber-500 stroke-white'} strokeWidth="2"><title>{facility.name} · {facility.distanceMiles} mi</title></circle></g>; })}<text x={center} y="292" textAnchor="middle" className="fill-slate-500 text-[10px]">Approximate position from EPA coordinates</text></svg></div>;
}

function SectionUnavailable({ reason }: { reason?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
      <AlertTriangle className="h-4 w-4 shrink-0 text-slate-400" />
      <span>Data temporarily unavailable{reason ? ` (${reason})` : ''}.</span>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function WeatherSection({ result, climate }: { result: SectionResult<WeatherReportData>; climate: SectionResult<ClimateSectionData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={CloudSun} title="Weather">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { current, hourly, tenDayForecast, thirtyDayHistory } = result.data;
  const CurrentIcon = weatherIcon(current.weatherCode);
  const currentMonth = new Date().getMonth() + 1;
  const currentNormal = climate.status === 'ok' && climate.data.normals.status === 'ok'
    ? climate.data.normals.data.monthly.find(month => month.month === currentMonth)
    : null;

  return (
    <SectionCard icon={CloudSun} title="Weather" description={weatherLabel(current.weatherCode)}>
      <div className="space-y-6">
        <div className="grid gap-4 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-amber-50 p-5 sm:grid-cols-[minmax(0,1.25fr)_minmax(280px,1fr)] sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-amber-500 shadow-sm"><CurrentIcon className="h-11 w-11" /></div>
            <div><p className="text-sm font-medium text-slate-600">Right now</p><p className="mt-1 text-5xl font-bold tracking-tight text-slate-950">{Math.round(current.temperatureF)}°</p><p className="mt-1 text-sm text-slate-600">{weatherLabel(current.weatherCode)} · Feels like {Math.round(current.apparentTemperatureF)}°F</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2 self-center">
            <div className="rounded-xl bg-white/75 p-3"><Droplets className="h-4 w-4 text-sky-600" /><p className="mt-2 text-xs text-slate-500">Humidity</p><p className="font-bold text-slate-900">{current.humidityPercent}%</p></div>
            <div className="rounded-xl bg-white/75 p-3"><Wind className="h-4 w-4 text-teal-600" /><p className="mt-2 text-xs text-slate-500">Wind</p><p className="font-bold text-slate-900">{Math.round(current.windSpeedMph)} mph</p></div>
            <div className="rounded-xl bg-white/75 p-3"><CloudRain className="h-4 w-4 text-indigo-600" /><p className="mt-2 text-xs text-slate-500">Rain now</p><p className="font-bold text-slate-900">{current.precipitationIn.toFixed(2)} in</p></div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Coming up</p><h3 className="mt-1 text-lg font-bold text-slate-950">7-day forecast</h3></div><p className="text-xs text-slate-500">High / low · precipitation</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {tenDayForecast.slice(0, 7).map((day, index) => {
              const DayIcon = weatherIcon(day.weatherCode);
              const weatherRisk = [65, 75, 82, 95, 96, 99].includes(day.weatherCode);
              return (
                <div key={day.date} className={weatherRisk ? 'rounded-xl border border-amber-200 bg-amber-50/70 p-3' : 'rounded-xl border border-slate-200 bg-white p-3'}>
                  <p className="text-xs font-semibold text-slate-700">{index === 0 ? 'Today' : new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' })}</p>
                  <DayIcon className={weatherRisk ? 'my-3 h-7 w-7 text-amber-600' : 'my-3 h-7 w-7 text-sky-600'} />
                  <p className="text-sm font-bold text-slate-950">{Math.round(day.tempMaxF)}° <span className="font-medium text-slate-400">{Math.round(day.tempMinF)}°</span></p>
                  <p className="mt-1 text-[11px] text-slate-500">{day.precipitationSumIn.toFixed(2)} in</p>
                  {weatherRisk ? <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Watch</p> : null}
                </div>
              );
            })}
          </div>
        </div>

        <div><h3 className="mb-3 text-lg font-bold text-slate-950">Hourly outlook</h3><HourlyWeatherChart points={hourly} /></div>
        <WeatherHistoryChart history={thirtyDayHistory} normalHigh={currentNormal?.avgHighF} normalLow={currentNormal?.avgLowF} />

        <details className="rounded-xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">View detailed weather data</summary>
          <div className="grid gap-5 border-t border-slate-200 p-4 lg:grid-cols-3">
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Hourly</p><div className="max-h-64 overflow-y-auto"><SimpleTable rows={hourly.slice(0, 24).map(h => [new Date(h.time).toLocaleTimeString([], { hour: 'numeric' }), `${Math.round(h.temperatureF)}°F`, `${h.precipitationProbabilityPercent}% precip`])} /></div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">10-day forecast</p><div className="max-h-64 overflow-y-auto"><SimpleTable rows={tenDayForecast.map(d => [new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }), `${Math.round(d.tempMaxF)}° / ${Math.round(d.tempMinF)}°F`, `${d.precipitationSumIn.toFixed(2)}in`])} /></div></div>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">30-day history</p><div className="max-h-64 overflow-y-auto">{thirtyDayHistory.length === 0 ? <SectionUnavailable reason="history_unavailable" /> : <SimpleTable rows={thirtyDayHistory.map(d => [new Date(`${d.date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }), `${Math.round(d.tempMaxF)}° / ${Math.round(d.tempMinF)}°F`, `${d.precipitationSumIn.toFixed(2)}in`])} />}</div></div>
          </div>
        </details>
      </div>
    </SectionCard>
  );
}

function AirQualitySection({ result }: { result: SectionResult<AirQualityData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={Wind} title="Air Quality">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { current, history } = result.data;

  return (
    <SectionCard icon={Wind} title="Air Quality">
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.4fr)]">
          <div className="space-y-3"><AqiGauge aqi={current.aqi} /><div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">PM2.5</p><p className="mt-1 text-lg font-bold text-slate-950">{current.pm2_5} <span className="text-xs font-medium text-slate-500">µg/m³</span></p></div><div className="rounded-xl border border-slate-200 p-3"><p className="text-xs text-slate-500">PM10</p><p className="mt-1 text-lg font-bold text-slate-950">{current.pm10} <span className="text-xs font-medium text-slate-500">µg/m³</span></p></div></div></div>
          <AqiTrendChart history={history} />
        </div>
        {history.length > 0 ? <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">View detailed air-quality data</summary><div className="max-h-64 overflow-y-auto border-t border-slate-200 p-4"><SimpleTable rows={history.slice(-14).map(h => [new Date(`${h.date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }), `AQI ${h.avgAqi}`, `PM2.5 ${h.avgPm2_5}`])} /></div></details> : null}
      </div>
    </SectionCard>
  );
}

function DroughtSection({ result }: { result: SectionResult<DroughtData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={Droplets} title="Drought">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { current, history } = result.data;

  return (
    <SectionCard icon={Droplets} title="Drought" description="US Drought Monitor, published weekly">
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current category</p><p className="mt-2 text-4xl font-bold text-slate-950">{current?.dominantCategory ?? '—'}</p><p className="mt-2 text-sm text-slate-600">{current?.dominantCategory === 'None' ? 'No drought classification currently dominates the area.' : 'Dry conditions may affect soil, landscaping, and irrigation planning.'}</p></div>
        <div className="rounded-xl border border-slate-200 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">12-week progression</p><DroughtProgression history={history} /></div>
      </div>
      {history.length > 0 ? <details className="mt-4 rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">View weekly drought data</summary><div className="max-h-56 overflow-y-auto border-t border-slate-200 p-4"><SimpleTable rows={history.slice().reverse().map(w => [new Date(`${w.date}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }), w.dominantCategory, ''])} /></div></details> : null}
    </SectionCard>
  );
}

function FloodElevationSection({ result }: { result: SectionResult<FloodElevationData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={Waves} title="Flood & Elevation">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { femaFloodZone, femaZoneSubtype, elevationFeet } = result.data;
  const highRisk = Boolean(femaFloodZone && /^(A|AE|AH|AO|AR|A99|V|VE)$/i.test(femaFloodZone));

  return (
    <SectionCard icon={Waves} title="Flood & Elevation">
      <div className="grid gap-5 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.4fr)]">
        <div className={highRisk ? 'rounded-xl border border-amber-300 bg-amber-50 p-5' : 'rounded-xl border border-emerald-200 bg-emerald-50/60 p-5'}><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">FEMA flood designation</p><div className="mt-2 flex items-center gap-3"><p className="text-4xl font-bold text-slate-950">{femaFloodZone ?? '—'}</p><Badge variant={highRisk ? 'destructive' : 'secondary'}>{highRisk ? 'Higher exposure' : 'Lower mapped exposure'}</Badge></div><p className="mt-3 text-sm text-slate-600">{femaZoneSubtype || 'Point-based FEMA NFHL classification for this property location.'}</p></div>
        <div className="rounded-xl border border-slate-200 p-5"><div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exposure context</p><p className="mt-1 text-lg font-bold text-slate-950">{elevationFeet != null ? `${Math.round(elevationFeet)} ft elevation` : 'Elevation unavailable'}</p></div><Waves className="h-8 w-8 text-sky-500" /></div><div className="mt-5 grid grid-cols-4 gap-1"><div className="h-3 rounded-l-full bg-emerald-300" /><div className="h-3 bg-yellow-300" /><div className="h-3 bg-orange-400" /><div className="h-3 rounded-r-full bg-red-500" /></div><div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>Lower mapped exposure</span><span>Higher mapped exposure</span></div><p className="mt-4 text-xs text-slate-500">Flood zones describe mapped exposure, not whether a specific storm will cause flooding. Pair this with active rain insights and drainage history.</p></div>
      </div>
    </SectionCard>
  );
}

function RadonSection({ result }: { result: SectionResult<RadonData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={Radiation} title="Radon">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { zone, zoneDescription, countyName, stateName } = result.data;
  return (
    <SectionCard
      icon={Radiation}
      title="Radon"
      description={countyName && stateName ? `${countyName}, ${stateName} — EPA county radon zone map` : 'EPA county radon zone map'}
    >
      <div className="flex items-center gap-3">
        <Badge variant={zone === 1 ? 'destructive' : zone === 2 ? 'secondary' : 'outline'}>Zone {zone}</Badge>
        <span className="text-sm text-slate-600">{zoneDescription}</span>
      </div>
    </SectionCard>
  );
}

function HazardsSection({ result, propertyLat, propertyLon }: { result: SectionResult<EnvironmentalHazardsData>; propertyLat: number | null; propertyLon: number | null }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={Factory} title="Environmental Hazards">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { facilities, totalFacilitiesInRadius, totalPenaltiesInRadius, searchRadiusMiles } = result.data;

  return (
    <SectionCard
      icon={Factory}
      title="Environmental Hazards"
      description={`EPA-regulated facilities within ${searchRadiusMiles} mile${searchRadiusMiles === 1 ? '' : 's'}`}
    >
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Facilities nearby" value={String(totalFacilitiesInRadius)} />
        <Stat label="Total penalties" value={totalPenaltiesInRadius ?? '$0'} />
        <Stat label="Flagged facilities" value={String(facilities.length)} />
      </div>
      {facilities.length === 0 ? (
        <p className="text-sm text-slate-500">No facilities with compliance issues found nearby.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.15fr)]">
          <FacilityProximityPlot facilities={facilities} radiusMiles={searchRadiusMiles} propertyLat={propertyLat} propertyLon={propertyLon} />
          <div className="max-h-72 space-y-2 overflow-y-auto">
          {facilities.map(f => (
            <div key={f.registryId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{f.name}</p>
                {f.significantNoncompliance && <Badge variant="destructive">SNC</Badge>}
              </div>
              <p className="text-xs text-slate-500">{f.address}</p>
              {f.distanceMiles != null ? <p className="mt-1 text-xs font-medium text-slate-600">Approximately {f.distanceMiles} miles away</p> : null}
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {f.programs.map(p => (
                  <Badge key={p} variant="outline" className="text-[10px]">
                    {p}
                  </Badge>
                ))}
                {f.complianceStatus && <span className="text-xs text-slate-500">{f.complianceStatus}</span>}
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function ClimateSection({ result }: { result: SectionResult<ClimateSectionData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={Thermometer} title="Climate">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { normals, hardinessZone } = result.data;

  return (
    <SectionCard icon={Thermometer} title="Climate">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Plant Hardiness Zone</p>
          {hardinessZone.status === 'ok' ? (
            <div className="flex items-center gap-3">
              <Badge>{hardinessZone.data.zone}</Badge>
              <span className="text-sm text-slate-600">{hardinessZone.data.temperatureRangeF}°F</span>
            </div>
          ) : (
            <SectionUnavailable reason={hardinessZone.reason} />
          )}
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">1991-2020 Climate Normals</p>
          {normals.status === 'ok' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Nearest station: {normals.data.stationName}</p>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Stat
                  label="Heating degree days"
                  value={normals.data.annualHeatingDegreeDays != null ? String(Math.round(normals.data.annualHeatingDegreeDays)) : '—'}
                />
                <Stat
                  label="Cooling degree days"
                  value={normals.data.annualCoolingDegreeDays != null ? String(Math.round(normals.data.annualCoolingDegreeDays)) : '—'}
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3"><div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seasonal temperature pattern</p><p className="text-[10px] text-slate-500">High / low</p></div><ClimateNormalsChart monthly={normals.data.monthly} /></div>
              <details className="rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">View monthly climate data</summary><div className="max-h-56 overflow-y-auto border-t border-slate-200 p-4"><SimpleTable rows={normals.data.monthly.map(m => [new Date(2000, m.month - 1, 1).toLocaleDateString([], { month: 'short' }), m.avgHighF != null ? `${Math.round(m.avgHighF)}°` : '—', m.avgLowF != null ? `${Math.round(m.avgLowF)}°` : '—'])} /></div></details>
            </div>
          ) : (
            <SectionUnavailable reason={normals.reason} />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'moderate' | 'unhealthy' }) {
  const toneClass =
    tone === 'good' ? 'text-emerald-600' : tone === 'moderate' ? 'text-amber-600' : tone === 'unhealthy' ? 'text-red-600' : 'text-slate-900';
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SimpleTable({ rows }: { rows: [string, string, string][] }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-100 last:border-0">
            {row.map((cell, j) => (
              <td key={j} className="py-1.5 pr-3 text-slate-700">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function EnvironmentReportPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const propertyId = Array.isArray(params.id) ? params.id[0] ?? '' : params.id ?? '';
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['environment-report', propertyId],
    queryFn: async () => {
      const response = await api.getEnvironmentReport(propertyId);
      if (response.success) return response.data;
      throw new Error('message' in response ? response.message : 'Failed to load environment report');
    },
    enabled: Boolean(propertyId),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  if (query.isLoading || !propertyId) {
    return (
      <DashboardShell>
        <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100 animate-pulse">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <DashboardShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Failed to Load Environment Report
            </CardTitle>
            <CardDescription>There was a problem retrieving this property&apos;s environment data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Try Again
            </Button>
          </CardContent>
        </Card>
      </DashboardShell>
    );
  }

  const report = query.data;
  const { sections } = report;

  return (
    <DashboardShell>
      <PageHeader>
        <Button
          variant="link"
          className="p-0 h-auto mb-2 text-sm text-muted-foreground min-h-[44px] flex items-center"
          onClick={() => navigateBackWithDashboardFallback(router)}
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <PageHeaderHeading className="flex items-center gap-2">
          <CloudSun className="h-8 w-8 text-primary" /> Environment Report
        </PageHeaderHeading>
        <p className="mt-2 text-sm text-muted-foreground">
          {report.property.name ? `${report.property.name} · ` : ''}{report.property.address}, {report.property.city}, {report.property.state} {report.property.zipCode}
          {' · '}Updated {new Date(report.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </p>
      </PageHeader>

      <div className="space-y-6">
        {savedMessage ? (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />{savedMessage}
          </div>
        ) : null}
        <InsightSummary
          propertyId={propertyId}
          insights={report.insights ?? []}
          questions={report.questions ?? []}
          plantAdvisorModules={report.plantAdvisorModules ?? []}
          onSaved={async () => {
            setSavedMessage('Saved to your home profile. Future environment recommendations will use this information.');
            await query.refetch();
            await queryClient.invalidateQueries({ queryKey: ['active-incidents', propertyId] });
          }}
        />
        <HomeSystemsOutlook insights={report.insights ?? []} />
        <WeatherSection result={sections.weather} climate={sections.climate} />
        <AirQualitySection result={sections.airQuality} />
        <FloodElevationSection result={sections.floodElevation} />
        <DroughtSection result={sections.drought} />
        <RadonSection result={sections.radon} />
        <HazardsSection result={sections.hazards} propertyLat={report.location.latitude} propertyLon={report.location.longitude} />
        <ClimateSection result={sections.climate} />
      </div>
    </DashboardShell>
  );
}
