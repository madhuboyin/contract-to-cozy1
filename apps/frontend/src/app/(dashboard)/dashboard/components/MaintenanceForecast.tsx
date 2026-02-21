'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Flame, Loader2, Search, Wrench } from 'lucide-react';
import { api } from '@/lib/api/client';
import { MaintenancePrediction } from '@/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

type MaintenanceForecastMode = 'timeline' | 'next-up';

interface MaintenanceForecastProps {
  propertyId: string | undefined;
  mode?: MaintenanceForecastMode;
}

const FORECAST_QUERY_KEY = 'maintenance-predictions';
const PROPERTY_QUERY_KEY = 'property';
const PROPERTIES_QUERY_KEY = 'properties';
const MAINTENANCE_TASK_QUERY_KEY = 'maintenance-tasks';
const FORECAST_FETCH_LIMIT = 24;

type ForecastQueryResult = {
  predictions: MaintenancePrediction[];
  generationError: string | null;
};

function priorityLabel(priority: number) {
  if (priority >= 5) return 'Critical';
  if (priority >= 4) return 'Urgent';
  if (priority >= 3) return 'Medium';
  return 'Routine';
}

function priorityBadgeClass(priority: number) {
  if (priority >= 5) return 'bg-red-100 text-red-700 border-red-200';
  if (priority >= 4) return 'bg-orange-100 text-orange-700 border-orange-200';
  if (priority >= 3) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

/** True when a PENDING prediction's scheduled date has passed. */
function isOverdue(prediction: MaintenancePrediction): boolean {
  return (
    prediction.status === 'OVERDUE' ||
    (prediction.status === 'PENDING' && new Date(prediction.predictedDate) < new Date())
  );
}

/** Visual indicator for the confidence score (0–1). */
function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const dotClass =
    score >= 0.9
      ? 'bg-emerald-500'
      : score >= 0.6
        ? 'bg-amber-400'
        : 'bg-slate-400';
  return (
    <span className="flex items-center gap-1 text-xs text-gray-400">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {pct}% confidence
    </span>
  );
}

function TimelineCard({
  prediction,
  onMarkDone,
  onDismiss,
  onFindPro,
  isPending,
}: {
  prediction: MaintenancePrediction;
  onMarkDone: (prediction: MaintenancePrediction) => void;
  onDismiss: (prediction: MaintenancePrediction) => void;
  onFindPro: (prediction: MaintenancePrediction) => void;
  isPending: boolean;
}) {
  const overdue = isOverdue(prediction);
  const hasActiveBooking =
    prediction.booking &&
    ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(prediction.booking.status);

  return (
    <Card
      className={`min-w-[280px] max-w-[320px] shrink-0 ${
        overdue ? 'border-red-300 bg-red-50/30' : 'border-gray-200'
      }`}
    >
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base leading-snug">{prediction.taskName}</CardTitle>
            {overdue && (
              <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" />
                Overdue
              </span>
            )}
          </div>
          <Badge className={priorityBadgeClass(prediction.priority)}>
            {priorityLabel(prediction.priority)} · P{prediction.priority}
          </Badge>
        </div>
        <CardDescription>
          {format(new Date(prediction.predictedDate), 'MMM d, yyyy')}
          {prediction.inventoryItem?.name ? ` · ${prediction.inventoryItem.name}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-gray-600">
          {prediction.reasoning ?? 'Predicted by your maintenance intelligence engine.'}
        </p>
        <ConfidenceBadge score={prediction.confidenceScore} />
        <Button
          type="button"
          size="sm"
          className="min-h-[44px] w-full px-4"
          disabled={isPending}
          onClick={() => onFindPro(prediction)}
        >
          <Search className="mr-2 h-4 w-4" />
          {hasActiveBooking ? 'View Booking' : 'Find a Pro'}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-[44px] px-4"
            disabled={isPending}
            onClick={() => onMarkDone(prediction)}
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Mark as Done
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-[44px] px-4"
            disabled={isPending}
            onClick={() => onDismiss(prediction)}
          >
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MaintenanceForecast({ propertyId, mode = 'timeline' }: MaintenanceForecastProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: forecastData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ForecastQueryResult>({
    queryKey: [FORECAST_QUERY_KEY, propertyId],
    enabled: Boolean(propertyId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const id = propertyId!;
      let generationError: string | null = null;
      try {
        await api.generateMaintenanceForecast(id);
      } catch (err: any) {
        generationError = err?.message || 'Forecast generation failed.';
      }
      const response = await api.getMaintenanceForecast(id, {
        status: ['PENDING', 'OVERDUE'],
        limit: FORECAST_FETCH_LIMIT,
      });
      if (!response.success) {
        throw new Error(response.message || 'Unable to load maintenance forecast.');
      }
      return {
        predictions: response.data ?? [],
        generationError,
      };
    },
  });

  const predictions = forecastData?.predictions ?? [];
  const generationError = forecastData?.generationError;

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      prediction,
      status,
    }: {
      prediction: MaintenancePrediction;
      status: 'COMPLETED' | 'DISMISSED';
    }) => {
      const response = await api.updateMaintenancePredictionStatus(propertyId!, prediction.id, {
        status,
      });
      if (!response.success) {
        throw new Error(response.message || 'Unable to update maintenance prediction.');
      }
      return { apiData: response.data, status, prediction };
    },
    onSuccess: ({ status, prediction, apiData }) => {
      queryClient.invalidateQueries({ queryKey: [FORECAST_QUERY_KEY, propertyId] });
      queryClient.invalidateQueries({ queryKey: [PROPERTY_QUERY_KEY, propertyId] });
      queryClient.invalidateQueries({ queryKey: [PROPERTIES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [MAINTENANCE_TASK_QUERY_KEY, propertyId] });

      const message =
        status === 'COMPLETED'
          ? `${prediction.taskName} marked complete.`
          : `${prediction.taskName} dismissed from your timeline.`;
      toast({ title: 'Forecast updated', description: message });

      // Streak / milestone toast — shown when a task is completed on time
      if (status === 'COMPLETED' && apiData?.streak) {
        const { currentStreak, milestoneReached, bonusMultiplier } = apiData.streak;
        if (milestoneReached) {
          const bonusPct = Math.round((bonusMultiplier - 1) * 100);
          toast({
            title: `🔥 ${currentStreak}-day streak milestone!`,
            description: `Maintenance bonus unlocked: +${bonusPct}% multiplier. Keep it up!`,
          });
        } else if (currentStreak > 1) {
          toast({
            title: `🔥 ${currentStreak}-day streak`,
            description: 'Complete more tasks to hit your next streak milestone.',
          });
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error?.message || 'Could not update this maintenance prediction.',
        variant: 'destructive',
      });
    },
  });

  const openMarketplaceForPrediction = (prediction: MaintenancePrediction) => {
    const hasActiveBooking =
      prediction.booking &&
      ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(prediction.booking.status);

    if (hasActiveBooking && prediction.booking) {
      router.push(`/dashboard/bookings/${prediction.booking.id}`);
      return;
    }

    const params = new URLSearchParams();
    params.set('category', prediction.recommendedServiceCategory);
    params.set('predictionId', prediction.id);
    if (prediction.inventoryItemId) {
      params.set('itemId', prediction.inventoryItemId);
    }
    if (propertyId) {
      params.set('propertyId', propertyId);
    }

    router.push(`/marketplace?${params.toString()}`);
  };

  if (!propertyId) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wrench className="h-5 w-5 text-blue-600" />
            {mode === 'next-up' ? 'Next Up' : 'Maintenance Forecast'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building your 12-month forecast...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const errorMessage =
      error instanceof Error ? error.message : 'Could not load maintenance forecast.';
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wrench className="h-5 w-5 text-blue-600" />
            {mode === 'next-up' ? 'Next Up' : 'Maintenance Forecast'}
          </CardTitle>
          <CardDescription>{errorMessage}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void refetch()} className="min-h-[44px]">
            Retry
          </Button>
          <Button asChild variant="outline" className="min-h-[44px]">
            <Link href={`/dashboard/properties/${propertyId}/inventory`}>
              Verify Assets
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (predictions.length === 0) return null;

  if (mode === 'next-up') {
    return (
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-blue-900">
            <AlertTriangle className="h-5 w-5 text-blue-600" />
            Next Up
          </CardTitle>
          <CardDescription>Your 3 most immediate forecasted maintenance tasks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {predictions.slice(0, 3).map((prediction) => {
            const overdue = isOverdue(prediction);
            return (
              <div
                key={prediction.id}
                className={`rounded-lg border px-3 py-3 ${
                  overdue ? 'border-red-200 bg-red-50/40' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {prediction.taskName}
                      </p>
                      {overdue && (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {format(new Date(prediction.predictedDate), 'MMM d')} ·{' '}
                      {prediction.inventoryItem?.name ?? 'Property-wide'}
                    </p>
                    <ConfidenceBadge score={prediction.confidenceScore} />
                  </div>
                  <Badge className={priorityBadgeClass(prediction.priority)}>
                    P{prediction.priority}
                  </Badge>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-[44px] px-3"
                    disabled={updateStatusMutation.isPending}
                    onClick={() => openMarketplaceForPrediction(prediction)}
                  >
                    <Search className="mr-1 h-4 w-4" />
                    {prediction.booking &&
                    ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(prediction.booking.status)
                      ? 'View Booking'
                      : 'Find a Pro'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] px-3"
                    disabled={updateStatusMutation.isPending}
                    onClick={() =>
                      updateStatusMutation.mutate({ prediction, status: 'COMPLETED' })
                    }
                  >
                    {updateStatusMutation.isPending ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Flame className="mr-1 h-4 w-4" />
                    )}
                    Mark as Done
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-[44px] px-3"
                    disabled={updateStatusMutation.isPending}
                    onClick={() =>
                      updateStatusMutation.mutate({ prediction, status: 'DISMISSED' })
                    }
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-blue-100 p-2">
          <Wrench className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Maintenance Forecast Timeline</h2>
          <p className="text-sm text-gray-500">
            AI-assisted 12-month timeline built from your verified home systems.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto pb-2">
        {generationError && (
          <p className="mb-2 text-xs text-amber-700">
            Forecast refresh had a warning: {generationError}
          </p>
        )}
        <div className="flex gap-3">
          {predictions.map((prediction) => (
            <TimelineCard
              key={prediction.id}
              prediction={prediction}
              isPending={updateStatusMutation.isPending}
              onFindPro={(item) => openMarketplaceForPrediction(item)}
              onMarkDone={(item) =>
                updateStatusMutation.mutate({ prediction: item, status: 'COMPLETED' })
              }
              onDismiss={(item) =>
                updateStatusMutation.mutate({ prediction: item, status: 'DISMISSED' })
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}
