// apps/frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx
// Drop-in patch for Option A: Completed tasks show "View" (read-only) instead of "Edit"

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  FileText,
  Loader2,
  Wrench,
  Plus,
  Edit,
  CheckCircle,
  Eye, // ✅ NEW
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { MaintenanceConfigModal } from '../maintenance-setup/MaintenanceConfigModal';
import {
  MaintenanceTaskConfig,
  RecurrenceFrequency,
  Property,
  PropertyMaintenanceTask,
  MaintenanceTaskServiceCategory,
  UpdateMaintenanceTaskInput,
} from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArrowLeft } from 'lucide-react';

// --- Helper Functions ---

function formatEnumString(val: string | null | undefined): string {
  if (!val) return 'N/A';
  return val.toString().replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatCategory(category: MaintenanceTaskServiceCategory | null) {
  if (!category) return 'General';
  return formatEnumString(category);
}

function formatDueDate(nextDueDate: string | null): { text: string; color: string } {
  if (!nextDueDate) {
    return { text: 'Not Scheduled', color: 'text-gray-400' };
  }

  const dueDate = new Date(nextDueDate);
  const today = new Date();
  const daysUntil = differenceInDays(dueDate, today);

  if (daysUntil < 0) return { text: `${Math.abs(daysUntil)} days overdue`, color: 'text-red-600' };
  if (daysUntil === 0) return { text: 'Due Today', color: 'text-orange-600' };
  if (daysUntil <= 7) return { text: `Due in ${daysUntil} days`, color: 'text-orange-500' };
  if (daysUntil <= 30) return { text: `Due in ${daysUntil} days`, color: 'text-yellow-600' };
  return { text: format(dueDate, 'MMM dd, yyyy'), color: 'text-green-600' };
}

type ViewMode = 'open' | 'completed' | 'all';
type CompletedRange = '30d' | '90d' | '1y' | 'all';

function cutoffForCompletedRange(range: CompletedRange): Date | null {
  const now = new Date();
  if (range === 'all') return null;
  const msPerDay = 24 * 60 * 60 * 1000;

  if (range === '30d') return new Date(now.getTime() - 30 * msPerDay);
  if (range === '90d') return new Date(now.getTime() - 90 * msPerDay);
  return new Date(now.getTime() - 365 * msPerDay);
}

function normalizeView(val: string | null): ViewMode {
  if (val === 'completed' || val === 'all') return val;
  return 'open';
}

function normalizeRange(val: string | null): CompletedRange {
  if (val === '30d' || val === '90d' || val === '1y' || val === 'all') return val;
  return '30d';
}

export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedPropertyId = searchParams.get('propertyId');
  const priority = searchParams.get('priority') === 'true';
  const from = searchParams.get('from');

  const view: ViewMode = normalizeView(searchParams.get('view'));
  const completedRange: CompletedRange = normalizeRange(searchParams.get('completedRange'));

  const togglePriorityView = useCallback(
    (enabled: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (selectedPropertyId) params.set('propertyId', selectedPropertyId);
      if (enabled) params.set('priority', 'true');
      else params.delete('priority');

      router.replace(`/dashboard/maintenance?${params.toString()}`, { scroll: false });
    },
    [router, selectedPropertyId, searchParams]
  );

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', mode);

      if ((mode === 'completed' || mode === 'all') && !params.get('completedRange')) {
        params.set('completedRange', '30d');
      }
      if (selectedPropertyId) params.set('propertyId', selectedPropertyId);

      router.replace(`/dashboard/maintenance?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, selectedPropertyId]
  );

  const setCompletedRange = useCallback(
    (range: CompletedRange) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('completedRange', range);
      if (selectedPropertyId) params.set('propertyId', selectedPropertyId);
      router.replace(`/dashboard/maintenance?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, selectedPropertyId]
  );

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PropertyMaintenanceTask | null>(null);
  const [modalMode, setModalMode] = useState<'edit' | 'view'>('edit'); // ✅ NEW

  useEffect(() => {
    if (selectedPropertyId) {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', selectedPropertyId] });
    }
  }, [selectedPropertyId, queryClient]);

  const getBackLink = () => {
    if (from === 'seasonal') {
      return {
        href: `/dashboard/seasonal${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`,
        label: 'Back to Seasonal Maintenance',
      };
    }
    if (from === 'risk-assessment' && selectedPropertyId) {
      return {
        href: `/dashboard/properties/${selectedPropertyId}/risk-assessment`,
        label: 'Back to Risk Assessment',
      };
    }
    return null;
  };

  const backLink = getBackLink();

  const { data: mainData, isLoading: isInitialLoading } = useQuery({
    queryKey: ['maintenance-tasks', selectedPropertyId, view],
    queryFn: async () => {
      const [propertiesRes] = await Promise.all([api.getProperties()]);
      if (!propertiesRes.success) throw new Error('Failed to fetch properties.');

      const propertiesMap = new Map<string, Property>();
      propertiesRes.data.properties.forEach((p) => propertiesMap.set(p.id, p));

      let propertyId = selectedPropertyId;
      if (!propertyId && propertiesRes.data.properties.length > 0) {
        const primaryProperty = propertiesRes.data.properties.find((p) => p.isPrimary);
        propertyId = primaryProperty?.id || propertiesRes.data.properties[0].id;
      }

      if (!propertyId) return { maintenanceTasks: [], propertiesMap };

      const includeCompleted = view !== 'open';
      const tasksRes = await api.getMaintenanceTasks(propertyId, { includeCompleted });
      const tasks = tasksRes.success ? tasksRes.data : [];

      return { maintenanceTasks: tasks, propertiesMap };
    },
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  const allMaintenanceTasks = Array.isArray(mainData?.maintenanceTasks) ? mainData.maintenanceTasks : [];

  const { openTasks, completedTasks } = useMemo(() => {
    const cutoff = cutoffForCompletedRange(completedRange);

    const open = allMaintenanceTasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED');

    let completed = allMaintenanceTasks.filter((t) => t.status === 'COMPLETED');
    if (cutoff) {
      completed = completed.filter((t) => {
        const d = t.lastCompletedDate ? new Date(t.lastCompletedDate) : null;
        return d ? d >= cutoff : false;
      });
    }

    const openSorted = (() => {
      let items = open;

      if (priority) {
        const priorityItems = items
          .filter((task) => task.priority === 'URGENT' || task.priority === 'HIGH')
          .sort((a, b) => {
            const priorityOrder: Record<string, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
            return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
          });

        if (priorityItems.length > 0) return priorityItems;
      }

      return items.sort((a, b) => {
        if (!a.nextDueDate) return 1;
        if (!b.nextDueDate) return -1;
        return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
      });
    })();

    const completedSorted = completed.sort((a, b) => {
      const ad = a.lastCompletedDate ? new Date(a.lastCompletedDate).getTime() : 0;
      const bd = b.lastCompletedDate ? new Date(b.lastCompletedDate).getTime() : 0;
      return bd - ad;
    });

    return { openTasks: openSorted, completedTasks: completedSorted };
  }, [allMaintenanceTasks, completedRange, priority]);

  const maintenanceItems = useMemo(() => {
    if (view === 'open') return openTasks;
    if (view === 'completed') return completedTasks;
    return openTasks; // all view handled separately
  }, [view, openTasks, completedTasks]);

  // ✅ UPDATED: Open modal in edit mode (open tasks)
  const handleOpenModal = (task: PropertyMaintenanceTask) => {
    setEditingTask(task);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // ✅ NEW: Open modal in view-only mode (completed tasks)
  const handleViewModal = (task: PropertyMaintenanceTask) => {
    setEditingTask(task);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
    setModalMode('edit');
  };

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateMaintenanceTaskInput }) => {
      const response = await api.updateMaintenanceTask(id, data);
      if (!response.success) throw new Error(response.error?.message || 'Failed to update task.');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      toast({ title: 'Task Updated', description: 'Maintenance task updated successfully.' });
      handleCloseModal();
    },
    onError: (error: any) => {
      toast({
        title: 'Update Failed',
        description: error.message || 'Could not update task.',
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.deleteMaintenanceTask(id);
      if (!response.success) throw new Error(response.error?.message || 'Failed to delete task.');
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      toast({ title: 'Task Removed', description: 'Task deleted successfully.' });
      handleCloseModal();
    },
    onError: (error: any) => {
      toast({
        title: 'Removal Failed',
        description: error.message || 'Could not remove task.',
        variant: 'destructive',
      });
    },
  });

  const handleMarkComplete = useMutation({
    mutationFn: async (task: PropertyMaintenanceTask) => {
      const response = await api.updateMaintenanceTaskStatus(task.id, {
        status: 'COMPLETED',
        actualCost: task.estimatedCost || undefined,
      });
      if (!response.success) throw new Error('Failed to mark as complete.');
      return response.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      toast({ title: 'Task Completed', description: `"${data.title}" marked as complete.` });
    },
    onError: (error: any) => {
      toast({
        title: 'Completion Failed',
        description: error.message || 'Could not mark task as complete.',
        variant: 'destructive',
      });
    },
  });

  const handleSaveTaskUpdate = (config: MaintenanceTaskConfig) => {
    if (!editingTask) return;
    if (modalMode === 'view') {
      // View-only: ignore saves
      toast({ title: 'View Only', description: 'Completed tasks are read-only.' });
      return;
    }

    const updateData: UpdateMaintenanceTaskInput = {
      title: config.title,
      description: config.description,
      isRecurring: config.isRecurring,
      frequency: config.isRecurring ? (config.frequency as any) : null,
      nextDueDate: config.nextDueDate ? format(config.nextDueDate, 'yyyy-MM-dd') : null,
      serviceCategory: config.serviceCategory as MaintenanceTaskServiceCategory,
    };

    updateMutation.mutate({ id: editingTask.id, data: updateData });
  };

  const handleRemoveTask = (taskId: string) => {
    if (modalMode === 'view') {
      toast({ title: 'View Only', description: 'Completed tasks cannot be removed here.' });
      return;
    }
    deleteMutation.mutate(taskId);
  };

  const isBusy = isInitialLoading || updateMutation.isPending || deleteMutation.isPending || handleMarkComplete.isPending;

  if (isBusy) {
    return (
      <div className="space-y-6 pb-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mt-10" />
        <p className="text-center text-gray-500">Loading maintenance tasks...</p>
      </div>
    );
  }

  const SegButton = ({
    active,
    children,
    onClick,
  }: {
    active: boolean;
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-sm font-medium rounded-md border transition-colors',
        active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="space-y-6 pb-8 max-w-7xl mx-auto px-4 md:px-8">
      {backLink && (
        <Link href={backLink.href} className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 group">
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          {backLink.label}
        </Link>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-7 h-7 text-blue-600" /> Home Tasks & Reminders
        </h2>

        <Button asChild>
          <Link href={`/dashboard/maintenance-setup${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`}>
            <Plus className="w-4 h-4 mr-2" /> Add New Tasks
          </Link>
        </Button>
      </div>

      <p className="text-muted-foreground">Manage your scheduled maintenance tasks.</p>

      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6">
        <div className="flex items-center gap-2">
          <SegButton active={view === 'open'} onClick={() => setViewMode('open')}>
            Open
          </SegButton>
          <SegButton active={view === 'completed'} onClick={() => setViewMode('completed')}>
            Completed
          </SegButton>
          <SegButton active={view === 'all'} onClick={() => setViewMode('all')}>
            All
          </SegButton>
        </div>

        {(view === 'completed' || view === 'all') && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Completed:</span>
            <select
              value={completedRange}
              onChange={(e) => setCompletedRange(e.target.value as CompletedRange)}
              className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-800"
            >
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last 1 year</option>
              <option value="all">All time</option>
            </select>
          </div>
        )}

        <div className="flex items-center gap-2 md:ml-auto">
          <Switch id="priority-mode" checked={priority} onCheckedChange={togglePriorityView} />
          <Label htmlFor="priority-mode" className="cursor-pointer">
            Show high priority tasks only
          </Label>
        </div>
      </div>

      {view === 'open' && openTasks.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Active Tasks Found</CardTitle>
          <CardDescription>
            Visit{' '}
            <Link href={`/dashboard/maintenance-setup${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`} className="text-blue-600 hover:underline">
              Task Setup
            </Link>{' '}
            to add maintenance tasks.
          </CardDescription>
        </Card>
      )}

      {view === 'completed' && completedTasks.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Completed Tasks</CardTitle>
          <CardDescription>Try expanding the completed time range.</CardDescription>
        </Card>
      )}

      {view !== 'all' && maintenanceItems.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden sm:table-cell">Frequency</TableHead>
                <TableHead>Last Completed</TableHead>
                <TableHead className="text-center">Next Due</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {maintenanceItems.map((task) => {
                const dueDateInfo = formatDueDate(task.nextDueDate);
                const frequencyDisplay = task.isRecurring && task.frequency ? formatEnumString(task.frequency) : 'One-time';
                const isCompleted = task.status === 'COMPLETED';

                return (
                  <TableRow key={task.id} className={cn(isCompleted && 'opacity-80')}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell className="text-sm text-gray-600">{task.description || 'No description'}</TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          'px-2 py-1 rounded text-xs font-medium',
                          task.priority === 'URGENT' && 'bg-red-100 text-red-700',
                          task.priority === 'HIGH' && 'bg-orange-100 text-orange-700',
                          task.priority === 'MEDIUM' && 'bg-yellow-100 text-yellow-700',
                          task.priority === 'LOW' && 'bg-green-100 text-green-700'
                        )}
                      >
                        {task.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{formatCategory(task.serviceCategory)}</TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">{frequencyDisplay}</TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {task.lastCompletedDate ? format(new Date(task.lastCompletedDate), 'MMM dd, yyyy') : 'Never'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn('font-medium text-sm', dueDateInfo.color)}>{dueDateInfo.text}</span>
                    </TableCell>

                    <TableCell className="text-center">
                      <div className="flex justify-center space-x-1">
                        {!isCompleted && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-green-600"
                            onClick={() => handleMarkComplete.mutate(task)}
                            title="Mark Complete"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                        )}

                        {/* ✅ Option A: Completed rows show "View" instead of "Edit" */}
                        {isCompleted ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-gray-900"
                            onClick={() => handleViewModal(task)}
                            title="View Task"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-gray-500 hover:text-blue-600"
                            onClick={() => handleOpenModal(task)}
                            title="Edit Task"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ALL view: (unchanged tables) — apply same action logic there too if you use Actions in completed section */}
      {/* NOTE: If your ALL-view has a Completed section with an Edit button, mirror the same isCompleted ? View : Edit logic there. */}

      <MaintenanceConfigModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        template={null}
        properties={mainData?.propertiesMap ? Array.from(mainData.propertiesMap.values()) : []}
        existingConfig={
          editingTask
            ? {
                templateId: editingTask.id,
                title: editingTask.title,
                description: editingTask.description,
                isRecurring: editingTask.isRecurring,
                frequency: editingTask.frequency as RecurrenceFrequency | null,
                nextDueDate: editingTask.nextDueDate ? new Date(editingTask.nextDueDate) : null,
                serviceCategory: editingTask.serviceCategory as any,
                propertyId: editingTask.propertyId,
              }
            : null
        }
        // ✅ When in view mode, disable destructive/save actions by making handlers no-op
        onSave={modalMode === 'view' ? () => toast({ title: 'View Only', description: 'Completed tasks are read-only.' }) : handleSaveTaskUpdate}
        onRemove={modalMode === 'view' ? () => toast({ title: 'View Only', description: 'Completed tasks cannot be removed here.' }) : handleRemoveTask}
      />
    </div>
  );
}
