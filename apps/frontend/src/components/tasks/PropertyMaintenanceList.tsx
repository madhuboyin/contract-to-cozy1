// apps/frontend/src/components/tasks/PropertyMaintenanceList.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MaintenanceTaskCard } from './MaintenanceTaskCard';
import { TaskFilterPanel } from './TaskFilterPanel';
import { 
  PropertyMaintenanceTask, 
  MaintenanceTaskFilters,
  MaintenanceTaskStatus,
} from '@/types';

interface PropertyMaintenanceListProps {
  propertyId: string;
  onCreateTask?: () => void;
  onEditTask?: (task: PropertyMaintenanceTask) => void;
}

export function PropertyMaintenanceList({
  propertyId,
  onCreateTask,
  onEditTask,
}: PropertyMaintenanceListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [filters, setFilters] = useState<MaintenanceTaskFilters>({
    includeCompleted: false,
  });

  // Fetch tasks
  const {
    data: tasksData,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['maintenance-tasks', propertyId, filters],
    queryFn: async () => {
      const response = await api.getMaintenanceTasks(propertyId, filters);
      if (!response.success) {
        throw new Error(response.message || 'Failed to load maintenance tasks');
      }
      return response.data;
    },
    enabled: !!propertyId,
  });

  // Fetch statistics
  const { data: statsData } = useQuery({
    queryKey: ['maintenance-stats', propertyId],
    queryFn: async () => {
      const response = await api.getMaintenanceTaskStats(propertyId);
      if (!response.success) {
        throw new Error(response.message || 'Failed to load maintenance task statistics');
      }
      return response.data;
    },
    enabled: !!propertyId,
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({
      taskId,
      status,
    }: {
      taskId: string;
      status: MaintenanceTaskStatus;
    }) => {
      return await api.updateMaintenanceTaskStatus(taskId, status);
    },
    onMutate: async ({ taskId, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['maintenance-tasks'] });

      // Snapshot previous value
      const previousTasks = queryClient.getQueryData(['maintenance-tasks', propertyId, filters]);

      // Optimistically update
      queryClient.setQueryData(
        ['maintenance-tasks', propertyId, filters],
        (old: PropertyMaintenanceTask[] | undefined) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === taskId ? { ...task, status } : task
          );
        }
      );

      return { previousTasks };
    },
    onError: (err, vars, context) => {
      // Rollback on error
      if (context?.previousTasks) {
        queryClient.setQueryData(
          ['maintenance-tasks', propertyId, filters],
          context.previousTasks
        );
      }
      toast({
        title: 'Failed to update status',
        description: (err as Error).message || 'Please try again',
        variant: 'destructive',
      });
    },
    onSuccess: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-stats'] });
      toast({
        title: 'Status updated',
        description: 'Task status has been updated successfully',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return await api.deleteMaintenanceTask(taskId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-stats'] });
      toast({
        title: 'Task deleted',
        description: 'Task has been deleted successfully',
      });
    },
    onError: (err) => {
      toast({
        title: 'Failed to delete task',
        description: (err as Error).message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleStatusChange = (task: PropertyMaintenanceTask, newStatus: string) => {
    updateStatusMutation.mutate({
      taskId: task.id,
      status: newStatus as MaintenanceTaskStatus,
    });
  };

  const handleDelete = (task: PropertyMaintenanceTask) => {
    if (window.confirm(`Are you sure you want to delete "${task.title}"?`)) {
      deleteMutation.mutate(task.id);
    }
  };

  const handleFiltersChange = (newFilters: MaintenanceTaskFilters) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters({ includeCompleted: false });
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
          Failed to load maintenance tasks: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  const tasks = tasksData || [];
  const stats = statsData || null;

  return (
    <div className="space-y-6">
      {/* Header with Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Maintenance Tasks</h2>
          {stats && (
            <p className="text-sm text-gray-600 mt-1">
              {stats.pending} pending • {stats.inProgress} in progress •{' '}
              {stats.overdue > 0 && (
                <span className="text-red-600 font-medium">{stats.overdue} overdue</span>
              )}
              {stats.overdue === 0 && <span>0 overdue</span>}
            </p>
          )}
        </div>
        {onCreateTask && (
          <Button onClick={onCreateTask}>
            <Plus className="h-4 w-4 mr-2" />
            New Task
          </Button>
        )}
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Total Tasks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Pending</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Overdue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.overdue}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">Estimated Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${stats.totalEstimatedCost.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filter Panel */}
        <div className="lg:col-span-1">
          <TaskFilterPanel
            filters={filters}
            onFiltersChange={handleFiltersChange}
            onReset={handleResetFilters}
          />
        </div>

        {/* Task List */}
        <div className="lg:col-span-3">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-gray-600">No maintenance tasks found.</p>
                {onCreateTask && (
                  <Button onClick={onCreateTask} className="mt-4" variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Task
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {tasks.map((task: PropertyMaintenanceTask) => (
                <MaintenanceTaskCard
                  key={task.id}
                  task={task}
                  onEdit={onEditTask}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}