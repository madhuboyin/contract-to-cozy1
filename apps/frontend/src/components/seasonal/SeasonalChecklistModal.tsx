// apps/frontend/src/components/seasonal/SeasonalChecklistModal.tsx
'use client';

import { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSeasonalChecklistDetails, useDismissChecklist, useAddAllCriticalTasks } from '@/lib/hooks/useSeasonalChecklists';
import { SeasonalTaskCard } from './SeasonalTaskCard';
import { getSeasonName, getSeasonIcon, getClimateRegionName } from '@/lib/utils/seasonHelpers';
import { DiyDifficultyBadge } from './DiyDifficultyBadge';

interface SeasonalChecklistModalProps {
  checklistId: string;
  onClose: () => void;
}

export function SeasonalChecklistModal({ checklistId, onClose }: SeasonalChecklistModalProps) {
  const [activeTab, setActiveTab] = useState<'critical' | 'recommended' | 'optional'>('critical');
  const [dismissing, setDismissing] = useState(false);

  const { data, isLoading, error } = useSeasonalChecklistDetails(checklistId);
  console.log('🔍 Modal data:', data);
  console.log('🔍 Modal error:', error);
  console.log('🔍 Modal isLoading:', isLoading);
  console.log('🔍 Modal checklistId:', checklistId);
  console.log('🔍 Modal onClose:', onClose);
  console.log('🔍 Modal activeTab:', activeTab);
  console.log('🔍 Modal dismissing:', dismissing);
  const dismissChecklistMutation = useDismissChecklist();
  const addAllCriticalMutation = useAddAllCriticalTasks();

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    console.log('❌ RETURNING NULL');
    return null;
  }
  console.log('✅ PAST THE CHECK, WILL RENDER MODAL');
  const { checklist, tasks } = data?.data || data;
  console.log('🔍 Destructured checklist:', checklist);
  console.log('🔍 Destructured tasks:', tasks);
  console.log('🔍 About to call getSeasonName with:', checklist?.season);
  const seasonName = getSeasonName(checklist.season);
  const seasonIcon = getSeasonIcon(checklist.season);
  const climateName = getClimateRegionName(checklist.climateRegion);

  const criticalCount = tasks.critical.length;
  const recommendedCount = tasks.recommended.length;
  const optionalCount = tasks.optional.length;

  const handleDismissChecklist = async () => {
    if (!confirm('Are you sure you want to dismiss this seasonal checklist?')) {
      return;
    }
    setDismissing(true);
    try {
      await dismissChecklistMutation.mutateAsync(checklistId);
      onClose();
    } catch (error) {
      console.error('Failed to dismiss checklist:', error);
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

  return (
    //<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={(e) => {
          console.log('🔍 Overlay clicked');
          e.stopPropagation();
        }}
      >
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">{seasonIcon}</span>
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
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {checklist.tasksCompleted} of {checklist.totalTasks} tasks completed
            </span>
            <span className="text-sm text-gray-600">
              {Math.round((checklist.tasksCompleted / checklist.totalTasks) * 100)}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{
                width: `${(checklist.tasksCompleted / checklist.totalTasks) * 100}%`,
              }}
            ></div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200">
          <div className="flex space-x-6">
            <button
              onClick={() => setActiveTab('critical')}
              className={`pb-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'critical'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Critical ({criticalCount})
            </button>
            <button
              onClick={() => setActiveTab('recommended')}
              className={`pb-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'recommended'
                  ? 'border-orange-600 text-orange-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Recommended ({recommendedCount})
            </button>
            <button
              onClick={() => setActiveTab('optional')}
              className={`pb-2 font-medium text-sm border-b-2 transition-colors ${
                activeTab === 'optional'
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              Optional ({optionalCount})
            </button>
          </div>
        </div>

        {/* Content - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Critical Tasks Info Banner */}
          {activeTab === 'critical' && criticalCount > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-800 font-medium mb-2">
                  These critical tasks help prevent expensive damage and safety issues.
                </p>
                <button
                  onClick={handleAddAllCritical}
                  disabled={addAllCriticalMutation.isPending}
                  className="inline-flex items-center px-3 py-1.5 rounded-md bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  {addAllCriticalMutation.isPending ? 'Adding...' : 'Add all critical tasks'}
                </button>
              </div>
            </div>
          )}

          {/* Task List */}
          <div className="space-y-4">
            {activeTab === 'critical' &&
              (criticalCount > 0 ? (
                tasks.critical.map((item: any) => (
                  <SeasonalTaskCard key={item.id} item={item} />
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No critical tasks for this season
                </div>
              ))}

            {activeTab === 'recommended' &&
              (recommendedCount > 0 ? (
                tasks.recommended.map((item: any) => (
                  <SeasonalTaskCard key={item.id} item={item} />
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No recommended tasks for this season
                </div>
              ))}

            {activeTab === 'optional' &&
              (optionalCount > 0 ? (
                tasks.optional.map((item: any) => (
                  <SeasonalTaskCard key={item.id} item={item} />
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">
                  No optional tasks for this season
                </div>
              ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-20 sm:pb-4">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              onChange={(e) => {
                if (e.target.checked) {
                  handleDismissChecklist();
                }
              }}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500 shrink-0"
            />
            <span className="hidden sm:inline">Don't show me this again this season</span>
            <span className="sm:hidden">Don't show again</span>
          </label>
          
          {/* Buttons - always in a row */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-md border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-100"
            >
              <span className="hidden sm:inline">I'll do this later</span>
              <span className="sm:hidden">Later</span>
            </button>
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 rounded-md bg-green-600 text-white font-medium text-sm hover:bg-green-700"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}