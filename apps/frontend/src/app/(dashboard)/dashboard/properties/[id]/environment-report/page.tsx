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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArrowLeft, ArrowRight, AlertTriangle, CheckCircle2, Clock3, Loader2, CloudRain, CloudSnow, CloudSun, Flame, ShieldAlert, Snowflake, Wind, Droplets, Waves, Radiation, Factory, Thermometer } from 'lucide-react';
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
  EnvironmentInsight,
  EnvironmentQuestion,
} from '@/types';

function IncrementalQuestions({
  propertyId,
  questions,
  onSaved,
}: {
  propertyId: string;
  questions: EnvironmentQuestion[];
  onSaved: (prompt: string) => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [years, setYears] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const saveAnswer = async (question: EnvironmentQuestion, value: string | number | boolean) => {
    setError(null);
    setSavingId(question.id);
    try {
      const response = await api.updateProperty(
        propertyId,
        { [question.field]: value } as Parameters<typeof api.updateProperty>[1]
      );
      if (!response.success) throw new Error('message' in response ? response.message : 'Unable to save answer');
      await onSaved(question.prompt);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this answer. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  if (questions.length === 0) return null;

  return (
    <Card className="border-violet-200 bg-violet-50/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Help us tailor this outlook to your home</CardTitle>
        <CardDescription>Answering these relevant details improves the active recommendations. Your answers are saved to this home and will not be asked again.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {questions.map(question => (
          <div key={question.id} className="rounded-xl border border-violet-200 bg-white p-4">
            <p className="font-semibold text-slate-950">{question.prompt}</p>
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
                  type="number"
                  min="1700"
                  max={new Date().getFullYear()}
                  placeholder={question.placeholder}
                  value={years[question.id] ?? ''}
                  onChange={event => setYears(current => ({ ...current, [question.id]: event.target.value }))}
                  className="min-h-9 w-36 rounded-md border border-slate-300 bg-white px-3 text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={savingId !== null || !years[question.id]}
                  onClick={() => {
                    const year = Number(years[question.id]);
                    if (year >= 1700 && year <= new Date().getFullYear()) void saveAnswer(question, year);
                    else setError('Enter a valid four-digit year.');
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
      </CardContent>
    </Card>
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

function InsightSummary({ insights }: { insights: EnvironmentInsight[] }) {
  if (insights.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/70">
        <CardContent className="flex items-start gap-3 p-5">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-950">No immediate environment concerns</p>
            <p className="mt-1 text-sm text-emerald-800">We did not detect weather or environmental conditions that need action right now.</p>
          </div>
        </CardContent>
      </Card>
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

function WeatherSection({ result }: { result: SectionResult<WeatherReportData> }) {
  if (result.status !== 'ok') {
    return (
      <SectionCard icon={CloudSun} title="Weather">
        <SectionUnavailable reason={result.reason} />
      </SectionCard>
    );
  }
  const { current, hourly, tenDayForecast, thirtyDayHistory } = result.data;

  return (
    <SectionCard icon={CloudSun} title="Weather" description={weatherLabel(current.weatherCode)}>
      <Tabs defaultValue="current">
        <TabsList>
          <TabsTrigger value="current">Current</TabsTrigger>
          <TabsTrigger value="hourly">Hourly</TabsTrigger>
          <TabsTrigger value="forecast">10-Day Forecast</TabsTrigger>
          <TabsTrigger value="history">30-Day History</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="mt-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Temperature" value={`${Math.round(current.temperatureF)}°F`} />
            <Stat label="Feels like" value={`${Math.round(current.apparentTemperatureF)}°F`} />
            <Stat label="Humidity" value={`${current.humidityPercent}%`} />
            <Stat label="Wind" value={`${Math.round(current.windSpeedMph)} mph`} />
          </div>
        </TabsContent>

        <TabsContent value="hourly" className="mt-4">
          <div className="max-h-64 overflow-y-auto">
            <SimpleTable
              rows={hourly.slice(0, 24).map(h => [
                new Date(h.time).toLocaleTimeString([], { hour: 'numeric' }),
                `${Math.round(h.temperatureF)}°F`,
                `${h.precipitationProbabilityPercent}% precip`,
              ])}
            />
          </div>
        </TabsContent>

        <TabsContent value="forecast" className="mt-4">
          <SimpleTable
            rows={tenDayForecast.map(d => [
              new Date(d.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }),
              `${Math.round(d.tempMaxF)}° / ${Math.round(d.tempMinF)}°F`,
              `${d.precipitationSumIn.toFixed(2)}in`,
            ])}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <div className="max-h-64 overflow-y-auto">
            {thirtyDayHistory.length === 0 ? (
              <SectionUnavailable reason="history_unavailable" />
            ) : (
              <SimpleTable
                rows={thirtyDayHistory.map(d => [
                  new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
                  `${Math.round(d.tempMaxF)}° / ${Math.round(d.tempMinF)}°F`,
                  `${d.precipitationSumIn.toFixed(2)}in`,
                ])}
              />
            )}
          </div>
        </TabsContent>
      </Tabs>
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
  const tone = current.aqi <= 50 ? 'good' : current.aqi <= 100 ? 'moderate' : 'unhealthy';

  return (
    <SectionCard icon={Wind} title="Air Quality">
      <div className="mb-4 grid grid-cols-3 gap-4">
        <Stat label="AQI" value={String(current.aqi)} tone={tone} />
        <Stat label="PM2.5" value={`${current.pm2_5} µg/m³`} />
        <Stat label="PM10" value={`${current.pm10} µg/m³`} />
      </div>
      {history.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          <SimpleTable
            rows={history.slice(-14).map(h => [
              new Date(h.date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
              `AQI ${h.avgAqi}`,
              `PM2.5 ${h.avgPm2_5}`,
            ])}
          />
        </div>
      )}
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
      <div className="mb-4">
        <Badge variant={current?.dominantCategory === 'None' ? 'secondary' : 'destructive'}>
          {current ? current.dominantCategory : 'No data'}
        </Badge>
      </div>
      {history.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          <SimpleTable
            rows={history
              .slice()
              .reverse()
              .map(w => [new Date(w.date).toLocaleDateString([], { month: 'short', day: 'numeric' }), w.dominantCategory, ''])}
          />
        </div>
      )}
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

  return (
    <SectionCard icon={Waves} title="Flood & Elevation">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="FEMA Flood Zone" value={femaFloodZone ?? '—'} />
        <Stat label="Zone Detail" value={femaZoneSubtype ?? '—'} />
        <Stat label="Elevation" value={elevationFeet != null ? `${Math.round(elevationFeet)} ft` : '—'} />
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

function HazardsSection({ result }: { result: SectionResult<EnvironmentalHazardsData> }) {
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
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {facilities.map(f => (
            <div key={f.registryId} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{f.name}</p>
                {f.significantNoncompliance && <Badge variant="destructive">SNC</Badge>}
              </div>
              <p className="text-xs text-slate-500">{f.address}</p>
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
              <div className="max-h-48 overflow-y-auto">
                <SimpleTable
                  rows={normals.data.monthly.map(m => [
                    new Date(2000, m.month - 1, 1).toLocaleDateString([], { month: 'short' }),
                    m.avgHighF != null ? `${Math.round(m.avgHighF)}°` : '—',
                    m.avgLowF != null ? `${Math.round(m.avgLowF)}°` : '—',
                  ])}
                />
              </div>
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
        <InsightSummary insights={report.insights ?? []} />
        {savedMessage ? (
          <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4" />{savedMessage}
          </div>
        ) : null}
        <IncrementalQuestions
          propertyId={propertyId}
          questions={report.questions ?? []}
          onSaved={async () => {
            setSavedMessage('Saved to your home profile. Future environment recommendations will use this information.');
            await query.refetch();
            await queryClient.invalidateQueries({ queryKey: ['active-incidents', propertyId] });
          }}
        />
        <WeatherSection result={sections.weather} />
        <AirQualitySection result={sections.airQuality} />
        <FloodElevationSection result={sections.floodElevation} />
        <DroughtSection result={sections.drought} />
        <RadonSection result={sections.radon} />
        <HazardsSection result={sections.hazards} />
        <ClimateSection result={sections.climate} />
      </div>
    </DashboardShell>
  );
}
