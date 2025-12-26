// apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx
'use client';

import { useState } from 'react';
import { Calendar, ChevronDown, ChevronRight, CheckCircle, Clock } from 'lucide-react';
import { useSeasonalChecklists, useClimateInfo } from '@/lib/hooks/useSeasonalChecklists';
import { SeasonalChecklistModal } from '@/components/seasonal/SeasonalChecklistModal';
import {
  getSeasonIcon,
  getSeasonName,
  getSeasonColors,
  getCompletionPercentage,
  getProgressBarColor,
  formatDaysRemaining,
} from '@/lib/utils/seasonHelpers';
import { SeasonalChecklist } from '@/types/seasonal.types';

export default function SeasonalMaintenancePage() {
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'current' | 'all' | 'completed'>('current');

  // TODO: Get propertyId from context or route params
  const propertyId = 'default-property-id';

  const { data: climateInfo } = useClimateInfo(propertyId);
  const { data: checklistsData, isLoading } = useSeasonalChecklists(propertyId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const checklists = checklistsData?.data?.checklists || [];
  const currentSeason = climateInfo?.data?.currentSeason;
  const currentYear = new Date().getFullYear();

  // Filter checklists based on active tab
  const filteredChecklists = checklists.filter((checklist: SeasonalChecklist) => {
    if (activeTab === 'current') {
      return checklist.season === currentSeason && checklist.year === currentYear;
    }
    if (activeTab === 'completed') {
      return checklist.status === 'COMPLETED';
    }
    return true; // 'all' tab
  });

  // Group checklists by season and year
  const groupedChecklists = filteredChecklists.reduce((acc: any, checklist: SeasonalChecklist) => {
    const key = `${checklist.season}-${checklist.year}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(checklist);
    return acc;
  }, {});

  const toggleSeason = (key: string) => {
    const newExpanded = new Set(expandedSeasons);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedSeasons(newExpanded);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Seasonal Maintenance</h1>
        <p className="text-gray-600">
          Keep your home in top shape with seasonal maintenance tasks tailored to your climate zone
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('current')}
            className={`pb-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'current'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Current Season</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`pb-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            All Seasons
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`pb-4 font-medium text-sm border-b-2 transition-colors ${
              activeTab === 'completed'
                ? 'border-green-600 text-green-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4" />
              <span>Completed</span>
            </div>
          </button>
        </div>
      </div>

      {/* Checklists */}
      {filteredChecklists.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No seasonal checklists found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(groupedChecklists).map((key) => {
            const [season, year] = key.split('-');
            const checklistsForSeason = groupedChecklists[key];
            const checklist = checklistsForSeason[0]; // Use first one for display
            const isExpanded = expandedSeasons.has(key);
            const colors = getSeasonColors(season as any);
            const seasonIcon = getSeasonIcon(season as any);
            const seasonName = getSeasonName(season as any);
            const completionPercentage = getCompletionPercentage(
              checklist.tasksCompleted,
              checklist.totalTasks
            );
            const progressColor = getProgressBarColor(completionPercentage);

            return (
              <div key={key} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header - Clickable */}
                <button
                  onClick={() => toggleSeason(key)}
                  className="w-full px-6 py-4 bg-white hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center space-x-4">
                    <span className="text-3xl">{seasonIcon}</span>
                    <div className="text-left">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {seasonName} {year}
                      </h3>
                      <div className="flex items-center space-x-4 mt-1">
                        <span className="text-sm text-gray-600">
                          {checklist.tasksCompleted}/{checklist.totalTasks} completed
                        </span>
                        {checklist.status === 'COMPLETED' && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full">
                            ✓ Complete
                          </span>
                        )}
                        {checklist.daysRemaining !== undefined && checklist.daysRemaining > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full flex items-center space-x-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDaysRemaining(checklist.daysRemaining)}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {/* Progress Bar */}
                    <div className="w-32">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className={`${progressColor} h-2 rounded-full transition-all`}
                          style={{ width: `${completionPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-sm text-gray-600">
                          {checklist.totalTasks - checklist.tasksCompleted} tasks remaining
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Generated: {new Date(checklist.generatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedChecklistId(checklist.id)}
                        className={`px-4 py-2 rounded-md bg-gradient-to-r ${colors.gradient} text-white font-medium text-sm hover:shadow-md transition-shadow`}
                      >
                        View Full Checklist
                      </button>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-white rounded-lg">
                        <p className="text-2xl font-bold text-gray-900">{checklist.totalTasks}</p>
                        <p className="text-xs text-gray-600">Total Tasks</p>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg">
                        <p className="text-2xl font-bold text-green-600">{checklist.tasksCompleted}</p>
                        <p className="text-xs text-gray-600">Completed</p>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg">
                        <p className="text-2xl font-bold text-blue-600">{checklist.tasksAdded}</p>
                        <p className="text-xs text-gray-600">Added to Tasks</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {selectedChecklistId && (
        <SeasonalChecklistModal
          checklistId={selectedChecklistId}
          onClose={() => setSelectedChecklistId(null)}
        />
      )}
    </div>
  );
}