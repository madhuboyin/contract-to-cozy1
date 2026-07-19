'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { MobileSection, MobileSectionHeader, StatusChip, SummaryCard } from '@/components/mobile/dashboard/MobilePrimitives';
import {
  convertPersonalizationRecommendationToTask,
  getModulePersonalizationRecommendations,
} from '@/lib/api/personalizationApi';

export function PersonalizedMaintenanceSuggestions({ propertyId }: { propertyId?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addedIds, setAddedIds] = useState<Set<string>>(() => new Set());
  const queryKey = ['personalization-module', propertyId, 'MAINTENANCE'];
  const recommendations = useQuery({
    queryKey,
    queryFn: () => getModulePersonalizationRecommendations(propertyId!, 'MAINTENANCE', 3),
    enabled: Boolean(propertyId),
    retry: false,
    staleTime: 30_000,
  });
  const convert = useMutation({
    mutationFn: (recommendationId: string) => convertPersonalizationRecommendationToTask(propertyId!, recommendationId),
    onSuccess: (result, recommendationId) => {
      setAddedIds((current) => new Set(current).add(recommendationId));
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', propertyId] });
      toast({
        title: result.deduped ? 'Already in maintenance' : 'Added to maintenance',
        description: result.task.title,
      });
    },
    onError: () => {
      toast({ title: 'Could not add task', description: 'Please try again.', variant: 'destructive' });
    },
  });

  const items = recommendations.data?.items ?? [];
  if (recommendations.isLoading || recommendations.isError || items.length === 0) return null;

  return (
    <MobileSection>
      <MobileSectionHeader
        title="Suggested for this home"
        subtitle="Reviewed guidance from your property signals"
        action={(
          <Link
            href={`/dashboard/personalization?propertyId=${encodeURIComponent(propertyId!)}`}
            className="text-sm font-semibold text-[hsl(var(--mobile-brand-strong))]"
          >
            Personalization settings
          </Link>
        )}
      />
      <div className="grid gap-3 lg:grid-cols-3">
        {items.map((item) => {
          const action = item.actions.find((candidate) => candidate.type === 'CONVERT_TO_TASK');
          const added = addedIds.has(item.id);
          return (
            <SummaryCard key={item.id} title={item.title} subtitle={item.summary}>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  <StatusChip tone={item.priority === 'HIGH' ? 'elevated' : 'info'}>{item.priority}</StatusChip>
                  <StatusChip tone={item.governance.safetyTier === 'SAFETY_EMERGENCY' ? 'elevated' : 'info'}>{item.governance.safetyTier.replaceAll('_', ' ')}</StatusChip>
                </div>
                {item.governance.professionalBoundary ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                    {item.governance.professionalBoundary}
                  </p>
                ) : null}
                {item.recommendationResponse.status !== 'AVAILABLE' ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700" role="status">
                    <p className="font-semibold">Recommendation withheld</p>
                    <p className="mt-1">{item.recommendationResponse.message}</p>
                    <p className="mt-1">{item.recommendationResponse.safeNextAction}</p>
                  </div>
                ) : null}
                {action ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!action.enabled || added || convert.isPending}
                    onClick={() => convert.mutate(item.id)}
                    className="min-h-[44px]"
                  >
                    {added ? <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> : null}
                    {added ? 'Added' : action.enabled ? action.label : 'Read only'}
                  </Button>
                ) : null}
              </div>
            </SummaryCard>
          );
        })}
      </div>
    </MobileSection>
  );
}
