// apps/frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Wrench, Calendar, Settings, Plus, Edit, Trash2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { api } from '@/lib/api/client';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; 
import { MaintenanceConfigModal } from '../maintenance-setup/MaintenanceConfigModal'; 
import { 
  MaintenanceTaskConfig, 
  RecurrenceFrequency,
  ServiceCategory,
  ChecklistItem, 
} from '@/types';


// Define the type for items fetched from the checklist endpoint
interface DashboardChecklistItem extends ChecklistItem {}

// Categories to EXCLUDE (Renewals and Financial items)
const RENEWAL_CATEGORIES: ServiceCategory[] = [
  'INSURANCE',
  'WARRANTY',
  'FINANCE',
  'ADMIN',
  'ATTORNEY',
];


// Helper to format days until due
const formatDueDate = (dueDateString: string | null) => {
    if (!dueDateString) return { text: 'N/A', color: 'text-gray-500' }; 

    // Parse the date using UTC to avoid timezone issues with `new Date()`
    const dueDate = parseISO(dueDateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize today to midnight for consistent comparison

    const days = differenceInDays(dueDate, today);
    
    if (days < 0) {
        return { text: `Overdue by ${Math.abs(days)} days`, color: 'text-red-600' };
    }
    if (days <= 30) {
        return { text: `Due in ${days} days`, color: 'text-orange-500' };
    }
    return { text: `Due ${format(dueDate, 'MMM dd, yyyy')}`, color: 'text-gray-700' };
};


// --- Main Page Component ---
export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DashboardChecklistItem | null>(null);

  // Fetch the user's full checklist
  const { data: checklistRes, isLoading, refetch } = useQuery({
    queryKey: ['full-home-checklist'],
    queryFn: () => api.getChecklist(),
  });

  // FIX: Access 'items' directly from the checklistRes object, 
  // casting to 'any' to bypass the TypeScript error (TS2352) caused by the API client's mixed return type.
  const allChecklistItems = useMemo(() => {
    const rawData = checklistRes as any;

    // Check if the successful response (raw data) contains the items array
    if (!rawData || !Array.isArray(rawData.items)) {
      console.error("Error fetching checklist data: Items array missing or invalid response structure.", rawData?.message || rawData);
      return [];
    }
    
    // Return the items array
    return rawData.items as DashboardChecklistItem[];
  }, [checklistRes]);


  // Filter the list for active, recurring, non-renewal maintenance tasks
  const maintenanceItems = useMemo(() => {
    return allChecklistItems
      .filter(item => item.isRecurring)
      .filter(item => 
        // Filter: Show all active tasks (i.e., not completed or dismissed)
        item.status !== 'COMPLETED' && item.status !== 'NOT_NEEDED'
      ) 
      .filter(item => 
        // Exclude renewal categories
        !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory)
      )
      .sort((a, b) => { 
        // Sort by soonest Next Due Date
        const dateA = a.nextDueDate ? parseISO(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? parseISO(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [allChecklistItems]);

  // --- Modal Handlers & Mutations ---
  const handleOpenModal = (task: DashboardChecklistItem) => {
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<DashboardChecklistItem> }) => {
      const updateData = {
          title: data.title,
          description: data.description,
          isRecurring: data.isRecurring,
          frequency: data.frequency,
          nextDueDate: data.nextDueDate,
          serviceCategory: data.serviceCategory,
      }
      const response = await api.updateChecklistItem(id, updateData); 
      if (!response.success) {
          throw new Error(response.error?.message || 'Failed to update item.');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['full-home-checklist'] });
      toast({ title: "Task Updated", description: "Maintenance task configuration saved." });
      handleCloseModal();
    },
    onError: (error) => {
      toast({ 
        title: "Update Failed", 
        description: error.message || "Could not save task changes.",
        variant: "destructive" 
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.deleteChecklistItem(id);
      if (!response.success) {
          throw new Error(response.error?.message || 'Failed to delete item.');
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['full-home-checklist'] });
      toast({ title: "Task Removed", description: "Maintenance task permanently deleted." });
      handleCloseModal();
    },
    onError: (error) => {
      toast({ 
        title: "Removal Failed", 
        description: error.message || "Could not remove the task.",
        variant: "destructive" 
      });
    },
  });

  const handleSaveTaskUpdate = (config: MaintenanceTaskConfig) => {
    if (!editingTask) return;

    // Map the MaintenanceConfigModal output to the ChecklistItem update DTO
    const updateData: Partial<DashboardChecklistItem> = {
      title: config.title,
      description: config.description,
      isRecurring: config.isRecurring,
      frequency: config.isRecurring ? config.frequency : null,
      nextDueDate: config.isRecurring && config.nextDueDate 
        ? format(config.nextDueDate, 'yyyy-MM-dd') 
        : null,
      serviceCategory: config.serviceCategory,
    };

    updateMutation.mutate({ id: editingTask.id, data: updateData });
  };
  
  const handleRemoveTask = (taskId: string) => {
    deleteMutation.mutate(taskId);
  };
  // --- End Modal Handlers & Mutations ---
  

  if (isLoading || updateMutation.isPending || deleteMutation.isPending) { 
    return (
      <div className="space-y-6 pb-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mt-10" />
        <p className="text-center text-gray-500">Loading maintenance tasks...</p>
      </div>
    );
  }


  return (
    <div className="space-y-6 pb-8 max-w-7xl mx-auto px-4 md:px-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="w-7 h-7 text-blue-600" /> Recurring Maintenance
        </h2>
        
        {/* Link to the Setup Page to add new tasks */}
        <Button asChild>
          <Link href="/dashboard/maintenance-setup">
            <Plus className="w-4 h-4 mr-2" /> Add New Tasks
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground">Manage your recurring home maintenance schedule, separate from renewals and finances.</p>

      {maintenanceItems.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Recurring Maintenance Found</CardTitle>
          <CardDescription>
            Visit <Link href="/dashboard/maintenance-setup" className="text-blue-600 hover:underline">Maintenance Setup</Link> to add scheduled tasks.
          </CardDescription>
        </Card>
      )}

      {maintenanceItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {maintenanceItems.map(item => {
            const dueDateInfo = formatDueDate(item.nextDueDate);
            const isAlert = dueDateInfo.color !== 'text-gray-700';

            return (
              <Card 
                key={item.id} 
                className={cn(
                  "flex flex-col",
                  isAlert ? "border-orange-400 bg-orange-50/50" : "border-gray-200"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">
                      {item.title}
                    </CardTitle>
                    <div className={cn(
                      "text-xs font-semibold px-2 py-1 rounded-full",
                      isAlert ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'
                    )}>
                      {item.frequency || 'N/A'}
                    </div>
                  </div>
                  <CardDescription>
                    Category: {item.serviceCategory || 'General'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-3 pt-3 text-sm">
                    <p className="text-gray-600 line-clamp-2">{item.description || 'No detailed description provided.'}</p>
                    
                    <div className="flex items-center gap-2 border-t pt-3">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className={cn('font-medium', dueDateInfo.color)}>
                            {dueDateInfo.text}
                        </span>
                    </div>
                    {item.lastCompletedDate && (
                        <div className="text-xs text-muted-foreground">
                            Last done: {format(parseISO(item.lastCompletedDate), 'MMM dd, yyyy')}
                        </div>
                    )}
                </CardContent>
                <div className="flex border-t">
                  <Button 
                    variant="ghost" 
                    className="w-1/2 rounded-none text-blue-600"
                    onClick={() => handleOpenModal(item)} // Open modal on click
                    disabled={updateMutation.isPending || deleteMutation.isPending}
                  >
                    <Settings className="w-4 h-4 mr-2" /> View/Edit
                  </Button>
                  {/* Action button would trigger the mark-complete API call */}
                  <Button 
                    variant="ghost" 
                    className="w-1/2 rounded-none rounded-br-lg text-green-600 hover:bg-green-50"
                    onClick={() => toast({ title: "Mark Complete", description: "Functionality to be implemented." })}
                  >
                    <Edit className="w-4 h-4 mr-2" /> Mark Complete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* --- MODAL FOR EDITING --- */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        template={null} 
        existingConfig={editingTask ? {
            templateId: editingTask.id, 
            title: editingTask.title,
            description: editingTask.description,
            isRecurring: editingTask.isRecurring,
            frequency: editingTask.frequency as RecurrenceFrequency,
            nextDueDate: editingTask.nextDueDate ? parseISO(editingTask.nextDueDate) : null,
            serviceCategory: editingTask.serviceCategory as ServiceCategory,
        } : null}
        onSave={handleSaveTaskUpdate} 
        onRemove={() => handleRemoveTask(editingTask?.id || '')} 
      />
    </div>
  );
}