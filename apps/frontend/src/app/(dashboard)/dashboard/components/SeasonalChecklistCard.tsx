// apps/frontend/src/app/(dashboard)/dashboard/components/SeasonalChecklistCard.tsx
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Calendar, CheckCircle, AlertCircle } from 'lucide-react';
import { seasonalAPI } from '@/lib/api/seasonal.api';

// Season emoji mapping
const SEASON_EMOJI: Record<string, string> = {
  SPRING: '🌸',
  SUMMER: '☀️',
  FALL: '🍂',
  WINTER: '❄️',
};

// Priority colors
const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: 'text-red-600 bg-red-50',
  RECOMMENDED: 'text-amber-600 bg-amber-50',
  OPTIONAL: 'text-green-600 bg-green-50',
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
      } catch (err: any) {
        console.error('Error fetching seasonal checklist:', err);
        setError(err.message || 'Failed to load seasonal checklist');
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

  // Calculate completion percentage
  const completionPercentage = checklist.totalTasks > 0
    ? Math.round((checklist.tasksCompleted / checklist.totalTasks) * 100)
    : 0;

  // Get upcoming tasks by priority
  const criticalTasks = checklist.items.filter(
    (item) => item.priority === 'CRITICAL' && item.status === 'RECOMMENDED'
  );
  const recommendedTasks = checklist.items.filter(
    (item) => item.priority === 'RECOMMENDED' && item.status === 'RECOMMENDED'
  );

  // Days until season starts
  const daysUntil = Math.floor(
    (new Date(checklist.seasonStartDate).getTime() - new Date().getTime()) /
      (1000 * 60 * 60 * 24)
  );

  return (
    <Card className="hover:shadow-md transition-shadow overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg font-semibold flex items-center gap-2 min-w-0">
            <span className="text-2xl">{SEASON_EMOJI[checklist.season]}</span>
            {checklist.season} {checklist.year}
          </CardTitle>
          <Badge variant="outline" className="text-xs shrink-0 truncate max-w-[80px] sm:max-w-none">
            {checklist.climateRegion.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Days until season */}
        {daysUntil > 0 && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>{daysUntil} days until {checklist.season.toLowerCase()}</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-600">
            <span>Progress</span>
            <span className="font-medium">{completionPercentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-purple-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <p className="text-xs text-gray-500">
            {checklist.tasksCompleted} of {checklist.totalTasks} tasks completed
          </p>
        </div>

        {/* Critical tasks preview */}
        {criticalTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-red-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {criticalTasks.length} Critical Task{criticalTasks.length !== 1 ? 's' : ''}
            </p>
            <ul className="space-y-1">
              {criticalTasks.slice(0, 2).map((task) => (
                <li key={task.id} className="text-xs text-gray-700 flex items-start gap-2">
                  <span className="text-red-500 mt-0.5">•</span>
                  <span className="flex-1 line-clamp-1">{task.title}</span>
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

        {/* Recommended tasks count */}
        {recommendedTasks.length > 0 && (
          <p className="text-xs text-gray-600">
            {recommendedTasks.length} recommended task{recommendedTasks.length !== 1 ? 's' : ''}
          </p>
        )}

        {/* CTA Button */}
        <Link href={`/dashboard/seasonal?propertyId=${propertyId}`}>
          <Button className="w-full" variant="outline" size="sm">
            View Full Checklist
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
};