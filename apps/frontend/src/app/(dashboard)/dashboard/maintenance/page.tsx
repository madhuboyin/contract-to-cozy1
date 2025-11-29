// apps/frontend/src/app/(dashboard)/dashboard/maintenance/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Loader2, Wrench, Calendar, Settings, Plus, Edit, Trash2, CheckCircle } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { api } from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; 
import { useRouter } from 'next/navigation'; 
import { MaintenanceConfigModal } from '../maintenance-setup/MaintenanceConfigModal'; 
import { 
  MaintenanceTaskConfig, 
  RecurrenceFrequency,
  ServiceCategory,
  ChecklistItem, 
  UpdateChecklistItemInput,
  Property,
  APIResponse, 
  Checklist, 
} from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';


// Define the type for items fetched from the checklist endpoint
interface DashboardChecklistItem extends ChecklistItem {}

// Define the custom type needed for the existingConfig prop to resolve the propertyId conflict
type EditingConfig = MaintenanceTaskConfig & {
    propertyId: string | null;
};

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
    if (!dueDateString) return { text: 'N/A', color: 'text-gray-500', isAlert: false }; 

    const dueDate = parseISO(dueDateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0); 

    const days = differenceInDays(dueDate, today);
    
    if (days < 0) {
        return { text: `Overdue by ${Math.abs(days)} days`, color: 'text-red-600', isAlert: true };
    }
    if (days === 0) {
        return { text: 'Due Today', color: 'text-red-600', isAlert: true };
    }
    if (days <= 30) {
        return { text: `Due in ${days} days`, color: 'text-orange-600', isAlert: true };
    }
    return { text: `${format(dueDate, 'MMM dd, yyyy')}`, color: 'text-gray-700', isAlert: false };
};

// FIX: Renamed and modified helper to accept string | null, resolving the type error.
function formatEnumString(val: string | null | undefined): string {
    if (!val) return 'N/A';
    // Use replace to convert underscores and then capitalize
    return val.toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// Helper to format category for display (now just calls the generic formatter)
function formatCategory(category: ServiceCategory | null) {
    if (!category) return 'General';
    return formatEnumString(category);
}


// --- Main Page Component ---
export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DashboardChecklistItem | null>(null);

  // --- START FIX: Fetch Properties and Checklists in parallel ---
  const { data: mainData, isLoading: isInitialLoading } = useQuery({
    queryKey: ['maintenance-page-data'],
    queryFn: async () => {
      const [checklistRes, propertiesRes] = await Promise.all([
        api.getChecklist() as Promise<APIResponse<Checklist & { items: ChecklistItem[] }>>,
        api.getProperties(),
      ]);

      if (!checklistRes.success || !propertiesRes.success) {
        throw new Error("Failed to fetch dashboard data.");
      }
      
      // Map properties for quick lookup
      const propertiesMap = new Map<string, Property>();
      propertiesRes.data.properties.forEach(p => propertiesMap.set(p.id, p));

      // FIX: Ensure items array is correctly extracted from the APIResponse structure
      const checklistItems = checklistRes.data.items as DashboardChecklistItem[]; 

      return {
        checklistItems: checklistItems,
        propertiesMap: propertiesMap,
      };
    },
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 mins
  });
  // --- END FIX ---

  // Helper to map property ID to display name
  const getPropertyName = (propertyId: string | null): string => {
    // NOTE: If propertyId is null/undefined, this returns 'No Property Linked'
    if (!propertyId || !mainData?.propertiesMap) return 'No Property Linked';
    
    const property = mainData.propertiesMap.get(propertyId);
    if (!property) return 'Unknown Property';

    return property.name || property.address;
  }

  const allChecklistItems = mainData?.checklistItems || [];

  // Filter the list for active, recurring, non-renewal maintenance tasks
  const maintenanceItems = useMemo(() => {
    // FIX: Removed incorrect property filtering logic. The master list should show 
    // ALL recurring tasks associated with the user's checklist.
    
    return allChecklistItems
      // 1. Must be recurring
      .filter(item => item.isRecurring)
      // 2. Must be active (not COMPLETED or NOT_NEEDED)
      .filter(item => 
        item.status !== 'COMPLETED' && item.status !== 'NOT_NEEDED'
      ) 
      // 3. Must NOT be a renewal/financial task
      .filter(item => 
        // Filter out renewal/financial tasks (INSURANCE, WARRANTY, etc.)
        !item.serviceCategory || !RENEWAL_CATEGORIES.includes(item.serviceCategory)
      )
      .sort((a, b) => { 
        const dateA = a.nextDueDate ? parseISO(a.nextDueDate).getTime() : Infinity;
        const dateB = b.nextDueDate ? parseISO(b.nextDueDate).getTime() : Infinity;
        return dateA - dateB;
      });
  }, [allChecklistItems]); // The dependency list is correctly minimized


  // --- Modal Handlers & Mutations (Omitted for brevity) ---
  // Step 3.1: Update handleOpenModal for redirection
  const handleOpenModal = (task: DashboardChecklistItem) => {
    // Check for renewal category and redirect if necessary
    if (task.serviceCategory && RENEWAL_CATEGORIES.includes(task.serviceCategory)) {
        let redirectPath = '/dashboard/profile'; // Default safe redirect for general financial/admin tasks
        
        if (task.serviceCategory === 'INSURANCE') {
            redirectPath = '/dashboard/insurance';
        } else if (task.serviceCategory === 'WARRANTY') {
            redirectPath = '/dashboard/warranties';
        }

        router.push(redirectPath);
        toast({ title: "Renewal Task", description: `Please manage "${task.title}" directly on the ${formatEnumString(task.serviceCategory)} management page.` });
        return; // Skip opening the modal
    }
    
    // Proceed to open modal for actual maintenance tasks
    setEditingTask(task);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTask(null);
  };
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: UpdateChecklistItemInput }) => {
      const response = await api.updateChecklistItem(id, data); 
      if (!response.success) {
          throw new Error(response.error?.message || 'Failed to update item.');
      }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] }); // FIX: Invalidate the correct query key
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
      queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] }); // FIX: Invalidate the correct query key
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

  const handleMarkComplete = useMutation({
    mutationFn: async (item: DashboardChecklistItem) => {
        const response = await api.updateChecklistItem(item.id, { status: 'COMPLETED' });
        if (!response.success) {
            throw new Error(response.error?.message || 'Failed to mark as complete.');
        }
        return response.data;
    },
    onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] }); // FIX: Invalidate the correct query key
        toast({ 
            title: "Task Completed", 
            description: `"${data.title}" reset for its next cycle.`, 
            variant: 'default'
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

    // Use the UpdateChecklistItemInput DTO
    const updateData: UpdateChecklistItemInput = {
      title: config.title,
      description: config.description,
      isRecurring: config.isRecurring,
      frequency: config.isRecurring ? config.frequency : null,
      nextDueDate: config.isRecurring && config.nextDueDate 
        ? format(config.nextDueDate, 'yyyy-MM-dd') 
        : null,
      serviceCategory: config.serviceCategory,
      // propertyId is NOT mutable via the checklist update DTO
    };

    updateMutation.mutate({ id: editingTask.id, data: updateData });
  };
  
  const handleRemoveTask = (taskId: string) => {
    deleteMutation.mutate(taskId);
  };
  // --- End Modal Handlers & Mutations ---
  

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

      {/* FIX: The list should now correctly show tasks because the property filter was removed. */}
      {maintenanceItems.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Recurring Maintenance Found</CardTitle>
          <CardDescription>
            Visit <Link href="/dashboard/maintenance-setup" className="text-blue-600 hover:underline">Maintenance Setup</Link> to add scheduled tasks.
          </CardDescription>
        </Card>
      )}

      {!isInitialLoading && maintenanceItems.length > 0 && (
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                {/* FIX: Added Property Column */}
                <TableHead className="w-[150px]">Property</TableHead>
                <TableHead className="w-[200px]">Task</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[120px] hidden sm:table-cell">Frequency</TableHead>
                <TableHead className="w-[150px]">Last Done</TableHead>
                <TableHead className="w-[150px] text-center">Next Due</TableHead>
                <TableHead className="w-[150px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenanceItems.map(item => {
                const dueDateInfo = formatDueDate(item.nextDueDate);
                
                return (
                  <TableRow 
                    key={item.id} 
                    className={cn(dueDateInfo.isAlert ? 'bg-orange-50/50 hover:bg-orange-50' : 'hover:bg-gray-50')}
                  >
                    {/* FIX: Display Property Name */}
                    <TableCell className="font-medium text-sm">
                        {getPropertyName(item.propertyId)}
                    </TableCell>

                    <TableCell className="font-medium text-gray-900">
                      {item.title}
                      <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                        {item.description || 'No description.'}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCategory(item.serviceCategory)}
                    </TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">
                      {/* FIX: Use the generic formatter on the frequency string */}
                      {formatEnumString(item.frequency)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                        {item.lastCompletedDate ? format(parseISO(item.lastCompletedDate), 'MMM dd, yyyy') : 'Never'}
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
                            onClick={() => handleMarkComplete.mutate(item)}
                            title="Mark Complete"
                            disabled={handleMarkComplete.isPending}
                          >
                            <CheckCircle className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-gray-500 hover:text-blue-600"
                            onClick={() => handleOpenModal(item)}
                            title="Edit Task"
                            disabled={updateMutation.isPending || deleteMutation.isPending}
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

      {/* --- MODAL FOR EDITING (Now uses unified interface) --- */}
      <MaintenanceConfigModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        template={null} // Editing doesn't use the template object
        properties={mainData?.propertiesMap ? Array.from(mainData.propertiesMap.values()) : []} // Pass properties for display
        existingConfig={editingTask ? ({
            // templateId is repurposed to hold the ChecklistItem ID for editing/removal
            templateId: editingTask.id, 
            title: editingTask.title,
            description: editingTask.description,
            isRecurring: editingTask.isRecurring,
            frequency: editingTask.frequency as RecurrenceFrequency | null,
            nextDueDate: editingTask.nextDueDate ? parseISO(editingTask.nextDueDate) : null,
            serviceCategory: editingTask.serviceCategory as ServiceCategory | null,
            // Pass propertyId which is string | null
            propertyId: editingTask.propertyId,
        } as EditingConfig) : null} // Casting the object literal to the custom intersection type
        onSave={handleSaveTaskUpdate} 
        onRemove={() => handleRemoveTask(editingTask?.id || '')} 
      />
    </div>
  );
}