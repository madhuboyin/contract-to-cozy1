'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, CloudSun, Droplets, Leaf, Loader2, Plus, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createGardenZone, createHomePlant, getPlantCareOutlook, updateHomePlantCare } from './plantAdvisorApi';
import type { GardenIrrigationType, GardenSoilDrainage, GardenSunExposure } from './types';

const NOW = () => new Date().toISOString();

type PlantWeatherContext = 'heat' | 'freeze' | 'low_humidity' | 'storm' | 'air_quality';

const WEATHER_CONTEXT_LABELS: Record<PlantWeatherContext, string> = {
  heat: 'heat',
  freeze: 'freeze',
  low_humidity: 'low-humidity',
  storm: 'storm',
  air_quality: 'air-quality',
};

export function usePlantCareOutlook(propertyId: string) {
  return useQuery({
    queryKey: ['plant-care-outlook', propertyId],
    queryFn: () => getPlantCareOutlook(propertyId),
    staleTime: 15 * 60_000,
  });
}

function OutlookLoadingCard() {
  return (
    <Card>
      <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Building weather-aware plant guidance…
      </CardContent>
    </Card>
  );
}

function OutlookErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-medium">Plant care outlook is temporarily unavailable.</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export function PlantCareSection({
  propertyId,
  weatherContext,
  focusedRoomName,
}: {
  propertyId: string;
  weatherContext?: PlantWeatherContext | null;
  focusedRoomName?: string | null;
}) {
  const queryClient = useQueryClient();
  const outlook = usePlantCareOutlook(propertyId);
  const careMutation = useMutation({
    mutationFn: ({ plantId, action }: { plantId: string; action: 'water' | 'inspect' }) =>
      updateHomePlantCare(propertyId, plantId, action === 'water' ? { lastWateredAt: NOW(), lastInspectedAt: NOW() } : { lastInspectedAt: NOW() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plant-care-outlook', propertyId] }),
  });

  if (outlook.isLoading) return <OutlookLoadingCard />;
  if (outlook.isError || !outlook.data) return <OutlookErrorCard onRetry={() => outlook.refetch()} />;

  const data = outlook.data;
  const contextTrigger = weatherContext === 'air_quality' ? 'poor_air_quality' : weatherContext;
  const contextualCareRecommendations = contextTrigger
    ? data.careRecommendations.filter(item => item.triggers.includes(contextTrigger))
    : data.careRecommendations;
  const careRecommendations = focusedRoomName
    ? [...contextualCareRecommendations].sort((left, right) => {
        const leftFocused = left.locationName === focusedRoomName ? 1 : 0;
        const rightFocused = right.locationName === focusedRoomName ? 1 : 0;
        return rightFocused - leftFocused;
      })
    : contextualCareRecommendations;
  const contextLabel = weatherContext ? WEATHER_CONTEXT_LABELS[weatherContext] : null;

  return (
    <section className="space-y-4" aria-labelledby="plant-care-outlook-title">
      <div>
        <h2 id="plant-care-outlook-title" className="text-lg font-bold">
          {contextLabel ? `${contextLabel.charAt(0).toUpperCase()}${contextLabel.slice(1)} plant guidance` : 'Weather-aware care'}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {contextLabel
            ? `Recommendations below are focused on the ${contextLabel} conditions that brought you here.`
            : 'Guidance adapts to current weather, confirmed plants, and your USDA hardiness context.'}
        </p>
      </div>

      {data.plants.length === 0 ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <Leaf className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">
              Add a recommendation to your home to receive individual care guidance.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {careRecommendations.length === 0 && data.plants.length > 0 ? (
        <Card>
          <CardContent className="flex items-start gap-3 p-5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-emerald-800">
              {contextLabel
                ? `No additional ${contextLabel} care changes are recommended for confirmed plants right now.`
                : 'No weather-driven care changes are recommended right now.'}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {careRecommendations.map(item => (
          <div key={item.id} className="flex flex-col rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{item.title}</p>
              <Badge variant={item.priority === 'NOW' ? 'destructive' : 'secondary'}>
                {item.priority === 'NOW' ? 'Act now' : 'Prepare soon'}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {item.locationName} · {item.triggers.join(' · ').replaceAll('_', ' ')}
            </p>
            {item.adjustedCheckCadenceDays && item.wateringCadenceDays && item.adjustedCheckCadenceDays !== item.wateringCadenceDays ? (
              <p className="mt-2 text-sm font-medium text-blue-800">
                Check soil about every {item.adjustedCheckCadenceDays} days instead of every {item.wateringCadenceDays} days.
              </p>
            ) : null}
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-medium text-emerald-800">Care details</summary>
              <p className="mt-2">{item.guidance}</p>
              {item.adjustedCheckCadenceDays && item.wateringCadenceDays && item.adjustedCheckCadenceDays !== item.wateringCadenceDays ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  This is a check cadence, not automatic watering.
                </p>
              ) : null}
            </details>
            {item.placementWarning ? (
              <p className="mt-2 flex gap-2 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {item.placementWarning}
              </p>
            ) : null}
            <div className="mt-auto flex flex-wrap gap-2 pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={careMutation.isPending}
                onClick={() => careMutation.mutate({ plantId: item.homePlantId, action: 'inspect' })}
              >
                Mark inspected
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={careMutation.isPending}
                onClick={() => careMutation.mutate({ plantId: item.homePlantId, action: 'water' })}
              >
                <Droplets className="mr-1 h-4 w-4" />
                Watered after checking
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function GardenZonesSection({ propertyId }: { propertyId: string }) {
  const queryClient = useQueryClient();
  const outlook = usePlantCareOutlook(propertyId);
  const [zoneName, setZoneName] = React.useState('');
  const [sunExposure, setSunExposure] = React.useState<GardenSunExposure>('UNKNOWN');
  const [soilDrainage, setSoilDrainage] = React.useState<GardenSoilDrainage>('UNKNOWN');
  const [irrigationType, setIrrigationType] = React.useState<GardenIrrigationType>('UNKNOWN');
  const [frostPocket, setFrostPocket] = React.useState(false);
  const [plantName, setPlantName] = React.useState('');
  const [gardenZoneId, setGardenZoneId] = React.useState('');

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plant-care-outlook', propertyId] });
  const zoneMutation = useMutation({
    mutationFn: () => createGardenZone(propertyId, { name: zoneName.trim(), sunExposure, soilDrainage, irrigationType, frostPocket }),
    onSuccess: async zone => {
      setZoneName('');
      setGardenZoneId(zone.id);
      await refresh();
    },
  });
  const plantMutation = useMutation({
    mutationFn: () => createHomePlant(propertyId, { name: plantName.trim(), locationType: 'OUTDOOR', gardenZoneId }),
    onSuccess: async () => { setPlantName(''); await refresh(); },
  });

  if (outlook.isLoading) return <OutlookLoadingCard />;
  if (outlook.isError || !outlook.data) return <OutlookErrorCard onRetry={() => outlook.refetch()} />;

  const data = outlook.data;
  const outdoorDecision = data.applicability.outdoor;

  if (outdoorDecision.status !== 'APPLICABLE') {
    return (
      <section className="space-y-4" aria-labelledby="garden-zones-title">
        <div>
          <h2 id="garden-zones-title" className="text-lg font-bold">Outdoor garden zones</h2>
          <p className="mt-1 text-sm text-muted-foreground">Outdoor planning uses your private-space and landscaping-responsibility details.</p>
        </div>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                {outdoorDecision.status === 'UNKNOWN' ? 'Confirm your outdoor-space details' : 'Outdoor planning does not apply to this property'}
              </p>
              <p className="mt-1 text-sm text-amber-800">
                {outdoorDecision.status === 'UNKNOWN'
                  ? `Missing: ${outdoorDecision.missingFactKeys.join(', ') || 'property responsibility details'}.`
                  : 'Indoor Plant Advisor remains available.'}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="garden-zones-title">
      <div>
        <h2 id="garden-zones-title" className="text-lg font-bold">Outdoor garden zones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hardiness zone: <span className="font-semibold text-foreground">{data.hardinessZone ?? 'Unavailable'}</span>. Recommendations
          remain conditional until a zone&apos;s sun, drainage, and irrigation are known.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CloudSun className="h-5 w-5 text-emerald-600" />
              Add a garden zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input value={zoneName} onChange={event => setZoneName(event.target.value)} placeholder="Zone name, e.g. Front bed" />
              <Select value={sunExposure} onValueChange={value => setSunExposure(value as GardenSunExposure)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Sun: Not sure</SelectItem>
                  <SelectItem value="FULL_SUN">Full sun</SelectItem>
                  <SelectItem value="PART_SUN">Part sun</SelectItem>
                  <SelectItem value="SHADE">Shade</SelectItem>
                </SelectContent>
              </Select>
              <Select value={soilDrainage} onValueChange={value => setSoilDrainage(value as GardenSoilDrainage)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Drainage: Not sure</SelectItem>
                  <SelectItem value="FAST">Fast drainage</SelectItem>
                  <SelectItem value="MODERATE">Moderate drainage</SelectItem>
                  <SelectItem value="SLOW">Slow drainage</SelectItem>
                </SelectContent>
              </Select>
              <Select value={irrigationType} onValueChange={value => setIrrigationType(value as GardenIrrigationType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UNKNOWN">Irrigation: Not sure</SelectItem>
                  <SelectItem value="NONE">None</SelectItem>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="DRIP">Drip</SelectItem>
                  <SelectItem value="SPRINKLER">Sprinkler</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={frostPocket} onChange={event => setFrostPocket(event.target.checked)} />
              Cold air settles here / known frost pocket
            </label>
            <Button size="sm" disabled={!zoneName.trim() || zoneMutation.isPending} onClick={() => zoneMutation.mutate()}>
              {zoneMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Add garden zone
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Leaf className="h-5 w-5 text-emerald-600" />
              Your zones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No zones yet. Add your first garden zone to start outdoor planning.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {data.zones.map(zone => (
                  <span key={zone.id} className="rounded-full border border-emerald-200 bg-emerald-50/60 px-3 py-1 text-sm">
                    {zone.name}
                  </span>
                ))}
              </div>
            )}

            {data.zones.length > 0 ? (
              <div className="border-t pt-4">
                <p className="text-sm font-semibold">Add an outdoor plant</p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <Input value={plantName} onChange={event => setPlantName(event.target.value)} placeholder="Plant name" />
                  <Select value={gardenZoneId} onValueChange={setGardenZoneId}>
                    <SelectTrigger><SelectValue placeholder="Choose zone" /></SelectTrigger>
                    <SelectContent>
                      {data.zones.map(zone => <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!plantName.trim() || !gardenZoneId || plantMutation.isPending} onClick={() => plantMutation.mutate()}>
                    Add
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {data.gardenRecommendations.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.gardenRecommendations.map(item => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{item.title}</p>
                  <Badge variant="outline">{item.season}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{item.guidance}</p>
                <ul className="mt-3 space-y-1.5">
                  {item.actions.map(action => (
                    <li key={action} className="flex gap-2 text-sm">
                      <Sprout className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      {action}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </section>
  );
}
