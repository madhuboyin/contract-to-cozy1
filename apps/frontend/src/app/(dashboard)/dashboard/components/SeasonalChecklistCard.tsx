// apps/frontend/src/app/(dashboard)/dashboard/components/SeasonalChecklistCard.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, AlertCircle } from 'lucide-react';
import { seasonalAPI } from '@/lib/api/seasonal.api';
import { calculateSeasonalProgress } from '@/lib/utils/seasonalProgress';
import humanizeActionType from '@/lib/utils/humanize';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Season emoji mapping
const SEASON_EMOJI: Record<string, string> = {
  SPRING: '🌸',
  SUMMER: '☀️',
  FALL: '🍂',
  WINTER: '❄️',
};

interface SeasonalChecklistCardProps {
  propertyId: string | undefined;
}

interface SeasonalChecklist {
  id: string;
  season: string;
  year: number;
  climateRegion: string;
  totalTasks: number;
  tasksCompleted: number;
  tasksAdded: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
  seasonStartDate: string;
  seasonEndDate: string;
  items: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
  }>;
}

export const SeasonalChecklistCard: React.FC<SeasonalChecklistCardProps> = ({
  propertyId,
}) => {
  const [checklist, setChecklist] = useState<SeasonalChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setLoading(false);
      return;
    }

    const fetchSeasonalChecklist = async () => {
      try {
        setLoading(true);
        setError(null);

        // Call API to get current/upcoming seasonal checklist using seasonalAPI
        const data = await seasonalAPI.getCurrentChecklist(propertyId);

        if (data?.checklist) {
          setChecklist(data.checklist);
        } else {
          setChecklist(null);
        }
      } catch (err: unknown) {
        console.error('Error fetching seasonal checklist:', err);
        setError(err instanceof Error ? err.message : 'Failed to load seasonal checklist');
        setChecklist(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSeasonalChecklist();
  }, [propertyId]);

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <Calendar className="h-5 w-5 text-purple-600" />
            Seasonal Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  // No property selected
  if (!propertyId) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <Calendar className="h-5 w-5 text-purple-600" />
            Seasonal Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 py-8 text-center">
            Select a property to view seasonal tasks
          </p>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <Calendar className="h-5 w-5 text-purple-600" />
            Seasonal Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-gray-600">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // No checklist available
  if (!checklist) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <Calendar className="h-5 w-5 text-purple-600" />
            Seasonal Maintenance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 py-8 text-center">
            No upcoming seasonal tasks
          </p>
          <div className="text-center">
            <Link href="/dashboard/seasonal/settings">
              <Button variant="outline" size="sm">
                Configure Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progress = calculateSeasonalProgress(checklist.items, {
    completedCount: checklist.tasksCompleted,
    totalCount: checklist.totalTasks,
  });
  if (progress.capped) {
    console.warn('[SeasonalChecklistCard] completedCount exceeded totalCount. Capping at 100%.', {
      checklistId: checklist.id,
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
    });
  }
  const completionPercentage = progress.progress;

  // Days remaining in season (using seasonEndDate)
  const daysRemaining = Math.max(0, Math.floor(
    (new Date(checklist.seasonEndDate).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  ));

  // Display year should reflect the active year for cross-year seasons (e.g., Winter 2025-2026 -> 2026)
  const seasonStart = new Date(checklist.seasonStartDate);
  const seasonEnd = new Date(checklist.seasonEndDate);
  const displayYearLabel =
    Number.isFinite(seasonStart.getTime()) &&
    Number.isFinite(seasonEnd.getTime()) &&
    seasonStart.getFullYear() !== seasonEnd.getFullYear()
      ? `${seasonStart.getFullYear()}-${String(seasonEnd.getFullYear()).slice(-2)}`
      : String(checklist.year);

  // Critical tasks — include both RECOMMENDED and ADDED statuses
  const criticalTasks = checklist.items.filter(
    (item) =>
      item.priority === 'CRITICAL' &&
      ['recommended', 'added'].includes(String(item.status || '').toLowerCase())
  );

  // Count of critical tasks that have been added to maintenance
  const criticalAdded = criticalTasks.filter(item => item.status === 'ADDED').length;

  // CTA text
  const ctaText = criticalTasks.length > 0
    ? `Review ${criticalTasks.length} critical task${criticalTasks.length !== 1 ? 's' : ''}`
    : 'View Full Checklist';

  return (
    <Card className="overflow-hidden border border-white/70 bg-white/85 shadow-sm backdrop-blur-sm will-change-transform transform-gpu transition-all hover:shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center gap-2 min-w-0">
          <span className="text-2xl" aria-hidden="true">{SEASON_EMOJI[checklist.season]}</span>
          {checklist.season} {displayYearLabel}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Days remaining in season */}
        <div className={`flex items-center gap-2 text-sm ${daysRemaining < 14 ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
          <Calendar className="h-4 w-4" />
          <span>
            {daysRemaining === 0
              ? 'Last day of ' + checklist.season.toLowerCase()
              : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in ${checklist.season.toLowerCase()}`}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Progress</span>
            <span className="font-medium">
              {progress.noTasks ? 'No tasks yet' : `${completionPercentage}%`}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {progress.noTasks
              ? 'No tasks yet'
              : `${progress.completedCount} of ${progress.totalCount} tasks completed`}
          </p>
        </div>

        {/* Critical tasks preview */}
        {criticalTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {criticalTasks.length} Critical Task{criticalTasks.length !== 1 ? 's' : ''}
              {criticalAdded > 0 && (
                <span className="text-gray-500 font-normal">({criticalAdded} added)</span>
              )}
            </p>
            <ul className="space-y-1">
              {criticalTasks.slice(0, 2).map((task) => (
                <li key={task.id} className="text-xs text-gray-700 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex-1 line-clamp-1">{humanizeActionType(task.title)}</span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm text-left">
                        {humanizeActionType(task.title)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
            {criticalTasks.length > 2 && (
              <p className="text-xs text-gray-500 italic">
                +{criticalTasks.length - 2} more critical tasks
              </p>
            )}
          </div>
        )}

        {/* CTA Button */}
        <Link href={`/dashboard/seasonal?propertyId=${propertyId}`}>
          <Button className="w-full" variant="outline" size="sm">
            {ctaText}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};
