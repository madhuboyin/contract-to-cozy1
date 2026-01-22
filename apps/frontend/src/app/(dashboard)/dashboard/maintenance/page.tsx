// apps/frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Wrench, Calendar, Settings, Plus, Edit, Trash2, CheckCircle } from 'lucide-react';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; 
import { useRouter, useSearchParams } from 'next/navigation'; 
import { MaintenanceConfigModal } from '../maintenance-setup/MaintenanceConfigModal'; 
import { 
  MaintenanceTaskConfig, 
  RecurrenceFrequency,
  ServiceCategory,
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
  return val.toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  if (daysUntil < 0) {
    return { text: `${Math.abs(daysUntil)} days overdue`, color: 'text-red-600' };
  } else if (daysUntil === 0) {
    return { text: 'Due Today', color: 'text-orange-600' };
  } else if (daysUntil <= 7) {
    return { text: `Due in ${daysUntil} days`, color: 'text-orange-500' };
  } else if (daysUntil <= 30) {
    return { text: `Due in ${daysUntil} days`, color: 'text-yellow-600' };
  } else {
    return { text: format(dueDate, 'MMM dd, yyyy'), color: 'text-green-600' };
  }
}

export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const selectedPropertyId = searchParams.get('propertyId');
  const priority = searchParams.get('priority') === 'true';
  const fromRiskAssessment = searchParams.get('from') === 'risk-assessment';
  const propertyId = searchParams.get('propertyId');
  const from = searchParams.get('from');
  const highlightTaskId = searchParams.get('taskId');

  const togglePriorityView = useCallback(
    (enabled: boolean) => {
      const params = new URLSearchParams();
      if (selectedPropertyId) {
        params.set('propertyId', selectedPropertyId);
      }
      if (enabled) {
        params.set('priority', 'true');
      }
      router.replace(`/dashboard/maintenance?${params.toString()}`, {
        scroll: false,
      });
    },
    [router, selectedPropertyId]
  );  
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PropertyMaintenanceTask | null>(null);

  // 🔑 FIX 1: Invalidate cache when propertyId changes (prevents stale cache on navigation)
  useEffect(() => {
    if (selectedPropertyId) {
      console.log('🔄 PropertyId changed, invalidating cache:', selectedPropertyId);
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', selectedPropertyId] });
    }
  }, [selectedPropertyId, queryClient]);

  // Fetch PropertyMaintenanceTasks
  const { data: mainData, isLoading: isInitialLoading } = useQuery({
    queryKey: ['maintenance-tasks', selectedPropertyId],
    queryFn: async () => {
      const [propertiesRes] = await Promise.all([
        api.getProperties(),
      ]);

      if (!propertiesRes.success) {
        throw new Error("Failed to fetch properties.");
      }
      
      const propertiesMap = new Map<string, Property>();
      propertiesRes.data.properties.forEach(p => propertiesMap.set(p.id, p));

      // 🔑 If no propertyId, use primary or first property
      let propertyId = selectedPropertyId;
      if (!propertyId && propertiesRes.data.properties.length > 0) {
        const primaryProperty = propertiesRes.data.properties.find(p => p.isPrimary);
        propertyId = primaryProperty?.id || propertiesRes.data.properties[0].id;
        console.log('📌 No propertyId in URL, using:', propertyId);
      }

      if (!propertyId) {
        console.warn('❌ No propertyId available');
        return {
          maintenanceTasks: [],
          propertiesMap: propertiesMap,
        };
      }

      console.log('📡 Fetching tasks for propertyId:', propertyId);
      const tasksRes = await api.getMaintenanceTasks(propertyId, {
        includeCompleted: false,
      });

      console.log('📥 Tasks Response:', {
        success: tasksRes.success,
        count: tasksRes.success ? tasksRes.data.length : 0
      });

      const tasks = tasksRes.success ? tasksRes.data : [];

      return {
        maintenanceTasks: tasks,
        propertiesMap: propertiesMap,
      };
    },
    // 🔑 FIX 2: Force fresh data on navigation to prevent stale cache issues
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });

  // 🔑 FIX 3: Defensive array handling - ensure we always have an array
  const allMaintenanceTasks = Array.isArray(mainData?.maintenanceTasks) 
    ? mainData.maintenanceTasks 
    : [];

  // Back link logic based on navigation source
  const getBackLink = () => {
    if (from === 'seasonal') {
      return {
        href: `/dashboard/seasonal${selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''}`,
        label: 'Back to Seasonal Maintenance'
      };
    }
    if (from === 'risk-assessment' && selectedPropertyId) {
      return {
        href: `/dashboard/properties/${selectedPropertyId}/risk-assessment`,
        label: 'Back to Risk Assessment'
      };
    }
    return null;
  };

  const backLink = getBackLink();
  
  const maintenanceItems = useMemo(() => {
    // 🔑 FIX 4: Double-check array before operations
    if (!Array.isArray(allMaintenanceTasks)) {
      console.warn('⚠️ allMaintenanceTasks is not an array:', allMaintenanceTasks);
      return [];
    }

    let items = allMaintenanceTasks;
  
    // Filter out completed/cancelled
    items = items.filter(
      task => task.status !== 'COMPLETED' && task.status !== 'CANCELLED'
    );
  
    // Priority mode
    if (priority) {
      const priorityItems = items
        .filter(task => task.priority === 'URGENT' || task.priority === 'HIGH')
        .sort((a, b) => {
          const priorityOrder = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
          return (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0);
        });

      if (priorityItems.length > 0) {
        return priorityItems;
      }
    }
    // Default sort by next due date
    return items.sort((a, b) => {
      if (!a.nextDueDate) return 1;
      if (!b.nextDueDate) return -1;
      return new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime();
    });
  }, [allMaintenanceTasks, priority]);

  // 🔑 FIX 5: Debug logging to track state (can be removed after verification)
  useEffect(() => {
    console.group('🔍 MAINTENANCE PAGE STATE');
    console.log('1. Selected PropertyId:', selectedPropertyId);
    console.log('2. Is Loading:', isInitialLoading);
    console.log('3. Main Data:', mainData);
    console.log('4. All Tasks (raw):', mainData?.maintenanceTasks);
    console.log('5. All Tasks (safe):', allMaintenanceTasks);
    console.log('6. All Tasks Length:', allMaintenanceTasks.length);
    console.log('7. Filtered Items Length:', maintenanceItems.length);
    console.log('8. Priority Mode:', priority);
    console.groupEnd();
  }, [selectedPropertyId, isInitialLoading, mainData, allMaintenanceTasks, maintenanceItems, priority]);

  // Modal handlers
  const handleOpenModal = (task: PropertyMaintenanceTask) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };
  
  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: UpdateMaintenanceTaskInput }) => {
      const response = await api.updateMaintenanceTask(id, data); 
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update task.');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] }); 
      toast({ title: "Task Updated", description: "Maintenance task updated successfully." });
      handleCloseModal();
    },
    onError: (error) => {
      toast({ 
        title: "Update Failed", 
        description: error.message || "Could not update task.",
        variant: "destructive" 
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.deleteMaintenanceTask(id);
      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to delete task.');
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] }); 
      toast({ title: "Task Removed", description: "Task deleted successfully." });
      handleCloseModal();
    },
    onError: (error) => {
      toast({ 
        title: "Removal Failed", 
        description: error.message || "Could not remove task.",
        variant: "destructive" 
      });
    },
  });

  // Mark complete mutation
  const handleMarkComplete = useMutation({
    mutationFn: async (task: PropertyMaintenanceTask) => {
      const response = await api.updateMaintenanceTaskStatus(task.id, {
        status: 'COMPLETED',
        actualCost: task.estimatedCost || undefined,
      });
      
      if (!response.success) {
        throw new Error('Failed to mark as complete.');
      }
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      toast({ 
        title: "Task Completed", 
        description: `"${data.title}" marked as complete.`, 
      });
    },
    onError: (error) => {
      toast({
        title: "Completion Failed",
        description: error.message || "Could not mark task as complete.",
        variant: "destructive",
      });
    }
  });

  const handleSaveTaskUpdate = (config: MaintenanceTaskConfig) => {
    if (!editingTask) return;

    const updateData: UpdateMaintenanceTaskInput = {
      title: config.title,
      description: config.description,
      isRecurring: config.isRecurring,
      frequency: config.isRecurring ? (config.frequency as any) : null,
      nextDueDate: config.nextDueDate 
        ? format(config.nextDueDate, 'yyyy-MM-dd') 
        : null,
      serviceCategory: config.serviceCategory as MaintenanceTaskServiceCategory,
    };

    updateMutation.mutate({ id: editingTask.id, data: updateData });
  };
  
  const handleRemoveTask = (taskId: string) => {
    deleteMutation.mutate(taskId);
  };

  if (isInitialLoading || updateMutation.isPending || deleteMutation.isPending || handleMarkComplete.isPending) { 
    return (
      <div className="space-y-6 pb-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mt-10" />
        <p className="text-center text-gray-500">Loading maintenance tasks...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8 max-w-7xl mx-auto px-4 md:px-8">
      {/* Back Link - handles both seasonal and risk-assessment navigation */}
      {backLink && (
        <Link 
          href={backLink.href}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 group"
        >
          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
          {backLink.label}
        </Link>
      )}
      
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-7 h-7 text-blue-600" /> Home Tasks & Reminders
        </h2>
        
        <Button asChild>
          <Link href={`/dashboard/maintenance-setup${propertyId ? `?propertyId=${propertyId}` : ''}`}>
            <Plus className="w-4 h-4 mr-2" /> Add New Tasks
          </Link>
        </Button>
      </div>
      
      <p className="text-muted-foreground">Manage your scheduled maintenance tasks.</p>

      {/* Priority Toggle */}
      <div className="flex items-center gap-2">
        <Switch
          id="priority-mode"
          checked={priority}
          onCheckedChange={togglePriorityView}
        />
        <Label htmlFor="priority-mode" className="cursor-pointer">
          Show high priority tasks only
        </Label>
      </div>

      {maintenanceItems.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Active Tasks Found</CardTitle>
          <CardDescription>
            Visit <Link href={`/dashboard/maintenance-setup${propertyId ? `?propertyId=${propertyId}` : ''}`} className="text-blue-600 hover:underline">Task Setup</Link> to add maintenance tasks.
          </CardDescription>
        </Card>
      )}

      {maintenanceItems.length > 0 && (
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
                const frequencyDisplay = task.isRecurring && task.frequency
                  ? formatEnumString(task.frequency)
                  : 'One-time';

                return (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.title}</TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {task.description || 'No description'}
                    </TableCell>
                    <TableCell>
                      <span className={cn(
                        'px-2 py-1 rounded text-xs font-medium',
                        task.priority === 'URGENT' && 'bg-red-100 text-red-700',
                        task.priority === 'HIGH' && 'bg-orange-100 text-orange-700',
                        task.priority === 'MEDIUM' && 'bg-yellow-100 text-yellow-700',
                        task.priority === 'LOW' && 'bg-green-100 text-green-700'
                      )}>
                        {task.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCategory(task.serviceCategory)}
                    </TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">
                      {frequencyDisplay}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {task.lastCompletedDate ? format(new Date(task.lastCompletedDate), 'MMM dd, yyyy') : 'Never'}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn('font-medium text-sm', dueDateInfo.color)}>
                        {dueDateInfo.text}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center space-x-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-500 hover:text-green-600"
                          onClick={() => handleMarkComplete.mutate(task)}
                          title="Mark Complete"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-gray-500 hover:text-blue-600"
                          onClick={() => handleOpenModal(task)}
                          title="Edit Task"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal for Editing */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        template={null}
        properties={mainData?.propertiesMap ? Array.from(mainData.propertiesMap.values()) : []}
        existingConfig={editingTask ? ({
          templateId: editingTask.id,
          title: editingTask.title,
          description: editingTask.description,
          isRecurring: editingTask.isRecurring,
          frequency: editingTask.frequency as RecurrenceFrequency | null,
          nextDueDate: editingTask.nextDueDate ? new Date(editingTask.nextDueDate) : null,
          serviceCategory: editingTask.serviceCategory as any,
          propertyId: editingTask.propertyId,
        }) : null}
        onSave={handleSaveTaskUpdate}
        onRemove={handleRemoveTask}
      />
    </div>
  );
}