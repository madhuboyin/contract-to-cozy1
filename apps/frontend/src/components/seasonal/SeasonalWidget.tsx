// apps/frontend/src/components/seasonal/SeasonalWidget.tsx
'use client';

import { useState } from 'react';
import { ChevronRight, Calendar } from 'lucide-react';
import { useSeasonalChecklists, useClimateInfo } from '@/lib/hooks/useSeasonalChecklists';
import {
  getSeasonIcon,
  getSeasonName,
  getProgressBarColor,
  formatDaysRemaining,
} from '@/lib/utils/seasonHelpers';
import { SeasonalChecklistModal } from './SeasonalChecklistModal';
import { useHomeownerSegment } from '@/lib/hooks/useHomeownerSegment';
import { calculateSeasonalProgress } from '@/lib/utils/seasonalProgress';
import humanizeActionType from '@/lib/utils/humanize';

interface SeasonalWidgetProps {
  propertyId: string;
}

export function SeasonalWidget({ propertyId }: SeasonalWidgetProps) {
  const { data: segment } = useHomeownerSegment();
  console.log('👤 Homeowner segment:', segment);
  // Don't show for home buyers
  if (segment !== 'EXISTING_OWNER') {
    return null;
  }
  const [showModal, setShowModal] = useState(false);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);

  const { data: climateInfo } = useClimateInfo(propertyId);
  const { data: checklistsData } = useSeasonalChecklists(propertyId);

  if (!climateInfo?.data || !checklistsData?.data?.checklists) {
    return null;
  }

  const currentSeason = climateInfo.data.currentSeason;
  
  // Find current season's checklist
  const currentYear = new Date().getFullYear();
  const currentChecklist = checklistsData.data.checklists.find(
    (c: any) => c.season === currentSeason && c.year === currentYear
  );

  if (!currentChecklist) {
    return null;
  }

  const seasonName = getSeasonName(currentChecklist.season);
  const seasonIcon = getSeasonIcon(currentChecklist.season);
  const progress = calculateSeasonalProgress(currentChecklist.items, {
    completedCount: currentChecklist.tasksCompleted,
    totalCount: currentChecklist.totalTasks,
  });
  if (progress.capped) {
    console.warn('[SeasonalWidget] completedCount exceeded totalCount. Capping at 100%.', {
      checklistId: currentChecklist.id,
      completedCount: progress.completedCount,
      totalCount: progress.totalCount,
    });
  }
  const completionPercentage = progress.progress;
  const displayProgress = Math.min(100, Math.max(0, completionPercentage));
  const progressColor = getProgressBarColor(displayProgress);
  const remainingTasks = Math.max(0, progress.totalCount - progress.completedCount);
  const displayText = progress.noTasks
    ? 'No tasks yet'
    : `${progress.completedCount} of ${progress.totalCount} tasks completed`;

  const handleViewChecklist = () => {
    setSelectedChecklistId(currentChecklist.id);
    setShowModal(true);
  };

  // Widget state based on completion
  const isComplete = completionPercentage === 100;
  const isBeforeSeason = currentChecklist.daysRemaining && currentChecklist.daysRemaining > 0;

  return (
    <>
      <div className="rounded-lg border border-white/70 bg-white/85 p-6 shadow-sm backdrop-blur-sm will-change-transform transform-gpu transition-all hover:shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{seasonIcon}</span>
            <h3 className="text-lg font-semibold text-gray-900">{seasonName} Maintenance</h3>
          </div>
          {isComplete && (
            <span className="text-green-600 text-2xl">✓</span>
          )}
        </div>

        {/* Progress */}
        {!isComplete ? (
          <>
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {displayText}
                </span>
                <span className="text-sm text-gray-600">
                  {progress.noTasks ? 'No tasks yet' : `${displayProgress}%`}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`${progressColor} h-2 rounded-full transition-all`}
                  style={{ width: `${displayProgress}%` }}
                ></div>
              </div>
            </div>

            <div className="text-sm text-gray-600 mb-4">
              <span className="font-medium">
                {progress.noTasks ? 'No tasks yet' : `${remainingTasks} remaining tasks`}
              </span>
            </div>

            {currentChecklist.items?.[0] && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-xs text-gray-500 mb-1">Next task:</p>
                <p className="text-sm font-medium text-gray-900">
                  {humanizeActionType(currentChecklist.items[0].title)}
                </p>
                {currentChecklist.items[0].recommendedDate && (
                  <p className="text-xs text-gray-500 mt-1">
                    Due: {new Date(currentChecklist.items[0].recommendedDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="mb-4 p-4 bg-green-50 rounded-md text-center">
            <p className="text-green-700 font-medium">
              {seasonName} checklist complete! ✓
            </p>
            <p className="text-sm text-green-600 mt-1">
              Great job maintaining your home
            </p>
          </div>
        )}

        {/* Action Button */}
        <button
          onClick={handleViewChecklist}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-md bg-green-600 text-white font-medium text-sm hover:bg-green-700 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          <span>View all seasonal tasks</span>
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Season info */}
        {isBeforeSeason && currentChecklist.daysRemaining && (
          <div className="mt-3 text-xs text-center text-gray-500">
            {seasonName} starts in {formatDaysRemaining(currentChecklist.daysRemaining)}
          </div>
        )}
      </div>

      {showModal && selectedChecklistId && (
        <SeasonalChecklistModal
          checklistId={selectedChecklistId}
          onClose={() => {
            setShowModal(false);
            setSelectedChecklistId(null);
          }}
        />
      )}
    </>
  );
}
