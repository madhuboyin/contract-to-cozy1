'use client';

import { format } from 'date-fns';
import { CheckCircle, ChevronRight, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { PRIORITY_CHIP, PriorityLevel } from '@/lib/utils/chipTokens';
import { formatEnumLabel } from '@/lib/utils/formatters';
import type { PropertyMaintenanceTask } from '@/types';
import { formatDueDate, getTaskSourceBadge, normalizeTaskPriority, parseMaintenanceDate } from '../taskDisplay';

export type TaskListProps = {
  tasks: PropertyMaintenanceTask[];
  variant: 'open' | 'completed';
  highlightTaskId?: string | null;
  /** Task id with an in-flight mutation: its row actions show a spinner. */
  pendingTaskId?: string | null;
  onOpenTask: (task: PropertyMaintenanceTask) => void;
  onCompleteTask?: (task: PropertyMaintenanceTask) => void;
};

function priorityChipClass(priority: string): string {
  return PRIORITY_CHIP[normalizeTaskPriority(priority).toLowerCase() as PriorityLevel];
}

function completedOn(task: PropertyMaintenanceTask): string {
  const completedDate = parseMaintenanceDate(task.lastCompletedDate);
  return completedDate ? format(completedDate, 'MMM dd, yyyy') : '—';
}

function SourceBadge({ task }: { task: PropertyMaintenanceTask }) {
  const badge = getTaskSourceBadge(task);
  if (!badge) return null;
  return (
    <Badge variant={badge.variant} className="whitespace-nowrap">
      {badge.label}
    </Badge>
  );
}

export function TaskList({
  tasks,
  variant,
  highlightTaskId,
  pendingTaskId,
  onOpenTask,
  onCompleteTask,
}: TaskListProps) {
  const isCompletedVariant = variant === 'completed';

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-center">
                {isCompletedVariant ? 'Completed' : 'Next due'}
              </TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => {
              const dueDateInfo = formatDueDate(task.nextDueDate);
              const isPending = pendingTaskId === task.id;
              return (
                <TableRow
                  key={task.id}
                  id={`task-row-${task.id}`}
                  className={cn(
                    'cursor-pointer',
                    isCompletedVariant && 'opacity-80',
                    highlightTaskId === task.id && 'bg-teal-50/70'
                  )}
                  onClick={() => onOpenTask(task)}
                >
                  <TableCell className="max-w-md">
                    <div className="font-medium">{task.title}</div>
                    {task.description ? (
                      <div className="mt-0.5 truncate text-sm text-gray-500">{task.description}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <SourceBadge task={task} />
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'px-2 py-1 rounded-full text-xs font-medium border',
                        priorityChipClass(task.priority)
                      )}
                    >
                      {formatEnumLabel(task.priority)}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    {isCompletedVariant ? (
                      <span className="text-sm text-gray-600">{completedOn(task)}</span>
                    ) : (
                      <span className={cn('font-medium text-sm', dueDateInfo.color)}>
                        {dueDateInfo.text}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center" onClick={(event) => event.stopPropagation()}>
                    <div className="flex justify-center space-x-1">
                      {!isCompletedVariant && onCompleteTask ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Mark complete"
                          className="h-8 w-8 text-gray-500 hover:text-green-600"
                          disabled={isPending}
                          onClick={() => onCompleteTask(task)}
                        >
                          {isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle className="w-4 h-4" />
                          )}
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Task details"
                        className="h-8 w-8 text-gray-500 hover:text-gray-900"
                        onClick={() => onOpenTask(task)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {tasks.map((task) => {
          const dueDateInfo = formatDueDate(task.nextDueDate);
          const isPending = pendingTaskId === task.id;
          return (
            <Card
              key={task.id}
              id={`task-row-${task.id}`}
              className={cn(
                'p-4 border',
                isCompletedVariant && 'opacity-80',
                highlightTaskId === task.id && 'border-teal-400 ring-1 ring-teal-300'
              )}
              onClick={() => onOpenTask(task)}
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-base leading-tight">{task.title}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <SourceBadge task={task} />
                    <Badge
                      className={cn(
                        priorityChipClass(task.priority),
                        'rounded-full text-[11px] px-1.5 py-0 border'
                      )}
                    >
                      {formatEnumLabel(task.priority)}
                    </Badge>
                  </div>
                </div>
              </div>

              {task.description ? (
                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{task.description}</p>
              ) : null}

              <div
                className="flex justify-between items-center text-sm border-t pt-3"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-col">
                  <span className="text-[11px] text-muted-foreground">
                    {isCompletedVariant ? 'Completed' : 'Next due'}
                  </span>
                  {isCompletedVariant ? (
                    <span className="font-semibold text-gray-700">{completedOn(task)}</span>
                  ) : (
                    <span className={cn('font-semibold', dueDateInfo.color)}>{dueDateInfo.text}</span>
                  )}
                </div>

                <div className="flex gap-1">
                  {!isCompletedVariant && onCompleteTask ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 w-11 text-green-600"
                      aria-label="Mark complete"
                      disabled={isPending}
                      onClick={() => onCompleteTask(task)}
                    >
                      {isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 w-11"
                    aria-label="Task details"
                    onClick={() => onOpenTask(task)}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
