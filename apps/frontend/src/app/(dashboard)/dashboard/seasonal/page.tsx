// apps/frontend/src/app/(dashboard)/dashboard/seasonal/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Calendar, ChevronDown, ChevronRight, CheckCircle, Clock, Settings, ChevronLeft, ArrowLeft } from 'lucide-react';
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
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function SeasonalMaintenancePage() {
  const router = useRouter();
  const [selectedChecklistId, setSelectedChecklistId] = useState<string | null>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'current' | 'all' | 'completed'>('current');

  // FIX: Get propertyId from URL params first (for page reload), then fall back to context
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyId = searchParams.get('propertyId') || selectedPropertyId;
  const from = searchParams.get('from');
  // Only show back link if entered from a valid parent page (not returning from maintenance)
  const getBackLink = () => {
    if (from === 'dashboard') {
      return {
        href: `/dashboard${propertyId ? `?propertyId=${propertyId}` : ''}`,
        label: 'Back to Dashboard'
      };
    }
    // Don't show back link when returning from maintenance or no 'from' param
    return null;
  };

  const backLink = getBackLink();

  const { data: climateInfo } = useClimateInfo(propertyId!);
  const { data: checklistsData, isLoading } = useSeasonalChecklists(propertyId!);

  // FIX: Handle no property selected
  if (!propertyId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-yellow-800 font-medium">Please select a property to view seasonal maintenance</p>
          <p className="text-yellow-600 text-sm mt-2">Go to the main dashboard and select a property</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const checklists: SeasonalChecklist[] = checklistsData?.checklists || [];
  const currentSeason = climateInfo?.currentSeason;
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
  const groupedChecklists = filteredChecklists.reduce<Record<string, SeasonalChecklist[]>>((acc, checklist) => {
    const key = `${checklist.season}-${checklist.year}`;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(checklist);
    return acc;
  }, {});

  const toggleSeason = (seasonKey: string) => {
    const newExpanded = new Set(expandedSeasons);
    if (newExpanded.has(seasonKey)) {
      newExpanded.delete(seasonKey);
    } else {
      newExpanded.add(seasonKey);
    }
    setExpandedSeasons(newExpanded);
  };

  const formatSeasonYearLabel = (checklist: SeasonalChecklist): string => {
    const seasonStart = new Date(checklist.seasonStartDate);
    const seasonEnd = new Date(checklist.seasonEndDate);

    if (
      Number.isFinite(seasonStart.getTime()) &&
      Number.isFinite(seasonEnd.getTime()) &&
      seasonStart.getFullYear() !== seasonEnd.getFullYear()
    ) {
      return `${seasonStart.getFullYear()}-${String(seasonEnd.getFullYear()).slice(-2)}`;
    }

    return String(checklist.year);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {backLink && (
        <Link 
          href={backLink.href}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          {backLink.label}
        </Link>
      )}
    {/* Page Content */}
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Seasonal Maintenance</h1>
            <p className="text-gray-600">
              Stay on top of seasonal home maintenance tasks tailored to your climate
            </p>
          </div>
          <button
            onClick={() => router.push(`/dashboard/seasonal/settings?propertyId=${propertyId}`)}
            className="flex items-center space-x-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Settings</span>
          </button>
        </div>
      </div>

      {/* Climate Info Banner */}
      {climateInfo?.data && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">
                Current Season: {currentSeason}
              </h3>
              <p className="text-sm text-gray-600">
                Climate Region: {climateInfo.data.climateRegion}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Next Season</p>
              <p className="font-medium text-gray-900">{climateInfo.data.nextSeason}</p>
              <p className="text-xs text-gray-500">
                {climateInfo.data.daysUntilNextSeason} days away
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 rounded-lg p-1 mb-6">
        <button
          onClick={() => setActiveTab('current')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'current'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Current Season
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'all'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          All Seasons
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'completed'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Completed
        </button>
      </div>

      {/* Checklists */}
      <div className="space-y-4">
        {Object.keys(groupedChecklists).length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No checklists yet</h3>
            <p className="text-gray-600">
              Seasonal checklists will be generated automatically as seasons change
            </p>
          </div>
        ) : (
          Object.entries(groupedChecklists).map(([seasonKey, seasonChecklists]: [string, any]) => {
            const isExpanded = expandedSeasons.has(seasonKey);
            const firstChecklist = seasonChecklists[0];
            const season = firstChecklist.season;
            const colors = getSeasonColors(season);

            return (
              <div
                key={seasonKey}
                className={`bg-white border-2 rounded-lg overflow-hidden ${colors.borderColor}`}
              >
                {/* Season Header */}
                <button
                  onClick={() => toggleSeason(seasonKey)}
                  className={`w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors ${colors.bgColor}`}
                >
                  <div className="flex items-center space-x-4">
                    <span className="text-4xl">{getSeasonIcon(season)}</span>
                    <div className="text-left">
                      <h3 className={`text-xl font-bold ${colors.textColor}`}>
                        {getSeasonName(season)} {formatSeasonYearLabel(firstChecklist)}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {firstChecklist.totalTasks} tasks • {firstChecklist.tasksCompleted} completed
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        {getCompletionPercentage(firstChecklist.tasksCompleted, firstChecklist.totalTasks)}%
                      </div>
                      <div className="text-xs text-gray-500">Complete</div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-6 h-6 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-6 h-6 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Checklist Details */}
                {isExpanded && (
                  <div className="p-6 border-t border-gray-200">
                    {seasonChecklists.map((checklist: SeasonalChecklist) => (
                      <div key={checklist.id} className="mb-4 last:mb-0">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                              checklist.status === 'COMPLETED'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {checklist.status}
                            </span>
                          </div>
                            <button
                              onClick={() => {
                                setSelectedChecklistId(checklist.id);
                              }}
                              className="text-sm text-green-600 hover:text-green-700 font-medium"
                            >
                              View Details →
                            </button>
                        </div>
                        
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className={`h-2 rounded-full transition-all ${getProgressBarColor(getCompletionPercentage(checklist.tasksCompleted, checklist.totalTasks))}`}
                            style={{ width: `${getCompletionPercentage(checklist.tasksCompleted, checklist.totalTasks)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-sm text-gray-600">
                          <span>
                            {checklist.tasksCompleted} of {checklist.totalTasks} tasks complete
                          </span>
                          <span className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {checklist.daysRemaining !== undefined ? formatDaysRemaining(checklist.daysRemaining) : 'N/A'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

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
