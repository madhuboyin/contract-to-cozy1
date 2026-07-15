'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MobileFilterSurface } from '@/components/mobile/dashboard/MobilePrimitives';
import type { CompletedRange, ViewMode } from '../taskDisplay';

export type MaintenanceFilterBarProps = {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  completedRange: CompletedRange;
  onRangeChange: (range: CompletedRange) => void;
  priorityOnly: boolean;
  onPriorityChange: (enabled: boolean) => void;
};

export function MaintenanceFilterBar({
  view,
  onViewChange,
  completedRange,
  onRangeChange,
  priorityOnly,
  onPriorityChange,
}: MaintenanceFilterBarProps) {
  return (
    <MobileFilterSurface className="border border-slate-200/80 bg-white">
      <Tabs value={view} onValueChange={(value) => onViewChange(value as ViewMode)}>
        <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-flex sm:h-10 sm:w-auto">
          <TabsTrigger value="open">Open</TabsTrigger>
          <TabsTrigger value="completed">Completed</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {(view === 'completed' || view === 'all') && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">Completed:</span>
          <Select value={completedRange} onValueChange={(value) => onRangeChange(value as CompletedRange)}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last 1 year</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Switch id="priority-mode" checked={priorityOnly} onCheckedChange={onPriorityChange} />
        <Label htmlFor="priority-mode" className="cursor-pointer">
          Show high priority tasks only
        </Label>
      </div>
    </MobileFilterSurface>
  );
}
