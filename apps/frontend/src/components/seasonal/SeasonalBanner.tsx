// apps/frontend/src/components/seasonal/SeasonalBanner.tsx
'use client';

import { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { useSeasonalChecklists, useClimateInfo } from '@/lib/hooks/useSeasonalChecklists';
import { getSeasonIcon, getSeasonColors, formatDaysRemaining } from '@/lib/utils/seasonHelpers';
import { SeasonalChecklistModal } from './SeasonalChecklistModal';
import { useHomeownerSegment } from '@/lib/hooks/useHomeownerSegment';

interface SeasonalBannerProps {
  propertyId: string;
}

export function SeasonalBanner({ propertyId }: SeasonalBannerProps) {
  const { data: segment } = useHomeownerSegment();
  console.log('👤 Homeowner segment:', segment);
  // Don't show for home buyers
  if (segment !== 'EXISTING_OWNER') {
    return null;
  }
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);

  const { data: climateInfo } = useClimateInfo(propertyId);
  const { data: checklistsData } = useSeasonalChecklists(propertyId, {
    status: 'PENDING',
  });

  if (!climateInfo?.data || !checklistsData?.data?.checklists) {
    return null;
  }

  // Find upcoming seasonal checklist
  const upcomingChecklist = checklistsData.data.checklists.find(
    (c: any) => c.season === climateInfo.data.nextSeason && c.status === 'PENDING'
  );

  if (!upcomingChecklist || dismissed) {
    return null;
  }

  // Only show if within 14 days of season start
  if (climateInfo.data.daysUntilNextSeason > 14) {
    return null;
  }

  const season = upcomingChecklist.season;
  const colors = getSeasonColors(season);

  const handleViewChecklist = () => {
    setSelectedChecklistId(upcomingChecklist.id);
    setShowModal(true);
  };

  const handleDismiss = () => {
    setDismissed(true);
    // Optionally save dismissal to localStorage or backend
    localStorage.setItem(`seasonal-banner-dismissed-${upcomingChecklist.id}`, 'true');
  };

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-lg border ${colors.borderColor} ${colors.bgColor} p-6 mb-6 shadow-sm`}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="text-4xl">{getSeasonIcon(season)}</div>
            <div className="flex-1">
              <h3 className={`text-lg font-semibold ${colors.textColor} mb-1`}>
                {colors.name} is approaching in {formatDaysRemaining(climateInfo.data.daysUntilNextSeason)}
              </h3>
              <p className="text-gray-700 text-sm mb-3">
                We've prepared {upcomingChecklist.totalTasks} maintenance tasks to get your home ready.
              </p>
              <div className="flex space-x-3">
                <button
                  onClick={handleViewChecklist}
                  className={`inline-flex items-center px-4 py-2 rounded-md bg-gradient-to-r ${colors.gradient} text-white font-medium text-sm hover:shadow-md transition-shadow`}
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  View {colors.name} Checklist
                </button>
                <button
                  onClick={handleDismiss}
                  className="inline-flex items-center px-4 py-2 rounded-md border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50"
                >
                  Remind me in 3 days
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
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