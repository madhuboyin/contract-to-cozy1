'use client';

import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle2, Loader2, Wrench } from 'lucide-react';
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

function TimelineCard({
  prediction,
  onMarkDone,
  onDismiss,
  isPending,
}: {
  prediction: MaintenancePrediction;
  onMarkDone: (prediction: MaintenancePrediction) => void;
  onDismiss: (prediction: MaintenancePrediction) => void;
  isPending: boolean;
}) {
  return (
    <Card className="min-w-[280px] max-w-[320px] shrink-0 border-gray-200">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{prediction.taskName}</CardTitle>
          <Badge className={priorityBadgeClass(prediction.priority)}>
            {priorityLabel(prediction.priority)} · P{prediction.priority}
          </Badge>
        </div>
        <CardDescription>
          {format(new Date(prediction.predictedDate), 'MMM d, yyyy')}
          {prediction.inventoryItem?.name ? ` · ${prediction.inventoryItem.name}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          {prediction.reasoning ?? 'Predicted by your maintenance intelligence engine.'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="min-h-[44px] px-4"
            disabled={isPending}
            onClick={() => onMarkDone(prediction)}
          >
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
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
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const limit = mode === 'next-up' ? 3 : 24;

  const { data: predictions, isLoading } = useQuery({
    queryKey: [FORECAST_QUERY_KEY, propertyId, mode],
    enabled: Boolean(propertyId),
    staleTime: 60 * 1000,
    queryFn: async () => {
      const id = propertyId!;
      await api.generateMaintenanceForecast(id).catch(() => null);
      const response = await api.getMaintenanceForecast(id, {
        status: ['PENDING', 'OVERDUE'],
        limit,
      });
      return response.success ? response.data : [];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      prediction,
      status,
    }: {
      prediction: MaintenancePrediction;
      status: 'COMPLETED' | 'DISMISSED';
    }) => {
      const response = await api.updateMaintenancePredictionStatus(propertyId!, prediction.id, { status });
      if (!response.success) {
        throw new Error(response.message || 'Unable to update maintenance prediction.');
      }
      return { response: response.data, status, prediction };
    },
    onSuccess: ({ status, prediction }) => {
      queryClient.invalidateQueries({ queryKey: [FORECAST_QUERY_KEY, propertyId] });
      queryClient.invalidateQueries({ queryKey: [PROPERTY_QUERY_KEY, propertyId] });
      queryClient.invalidateQueries({ queryKey: [PROPERTIES_QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [MAINTENANCE_TASK_QUERY_KEY, propertyId] });
      const message =
        status === 'COMPLETED'
          ? `${prediction.taskName} marked complete.`
          : `${prediction.taskName} dismissed from your timeline.`;
      toast({ title: 'Forecast updated', description: message });
    },
    onError: (error: any) => {
      toast({
        title: 'Update failed',
        description: error?.message || 'Could not update this maintenance prediction.',
        variant: 'destructive',
      });
    },
  });

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

  if (!predictions || predictions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wrench className="h-5 w-5 text-blue-600" />
            {mode === 'next-up' ? 'Next Up' : 'Maintenance Forecast'}
          </CardTitle>
          <CardDescription>
            Verify HVAC, roof, and water-heater assets to unlock forecast tasks.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

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
          {predictions.slice(0, 3).map((prediction) => (
            <div
              key={prediction.id}
              className="rounded-lg border border-gray-200 bg-white px-3 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900">{prediction.taskName}</p>
                  <p className="text-xs text-gray-500">
                    {format(new Date(prediction.predictedDate), 'MMM d')} ·{' '}
                    {prediction.inventoryItem?.name ?? 'Property-wide'}
                  </p>
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
                  onClick={() =>
                    updateStatusMutation.mutate({ prediction, status: 'COMPLETED' })
                  }
                >
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
          ))}
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
        <div className="flex gap-3">
          {predictions.map((prediction) => (
            <TimelineCard
              key={prediction.id}
              prediction={prediction}
              isPending={updateStatusMutation.isPending}
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
