// apps/frontend/src/components/seasonal/SeasonalTaskCard.tsx
'use client';

import { useState } from 'react';
import { Check, X, Clock, Info, DollarSign, Timer } from 'lucide-react';
import { SeasonalChecklistItem } from '@/types/seasonal.types';
import {
  getPriorityIcon,
  getPriorityBadgeClass,
  formatCostRange,
} from '@/lib/utils/seasonHelpers';
import { useAddTaskToChecklist, useDismissTask } from '@/lib/hooks/useSeasonalChecklists';
import { useToast } from '@/components/ui/use-toast';
import { Loader2,  Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import { DiyDifficultyBadge, ProfessionalServiceBadge } from './DiyDifficultyBadge';
import { CostComparison } from './CostComparison';
import { TaskActionButtons } from './TaskActionButtons';
import { SafetyAlert } from './SafetyAlert'; // ✅ ADD THIS

interface SeasonalTaskCardProps {
  item: SeasonalChecklistItem;
  onTaskAdded?: () => void;
  onTaskDismissed?: () => void;
}

export function SeasonalTaskCard({ item, onTaskAdded, onTaskDismissed }: SeasonalTaskCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const addTaskMutation = useAddTaskToChecklist();
  const dismissTaskMutation = useDismissTask();

  const { toast } = useToast();

  const handleAddTask = async () => {
    setIsAdding(true);
    try {
      await addTaskMutation.mutateAsync({
        itemId: item.id,
        options: {
          nextDueDate: item.recommendedDate,
        },
      });
      
      toast({
        title: "Task Added! ✓",
        description: `"${item.title}" is now in your Action Center`,
        variant: "default",
      });
      
      onTaskAdded?.();
    } catch (error) {
      console.error('Failed to add task:', error);
      
      toast({
        title: "Failed to Add Task",
        description: (error as Error).message || "Please try again", 
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDismiss = async () => {
    try {
      await dismissTaskMutation.mutateAsync(item.id);
      onTaskDismissed?.();
    } catch (error) {
      console.error('Failed to dismiss task:', error);
    }
  };

  const template = item.seasonalTaskTemplate;
  const isAdded = item.status === 'ADDED' || item.status === 'COMPLETED';
  const isCompleted = item.status === 'COMPLETED';

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start space-x-3 flex-1">
          <span className="text-xl mt-1">{getPriorityIcon(item.priority)}</span>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-medium text-gray-900">{item.title}</h4>
              <span className={`text-xs px-2 py-0.5 rounded-full ${getPriorityBadgeClass(item.priority)}`}>
                {item.priority}
              </span>
            </div>
            {item.description && (
              <p className="text-sm text-gray-600 mb-2">{item.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* ✅ ADD: Safety Alert (if applicable) */}
      {template.safetyWarning && (
        <div className="mb-3">
          <SafetyAlert warning={template.safetyWarning} />
        </div>
      )}

      {/* Cost Comparison */}
      <div className="mb-4">
        <CostComparison
          typicalCostMin={template.typicalCostMin}
          typicalCostMax={template.typicalCostMax}
          isDiyPossible={template.isDiyPossible}
          diyDifficulty={template.diyDifficulty}
        />
      </div>

      {/* DIY Difficulty Badge */}
      <div className="mb-3">
        {template.isDiyPossible && template.diyDifficulty ? (
          <DiyDifficultyBadge 
            difficulty={template.diyDifficulty}
            estimatedHours={template.estimatedHours}
          />
        ) : !template.isDiyPossible ? (
          <ProfessionalServiceBadge />
        ) : null}
      </div>

      {/* Why It Matters - Collapsible */}
      {template.whyItMatters && (
        <div className="mb-3">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center space-x-1 text-sm text-blue-600 hover:text-blue-700"
          >
            <Info className="w-4 h-4" />
            <span>{showDetails ? 'Hide details' : 'Why this matters'}</span>
          </button>
          {showDetails && (
            <div className="mt-2 p-3 bg-blue-50 rounded-md text-sm text-gray-700">
              {template.whyItMatters}
            </div>
          )}
        </div>
      )}

      {/* Quick Action Buttons - Always visible */}
      {(template.isDiyPossible || template.serviceCategory) && (
        <div className="mb-3">
          <TaskActionButtons
            tutorialUrl={template.tutorialUrl}
            materialsList={template.materialsList}
            serviceCategory={template.serviceCategory}
            taskTitle={item.title}
            isDiyPossible={template.isDiyPossible}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center space-x-2 mt-4">
        {!isAdded ? (
          <>
            <button
              onClick={handleAddTask}
              disabled={isAdding || item.status === 'ADDED'}
              className={`
                mt-3 px-4 py-2 rounded-md font-medium text-sm
                transition-all duration-200 flex items-center gap-2
                ${item.status === 'ADDED'
                  ? 'bg-green-100 text-green-700 cursor-default'
                  : isAdding
                  ? 'bg-gray-100 text-gray-400 cursor-wait'
                  : 'bg-green-600 text-white hover:bg-green-700 active:scale-95'
                }
              `}
            >
              {isAdding && (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              )}
              {item.status === 'ADDED' && !isAdding && (
                <>
                  <Check className="w-4 h-4" />
                  Added to Tasks
                </>
              )}
              {!isAdding && item.status !== 'ADDED' && (
                <>
                  <Plus className="w-4 h-4" />
                  Add to my tasks
                </>
              )}
            </button>
            {/* ✅ UPDATED: Better dismiss button */}
            <button
              onClick={handleDismiss}
              className="px-3 py-2 rounded-md border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 flex items-center gap-1"
            >
              <X className="w-4 h-4" />
              <span className="text-xs">Not relevant</span>
            </button>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center px-4 py-2 rounded-md bg-gray-100 text-gray-600 text-sm">
            {isCompleted ? (
              <>
                <Check className="w-4 h-4 mr-2 text-green-600" />
                Completed
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Added to your tasks
              </>
            )}
          </div>
        )}
      </div>

      {item.recommendedDate && !isAdded && (
        <div className="mt-2 flex items-center space-x-1 text-xs text-gray-500">
          <Clock className="w-3 h-3" />
          <span>Recommended by: {new Date(item.recommendedDate).toLocaleDateString()}</span>
        </div>
      )}
    </div>
  );
}