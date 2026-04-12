// apps/frontend/src/components/seasonal/SeasonalTaskCard.tsx
// PHASE 4.2: SEASONAL INTEGRATION UPDATE
'use client';

import { useState } from 'react';
import { Check, X, Info, DollarSign, Timer, CheckCircle2, Loader2, Eye } from 'lucide-react';
import { SeasonalChecklistItem } from '@/types/seasonal.types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import {
  getPriorityIcon,
  getPriorityBadgeClass,
  formatCostRange,
} from '@/lib/utils/seasonHelpers';

// Add to imports at top of file
import Link from 'next/link';

interface SeasonalTaskCardProps {
  item: SeasonalChecklistItem;
  onTaskAdded?: () => void;
  onTaskDismissed?: () => void;
  onTaskRemoved?: () => void;
}

export function SeasonalTaskCard({ 
  item, 
  onTaskAdded, 
  onTaskDismissed,
  onTaskRemoved,
}: SeasonalTaskCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // PHASE 4.2: Use Phase 3 API method
  const addToMaintenanceMutation = useMutation({
    mutationFn: async () => {
      return await api.addSeasonalTaskToMaintenance(item.id);
    },
    onSuccess: (response) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      
      toast({
        title: 'Added to Maintenance',
        description: `"${item.title}" is now in your maintenance schedule`,
        variant: 'default',
      });
      
      onTaskAdded?.();
    },
    onError: (error: any) => {
      console.error('Failed to add to maintenance:', error);
      
      toast({
        title: 'Failed to Add Task',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // PHASE 4.2: Remove from maintenance
  const removeFromMaintenanceMutation = useMutation({
    mutationFn: async () => {
      return await api.removeSeasonalTaskFromMaintenance(item.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      
      toast({
        title: 'Removed from Maintenance',
        description: `"${item.title}" is no longer linked to maintenance`,
      });
      setShowRemoveConfirm(false);
      
      onTaskRemoved?.();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Remove Task',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // Legacy dismiss mutation (keep for backward compatibility)
  const dismissMutation = useMutation({
    mutationFn: async () => {
      // Use legacy endpoint if exists
      return await fetch(`/api/seasonal-checklist-items/${item.id}/dismiss`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      
      toast({
        title: 'Task Dismissed',
        description: 'This task has been hidden',
      });
      
      onTaskDismissed?.();
    },
  });

  const handleAddToMaintenance = () => {
    addToMaintenanceMutation.mutate();
  };

  const handleRemoveFromMaintenance = () => {
    removeFromMaintenanceMutation.mutate();
  };

  const handleDismiss = () => {
    dismissMutation.mutate();
  };

  const PriorityIcon = getPriorityIcon(item.priority);
  // Determine task state
  const isCompleted = item.status === 'COMPLETED' || item.maintenanceTask?.status === 'COMPLETED';
  const isAdded = (item.status === 'ADDED' || !!item.maintenanceTask) && !isCompleted;
  const isNotAdded = !isAdded && !isCompleted;
  const isLoading = addToMaintenanceMutation.isPending || removeFromMaintenanceMutation.isPending;
  const propertyQuery = item.propertyId ? `&propertyId=${item.propertyId}` : '';
  const maintenanceTaskHref = item.maintenanceTask?.id
    ? `/dashboard/maintenance?taskId=${item.maintenanceTask.id}&from=seasonal${propertyQuery}`
    : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 sm:p-6">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col gap-2">
            {/* Row 1: Priority badge + Status badge */}
            <div className="flex items-center gap-2">
              <Badge className={getPriorityBadgeClass(item.priority)}>
                {item.priority}
              </Badge>
              {isCompleted ? (
                <Badge className="bg-green-100 text-green-800 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Completed
                </Badge>
              ) : isAdded ? (
                <Badge className="bg-green-100 text-green-800 border-green-300">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Added
                </Badge>
              ) : null}
            </div>
            
            {/* Row 2: Icon + Title */}
            <div className="flex items-start gap-2">
              <PriorityIcon className="h-5 w-5 shrink-0 text-slate-600" />
              <h3 className="font-semibold text-lg">{item.title}</h3>
            </div>
            
            {/* Row 3: Description */}
            <p className="text-sm text-gray-600">{item.description}</p>
          </div>

          {/* Details */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
            {/* Cost Range */}
            {(item.seasonalTaskTemplate?.typicalCostMin || item.seasonalTaskTemplate?.typicalCostMax) && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>{formatCostRange(item.seasonalTaskTemplate?.typicalCostMin, item.seasonalTaskTemplate?.typicalCostMax)}</span>
              </div>
            )}

            {/* Time Estimate */}
            {item.seasonalTaskTemplate?.estimatedHours && (
              <div className="flex items-center gap-1">
                <Timer className="h-4 w-4" />
                <span>{item.seasonalTaskTemplate.estimatedHours} {item.seasonalTaskTemplate.estimatedHours === 1 ? 'hour' : 'hours'}</span>
              </div>
            )}

            {/* DIY Difficulty */}
            {item.seasonalTaskTemplate?.diyDifficulty && (
              <Badge variant="outline" className="text-xs">
                DIY: {item.seasonalTaskTemplate.diyDifficulty}
              </Badge>
            )}
          </div>

          {/* Safety Warning */}
          {item.seasonalTaskTemplate?.safetyWarning && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-yellow-900">Safety Warning</div>
                  <div className="text-yellow-800">{item.seasonalTaskTemplate.safetyWarning}</div>
                </div>
              </div>
            </div>
          )}

          {/* Expandable Details */}
          {item.seasonalTaskTemplate?.whyItMatters && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="text-sm"
              >
                {showDetails ? 'Hide' : 'Show'} Details
              </Button>

              {showDetails && (
                <div className="mt-2 p-4 bg-gray-50 rounded space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Why it&apos;s important:</span>
                    <p className="text-gray-600 mt-1">{item.seasonalTaskTemplate.whyItMatters}</p>
                  </div>

                  {item.seasonalTaskTemplate?.materialsList && (
                    <div>
                      <span className="font-medium">Materials needed:</span>
                      <p className="text-gray-600 mt-1">{item.seasonalTaskTemplate.materialsList}</p>
                    </div>
                  )}

                  {item.seasonalTaskTemplate?.tutorialUrl && (
                    <div>
                      <span className="font-medium">Tutorial:</span>
                      <p className="text-gray-600 mt-1">
                        <a href={item.seasonalTaskTemplate.tutorialUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                          {item.seasonalTaskTemplate.tutorialUrl}
                        </a>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2 border-t">
            {isNotAdded ? (
              <>
                <Button
                  onClick={handleAddToMaintenance}
                  disabled={isLoading}
                  size="sm"
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin shrink-0 motion-reduce:animate-none" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1 shrink-0" />
                      <span className="hidden sm:inline">Add to Maintenance</span>
                      <span className="sm:hidden">Schedule</span>
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleDismiss}
                  disabled={isLoading}
                  size="sm"
                >
                  <X className="h-4 w-4 mr-1 shrink-0" />
                  <span className="hidden sm:inline">Dismiss</span>
                  <span className="sm:hidden">Skip</span>
                </Button>
              </>
            ) : isCompleted ? (
              // COMPLETED STATE - No remove button
              <div className="flex-1 flex items-center gap-1 text-xs sm:text-sm text-green-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Task completed</span>
              </div>
            ) : (
              // ADDED (PENDING) STATE - Show view link and remove button
              <>
                    <div className="flex flex-1 flex-col gap-2">
                      <div className="flex flex-col gap-1 text-xs text-green-700 sm:flex-row sm:items-center sm:text-sm">
                        <div className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span className="hidden sm:inline">This task is in your maintenance schedule</span>
                          <span className="sm:hidden">Scheduled</span>
                        </div>

                        {/* View in Maintenance link */}
                        {maintenanceTaskHref ? (
                          <Link
                            href={maintenanceTaskHref}
                            className="ml-0 flex items-center gap-1 text-teal-600 transition-colors hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:ml-2"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View in Maintenance</span>
                          </Link>
                        )}
                      </div>

                      {showRemoveConfirm ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                          <p className="text-xs font-medium text-amber-900 sm:text-sm">
                            Remove this task from maintenance?
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setShowRemoveConfirm(false)}
                              disabled={isLoading}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={handleRemoveFromMaintenance}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <>
                                  <Loader2 className="mr-1 h-4 w-4 animate-spin shrink-0 motion-reduce:animate-none" />
                                  <span>Removing...</span>
                                </>
                              ) : (
                                <>
                                  <X className="mr-1 h-4 w-4 shrink-0" />
                                  <span>Yes, remove</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <Button
                      variant="outline"
                      onClick={() => setShowRemoveConfirm(true)}
                      disabled={isLoading}
                      size="sm"
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin shrink-0 motion-reduce:animate-none" />
                          <span>...</span>
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 mr-1 shrink-0" />
                          <span className="hidden sm:inline">Remove</span>
                          <span className="sm:hidden">Undo</span>
                        </>
                      )}
                    </Button>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
