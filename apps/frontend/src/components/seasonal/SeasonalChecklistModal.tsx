// apps/frontend/src/components/seasonal/SeasonalChecklistModal.tsx
'use client';

import { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSeasonalChecklistDetails, useDismissChecklist, useAddAllCriticalTasks } from '@/lib/hooks/useSeasonalChecklists';
import { SeasonalTaskCard } from './SeasonalTaskCard';
import { getSeasonName, getSeasonIcon, getClimateRegionName } from '@/lib/utils/seasonHelpers';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface SeasonalChecklistModalProps {
  checklistId: string;
  onClose: () => void;
}

export function SeasonalChecklistModal({ checklistId, onClose }: SeasonalChecklistModalProps) {
  const [activeTab, setActiveTab] = useState<'critical' | 'recommended' | 'optional'>('critical');
  const [dismissing, setDismissing] = useState(false);
  const [hideForSeason, setHideForSeason] = useState(false);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);

  const { data, isLoading, error, refetch, isRefetching } = useSeasonalChecklistDetails(checklistId);
  const dismissChecklistMutation = useDismissChecklist();
  const addAllCriticalMutation = useAddAllCriticalTasks();

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <DialogContent className="[&>button]:hidden sm:max-w-lg">
          <DialogTitle className="sr-only">Loading seasonal checklist</DialogTitle>
          <DialogDescription className="sr-only">
            Loading seasonal checklist details.
          </DialogDescription>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-green-600 motion-reduce:animate-none" />
            <p className="mt-3 text-sm text-gray-600">Loading checklist details...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const checklistDetails = ((data as any)?.data ?? data) as
    | {
        checklist?: any;
        tasks?: {
          critical: any[];
          recommended: any[];
          optional: any[];
        };
      }
    | undefined;

  if (error || !checklistDetails?.checklist || !checklistDetails?.tasks) {
    return (
      <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
        <DialogContent className="[&>button]:hidden sm:max-w-lg">
          <DialogTitle className="text-xl">Unable to load checklist</DialogTitle>
          <DialogDescription>
            We couldn&apos;t load this seasonal checklist. Please try again.
          </DialogDescription>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRefetching ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { checklist, tasks } = checklistDetails;
  const seasonName = getSeasonName(checklist.season);
  const SeasonIcon = getSeasonIcon(checklist.season);
  const climateName = getClimateRegionName(checklist.climateRegion);

  const criticalCount = tasks.critical.length;
  const recommendedCount = tasks.recommended.length;
  const optionalCount = tasks.optional.length;
  const totalTasks = Math.max(checklist.totalTasks ?? 0, 0);
  const completionRatio = totalTasks > 0 ? checklist.tasksCompleted / totalTasks : 0;
  const completionWidth = Math.min(100, Math.max(0, completionRatio * 100));
  const completionPercent = Math.round(completionWidth);

  const handleDismissChecklist = async () => {
    setDismissing(true);
    try {
      await dismissChecklistMutation.mutateAsync(checklistId);
      setShowDismissConfirm(false);
      onClose();
    } catch (error) {
      console.error('Failed to dismiss checklist:', error);
    } finally {
      setDismissing(false);
    }
  };

  const handleAddAllCritical = async () => {
    try {
      await addAllCriticalMutation.mutateAsync(checklistId);
    } catch (error) {
      console.error('Failed to add critical tasks:', error);
    }
  };

  const handleDone = () => {
    if (hideForSeason) {
      setShowDismissConfirm(true);
      return;
    }
    onClose();
  };

  const tabLabelByKey = {
    critical: `Critical (${criticalCount})`,
    recommended: `Recommended (${recommendedCount})`,
    optional: `Optional (${optionalCount})`,
  } as const;

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="[&>button]:hidden max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <DialogTitle className="sr-only">
          {seasonName} {checklist.year} Maintenance Checklist
        </DialogTitle>
        <DialogDescription className="sr-only">
          Recommended for climate zone {climateName}.
        </DialogDescription>
        <div className="flex max-h-[90vh] flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center space-x-3">
              <SeasonIcon className="h-8 w-8 text-brand-primary" />
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {seasonName} {checklist.year} Maintenance Checklist
                </h2>
                <p className="text-sm text-gray-600">
                  Recommended for Climate Zone: {climateName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close checklist"
              className="rounded-md p-1 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Progress Bar */}
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                {checklist.tasksCompleted} of {totalTasks} tasks completed
              </span>
              <span className="text-sm text-gray-600">{completionPercent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200">
              <div
                className="h-2 rounded-full bg-green-600 transition-[width] motion-reduce:transition-none"
                style={{ width: `${completionWidth}%` }}
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as 'critical' | 'recommended' | 'optional')}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="border-b border-gray-200 px-6 py-3">
              <TabsList className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0">
                {(['critical', 'recommended', 'optional'] as const).map((tabKey) => (
                  <TabsTrigger
                    key={tabKey}
                    value={tabKey}
                    className={cn(
                      'rounded-none border-b-2 border-transparent pb-2 text-sm font-medium text-gray-600 shadow-none focus-visible:ring-green-600 focus-visible:ring-offset-0 data-[state=active]:bg-transparent data-[state=active]:shadow-none',
                      tabKey === 'critical' && 'data-[state=active]:border-red-600 data-[state=active]:text-red-600',
                      tabKey === 'recommended' &&
                        'data-[state=active]:border-orange-600 data-[state=active]:text-orange-600',
                      tabKey === 'optional' && 'data-[state=active]:border-green-600 data-[state=active]:text-green-600',
                    )}
                  >
                    {tabLabelByKey[tabKey]}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Content - Scrollable */}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
              <TabsContent value="critical" className="mt-0 space-y-4">
                {criticalCount > 0 ? (
                  <>
                    <div className="flex items-start space-x-3 rounded-lg border border-red-200 bg-red-50 p-4">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
                      <div className="flex-1">
                        <p className="mb-2 text-sm font-medium text-red-800">
                          These critical tasks help prevent expensive damage and safety issues.
                        </p>
                        <button
                          type="button"
                          onClick={handleAddAllCritical}
                          disabled={addAllCriticalMutation.isPending}
                          className="inline-flex items-center rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:opacity-50"
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {addAllCriticalMutation.isPending ? 'Adding...' : 'Add all critical tasks'}
                        </button>
                      </div>
                    </div>
                    {tasks.critical.map((item: any) => (
                      <SeasonalTaskCard key={item.id} item={item} />
                    ))}
                  </>
                ) : (
                  <div className="py-12 text-center text-gray-500">No critical tasks for this season</div>
                )}
              </TabsContent>

              <TabsContent value="recommended" className="mt-0 space-y-4">
                {recommendedCount > 0 ? (
                  tasks.recommended.map((item: any) => <SeasonalTaskCard key={item.id} item={item} />)
                ) : (
                  <div className="py-12 text-center text-gray-500">No recommended tasks for this season</div>
                )}
              </TabsContent>

              <TabsContent value="optional" className="mt-0 space-y-4">
                {optionalCount > 0 ? (
                  tasks.optional.map((item: any) => <SeasonalTaskCard key={item.id} item={item} />)
                ) : (
                  <div className="py-12 text-center text-gray-500">No optional tasks for this season</div>
                )}
              </TabsContent>
            </div>
          </Tabs>

          {/* Confirm Dismiss */}
          {showDismissConfirm && (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-medium text-amber-900">
                Hide this checklist for the current season?
              </p>
              <p className="mt-1 text-xs text-amber-800">
                You can bring it back later from seasonal settings.
              </p>
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowDismissConfirm(false)}
                  className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDismissChecklist}
                  disabled={dismissing || dismissChecklistMutation.isPending}
                  className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  {dismissing || dismissChecklistMutation.isPending ? 'Hiding...' : 'Yes, hide checklist'}
                </button>
              </div>
            </div>
          )}

          {/* Footer - Compact on mobile */}
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 sm:text-sm">
              <input
                type="checkbox"
                checked={hideForSeason}
                onChange={(e) => {
                  setHideForSeason(e.target.checked);
                  if (!e.target.checked) {
                    setShowDismissConfirm(false);
                  }
                }}
                className="h-4 w-4 shrink-0 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="hidden sm:inline">Don&apos;t show me this again this season</span>
              <span className="sm:hidden">Hide this season</span>
            </label>

            {/* Buttons - compact */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 sm:text-sm"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 sm:text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
