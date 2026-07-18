'use client';

import React from 'react';
import { format } from 'date-fns';
import { CheckCircle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useConfirmDestructiveAction } from '@/components/system/ConfirmDestructiveActionDialog';
import { RecurrenceFrequency } from '@/types';
import type {
  MaintenanceTaskServiceCategory,
  PropertyMaintenanceTask,
  UpdateMaintenanceTaskInput,
} from '@/types';
import { getTaskSourceBadge } from '../taskDisplay';

const UNSET = '__UNSET__';

const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const CATEGORY_OPTIONS: Array<{ value: MaintenanceTaskServiceCategory; label: string }> = [
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'HANDYMAN', label: 'Handyman' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'PEST_CONTROL', label: 'Pest control' },
  { value: 'LOCKSMITH', label: 'Locksmith' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'APPLIANCE_REPAIR', label: 'Appliance repair' },
];

const FREQUENCY_OPTIONS: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: RecurrenceFrequency.MONTHLY, label: 'Monthly' },
  { value: RecurrenceFrequency.QUARTERLY, label: 'Quarterly' },
  { value: RecurrenceFrequency.SEMI_ANNUALLY, label: 'Semi-annually' },
  { value: RecurrenceFrequency.ANNUALLY, label: 'Annually' },
];

export type TaskDrawerProps = {
  task: PropertyMaintenanceTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: UpdateMaintenanceTaskInput) => void;
  onComplete: (task: PropertyMaintenanceTask, outcomeHealth?: 'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED') => void;
  onReopen: (task: PropertyMaintenanceTask) => void;
  onDelete: (id: string) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
  isCompleting?: boolean;
};

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  // Stored due dates are UTC-midnight calendar dates; extract the date part
  // directly so western timezones don't shift the date back a day.
  const isoDatePart = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
  if (isoDatePart) return isoDatePart;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'yyyy-MM-dd');
}

export function TaskDrawer({
  task,
  open,
  onOpenChange,
  onSave,
  onComplete,
  onReopen,
  onDelete,
  isSaving = false,
  isDeleting = false,
  isCompleting = false,
}: TaskDrawerProps) {
  const { requestConfirmation, confirmationDialog } = useConfirmDestructiveAction();

  const [title, setTitle] = React.useState('');
  const [notes, setNotes] = React.useState('');
  const [priority, setPriority] = React.useState<string>('MEDIUM');
  const [category, setCategory] = React.useState<string>(UNSET);
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [frequency, setFrequency] = React.useState<string>(UNSET);
  const [dueDate, setDueDate] = React.useState('');
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [outcomeHealth, setOutcomeHealth] = React.useState<'CONFIRMED_HEALTHY' | 'NEEDS_ATTENTION' | 'FAILED'>('CONFIRMED_HEALTHY');

  React.useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.description ?? '');
    setPriority(task.priority);
    setCategory(task.serviceCategory ?? UNSET);
    setIsRecurring(Boolean(task.isRecurring));
    setFrequency(task.frequency ?? UNSET);
    setDueDate(toDateInputValue(task.nextDueDate));
    setValidationError(null);
    setOutcomeHealth('CONFIRMED_HEALTHY');
  }, [task]);

  if (!task) return null;

  const isCompleted = task.status === 'COMPLETED';
  const isCancelled = task.status === 'CANCELLED';
  const readOnly = isCompleted || isCancelled;
  const canDelete = task.source !== 'ACTION_CENTER';
  const sourceBadge = getTaskSourceBadge(task);
  const busy = isSaving || isDeleting || isCompleting;
  const isProjectFollowUp = Boolean(task.actionKey?.match(/^project:[^:]+:follow-up$/));

  const handleSave = () => {
    if (!title.trim()) {
      setValidationError('Task name is required.');
      return;
    }
    if (isRecurring && frequency === UNSET) {
      setValidationError('Choose how often this task repeats.');
      return;
    }
    setValidationError(null);
    onSave(task.id, {
      title: title.trim(),
      description: notes.trim() ? notes.trim() : null,
      priority: priority as UpdateMaintenanceTaskInput['priority'],
      serviceCategory:
        category === UNSET ? null : (category as MaintenanceTaskServiceCategory),
      isRecurring,
      frequency: isRecurring ? (frequency as RecurrenceFrequency) : null,
      nextDueDate: dueDate || null,
    });
  };

  const handleDelete = async () => {
    const confirmed = await requestConfirmation({
      title: 'Remove this task?',
      description: `"${task.title}" will be removed from your maintenance schedule.`,
      confirmLabel: 'Remove task',
    });
    if (!confirmed) return;
    onDelete(task.id);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <SheetTitle className="pr-8">{task.title}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-2">
              {sourceBadge ? (
                <Badge variant={sourceBadge.variant}>{sourceBadge.label}</Badge>
              ) : null}
              {isCompleted ? (
                <Badge className="bg-green-100 text-green-800 border-green-300">Completed</Badge>
              ) : null}
              <span className="text-xs text-gray-500">
                Last completed:{' '}
                {task.lastCompletedDate
                  ? format(new Date(task.lastCompletedDate), 'MMM dd, yyyy')
                  : 'Never'}
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-5 py-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-drawer-title">Task name</Label>
            <Input
              id="task-drawer-title"
              value={title}
              disabled={readOnly}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          {isProjectFollowUp && !readOnly ? (
            <div className="space-y-1.5 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
              <Label>How is the completed work performing?</Label>
              <Select value={outcomeHealth} onValueChange={(value) => setOutcomeHealth(value as typeof outcomeHealth)}>
                <SelectTrigger aria-label="Outcome health"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONFIRMED_HEALTHY">Working as expected</SelectItem>
                  <SelectItem value="NEEDS_ATTENTION">Needs attention</SelectItem>
                  <SelectItem value="FAILED">Failed again</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-indigo-800">A concern creates a high-priority remediation action and updates the verified outcome measurement.</p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="task-drawer-notes">Notes</Label>
            <Textarea
              id="task-drawer-notes"
              value={notes}
              disabled={readOnly}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority} disabled={readOnly}>
                <SelectTrigger aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option.charAt(0) + option.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={readOnly}>
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>General</SelectItem>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-drawer-due">Next due date</Label>
            <Input
              id="task-drawer-due"
              type="date"
              value={dueDate}
              disabled={readOnly}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={isRecurring}
                disabled={readOnly}
                onCheckedChange={(checked) => setIsRecurring(checked === true)}
              />
              Repeats on a schedule
            </label>
            {isRecurring ? (
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency} disabled={readOnly}>
                  <SelectTrigger aria-label="Frequency">
                    <SelectValue placeholder="Choose frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {validationError ? (
            <p className="text-sm font-medium text-red-600">{validationError}</p>
          ) : null}
        </div>

        <SheetFooter className="flex-col gap-2 border-t px-5 py-4 sm:flex-row sm:items-center">
          {readOnly ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => onReopen(task)}
              className="w-full sm:w-auto"
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Reopen task
            </Button>
          ) : (
            <>
              {canDelete ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={handleDelete}
                  className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:mr-auto sm:w-auto"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1.5 h-4 w-4" />
                  )}
                  Remove
                </Button>
              ) : null}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => onComplete(task, isProjectFollowUp ? outcomeHealth : undefined)}
                className="w-full sm:w-auto"
              >
                {isCompleting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-1.5 h-4 w-4" />
                )}
                Mark complete
              </Button>
              <Button disabled={busy} onClick={handleSave} className="w-full sm:w-auto">
                {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </>
          )}
        </SheetFooter>
        {confirmationDialog}
      </SheetContent>
    </Sheet>
  );
}
