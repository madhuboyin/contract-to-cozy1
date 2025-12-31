// apps/frontend/src/components/tasks/HomeBuyerChecklist.tsx
// PHASE 4.3: HOME BUYER CHECKLIST COMPONENT
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, AlertCircle, CheckCircle2, Circle, Edit, Trash2 } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  HomeBuyerTask, 
  HomeBuyerTaskStatus,
} from '@/types';

interface HomeBuyerChecklistProps {
  onCreateTask?: () => void;
  onEditTask?: (task: HomeBuyerTask) => void;
}

const STATUS_CONFIG: Record<HomeBuyerTaskStatus, {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  className: string;
  badgeClassName: string;
}> = {
  PENDING: {
    icon: Circle,
    label: 'Pending',
    className: 'text-gray-400',
    badgeClassName: 'bg-gray-100 text-gray-800',
  },
  IN_PROGRESS: {
    icon: Circle,
    label: 'In Progress',
    className: 'text-blue-500',
    badgeClassName: 'bg-blue-100 text-blue-800',
  },
  COMPLETED: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'text-green-500',
    badgeClassName: 'bg-green-100 text-green-800',
  },
  NOT_NEEDED: {
    icon: Circle,
    label: 'Not Needed',
    className: 'text-gray-300',
    badgeClassName: 'bg-gray-100 text-gray-600',
  },
};

const DEFAULT_TASK_TITLES = [
  'Schedule home inspection',
  'Obtain homeowners insurance',
  'Hire real estate attorney',
  'Arrange for movers',
  'Schedule locksmith for re-keying',
  'Set up utilities',
  'Deep cleaning service',
  'HVAC system check',
];

export function HomeBuyerChecklist({
  onCreateTask,
  onEditTask,
}: HomeBuyerChecklistProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch checklist with 8 default tasks
  const {
    data: checklistData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['home-buyer-checklist'],
    queryFn: async () => {
      const response = await api.getHomeBuyerChecklist();
      if (!response.success) {
        throw new Error(response.message || 'Failed to load home buyer checklist');
      }
      return response.data;
    },
  });

  // Fetch statistics
  const { data: statsData } = useQuery({
    queryKey: ['home-buyer-stats'],
    queryFn: async () => {
      const response = await api.getHomeBuyerTaskStats();
      if (!response.success) {
        throw new Error(response.message || 'Failed to load home buyer task statistics');
      }
      return response.data;
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      taskId,
      status,
    }: {
      taskId: string;
      status: HomeBuyerTaskStatus;
    }) => {
      return await api.updateHomeBuyerTaskStatus(taskId, status);
    },
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['home-buyer-checklist'] });
      
      const previousData = queryClient.getQueryData(['home-buyer-checklist']);
      
      queryClient.setQueryData(['home-buyer-checklist'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((task: HomeBuyerTask) =>
            task.id === taskId ? { ...task, status } : task
          ),
        };
      });
      
      return { previousData };
    },
    onError: (err, vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(['home-buyer-checklist'], context.previousData);
      }
      toast({
        title: 'Failed to update status',
        description: (err as Error).message || 'Please try again',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-buyer-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['home-buyer-stats'] });
      toast({
        title: 'Status updated',
        description: 'Task status has been updated',
      });
    },
  });

  // Delete mutation (custom tasks only)
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await api.deleteHomeBuyerTask(taskId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-buyer-checklist'] });
      queryClient.invalidateQueries({ queryKey: ['home-buyer-stats'] });
      toast({
        title: 'Task deleted',
        description: 'Custom task has been deleted',
      });
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to delete task',
        description: err.message || 'Default tasks cannot be deleted',
        variant: 'destructive',
      });
    },
  });

  const handleStatusChange = (taskId: string, status: HomeBuyerTaskStatus) => {
    updateStatusMutation.mutate({ taskId, status });
  };

  const handleDelete = (task: HomeBuyerTask) => {
    if (window.confirm(`Delete "${task.title}"?`)) {
      deleteMutation.mutate(task.id);
    }
  };

  const isDefaultTask = (title: string) => {
    return DEFAULT_TASK_TITLES.includes(title);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load checklist: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  const checklist = checklistData;
  const stats = statsData;
  const tasks = checklist?.tasks || [];

  // Separate default and custom tasks
  const defaultTasks = tasks
    .filter((task: HomeBuyerTask) => isDefaultTask(task.title))
    .sort((a: HomeBuyerTask, b: HomeBuyerTask) => a.sortOrder - b.sortOrder);
  const customTasks = tasks
    .filter((task: HomeBuyerTask) => !isDefaultTask(task.title))
    .sort((a: HomeBuyerTask, b: HomeBuyerTask) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Home Buyer Checklist</h2>
          <p className="text-sm text-gray-600 mt-1">
            Essential tasks for closing on your new home
          </p>
        </div>
        {onCreateTask && (
          <Button onClick={onCreateTask} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Task
          </Button>
        )}
      </div>

      {/* Progress Card */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {stats.completed} of {stats.total} completed
                </span>
                <span className="text-sm text-gray-600">
                  {stats.progressPercentage}%
                </span>
              </div>
              <Progress value={stats.progressPercentage} className="h-2" />
            </div>

            <div className="grid grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-400">{stats.pending}</div>
                <div className="text-xs text-gray-600">Pending</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
                <div className="text-xs text-gray-600">In Progress</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-xs text-gray-600">Completed</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-400">{stats.notNeeded}</div>
                <div className="text-xs text-gray-600">Not Needed</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Default Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Essential Tasks (8)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {defaultTasks.map((task: HomeBuyerTask) => {
              const statusConfig = STATUS_CONFIG[task.status as HomeBuyerTaskStatus];
              const StatusIcon = statusConfig.icon;

              return (
                <div
                  key={task.id}
                  className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {/* Status Icon Button */}
                  <button
                    onClick={() => {
                      const nextStatus =
                        task.status === 'PENDING'
                          ? 'IN_PROGRESS'
                          : task.status === 'IN_PROGRESS'
                          ? 'COMPLETED'
                          : task.status === 'COMPLETED'
                          ? 'PENDING'
                          : 'IN_PROGRESS';
                      handleStatusChange(task.id, nextStatus as HomeBuyerTaskStatus);
                    }}
                    className="flex-shrink-0 hover:scale-110 transition-transform"
                  >
                    <StatusIcon
                      className={`h-6 w-6 ${statusConfig.className}`}
                    />
                  </button>

                  {/* Task Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`font-medium ${
                          task.status === 'COMPLETED'
                            ? 'line-through text-gray-500'
                            : ''
                        }`}
                      >
                        {task.title}
                      </h3>
                      {task.serviceCategory && (
                        <Badge variant="outline" className="text-xs">
                          {task.serviceCategory}
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-600 mt-1">
                        {task.description}
                      </p>
                    )}
                  </div>

                  {/* Status Badge */}
                  <Badge className={statusConfig.badgeClassName}>
                    {statusConfig.label}
                  </Badge>

                  {/* Actions Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'PENDING')}
                      >
                        Mark as Pending
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'IN_PROGRESS')}
                      >
                        Mark as In Progress
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'COMPLETED')}
                      >
                        Mark as Completed
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleStatusChange(task.id, 'NOT_NEEDED')}
                      >
                        Mark as Not Needed
                      </DropdownMenuItem>
                      {onEditTask && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => onEditTask(task)}>
                            Edit Details
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Custom Tasks */}
      {customTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Custom Tasks ({customTasks.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {customTasks.map((task: HomeBuyerTask) => {
                const statusConfig = STATUS_CONFIG[task.status as HomeBuyerTaskStatus];
                const StatusIcon = statusConfig.icon;

                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <button
                      onClick={() => {
                        const nextStatus =
                          task.status === 'PENDING' ? 'IN_PROGRESS' :
                          task.status === 'IN_PROGRESS' ? 'COMPLETED' :
                          'PENDING';
                        handleStatusChange(task.id, nextStatus as HomeBuyerTaskStatus);
                      }}
                      className="flex-shrink-0 hover:scale-110 transition-transform"
                    >
                      <StatusIcon className={`h-6 w-6 ${statusConfig.className}`} />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3
                          className={`font-medium ${
                            task.status === 'COMPLETED' ? 'line-through text-gray-500' : ''
                          }`}
                        >
                          {task.title}
                        </h3>
                        <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700">
                          Custom
                        </Badge>
                      </div>
                      {task.description && (
                        <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                      )}
                    </div>

                    <Badge className={statusConfig.badgeClassName}>
                      {statusConfig.label}
                    </Badge>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {onEditTask && (
                          <>
                            <DropdownMenuItem onClick={() => onEditTask(task)}>
                              Edit Task
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem
                          onClick={() => handleDelete(task)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete Task
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State for Custom Tasks */}
      {customTasks.length === 0 && onCreateTask && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-gray-600 mb-4">
              Need to track additional tasks specific to your move?
            </p>
            <Button onClick={onCreateTask} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Custom Task
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}