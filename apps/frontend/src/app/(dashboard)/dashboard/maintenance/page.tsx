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
import { useRouter, useSearchParams } from 'next/navigation'; 
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

import { AssetRiskDetail, RiskAssessmentReport } from '@/types';
// Define the type for items fetched from the checklist endpoint
interface DashboardChecklistItem extends ChecklistItem {
  assetName?: string; // Optional asset name for risk assessment matching
}

// Define the custom type needed for the existingConfig prop to resolve the propertyId conflict
type EditingConfig = MaintenanceTaskConfig & {
    propertyId: string | null;
};

// --- START: UPDATED CATEGORY LOGIC ---
// Categories that trigger immediate redirection and should be filtered OUT of this list
const DIRECT_NAVIGATION_CATEGORIES: ServiceCategory[] = [
  'INSURANCE',
  'WARRANTY',
  'ATTORNEY',
];
// Helper to check if a task belongs to the immediate redirect group
const isDirectNavigationTask = (category: ServiceCategory | null): boolean => {
    return !!category && DIRECT_NAVIGATION_CATEGORIES.includes(category);
}
// --- END: UPDATED CATEGORY LOGIC ---

const RISK_SEVERITY_ORDER: Record<string, number> = {
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};
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

function resolveAssetKeyFromTask(item: ChecklistItem): string | null {
  const text = `${item.title} ${item.description || ''}`.toUpperCase();

  if (text.includes('HVAC') || text.includes('FURNACE')) return 'HVAC_FURNACE';
  if (text.includes('WATER HEATER')) return 'WATER_HEATER_TANK';
  if (text.includes('ROOF')) return 'ROOF_SHINGLE';
  if (text.includes('SMOKE') || text.includes('CO')) return 'SAFETY_SMOKE_CO_DETECTORS';

  return null;
}
function isAssetDrivenTask(
  item: ChecklistItem,
  riskByAsset: Record<string, AssetRiskDetail>
): AssetRiskDetail | null {
  // Exclude non-physical categories early
  if (
    item.serviceCategory === 'ADMIN' ||
    item.serviceCategory === 'FINANCE' ||
    item.serviceCategory === 'INSURANCE' ||
    item.serviceCategory === 'WARRANTY' ||
    item.serviceCategory === 'ATTORNEY'
  ) {
    return null;
  }

  const assetKey = resolveAssetKeyFromTask(item);
  if (!assetKey) return null;

  return riskByAsset[assetKey] ?? null;
}

// --- Main Page Component ---
export default function MaintenancePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Extract propertyId from URL query parameters
  const selectedPropertyId = searchParams.get('propertyId');
  const priority = searchParams.get('priority') === 'true';

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
  const [editingTask, setEditingTask] = useState<DashboardChecklistItem | null>(null);

  // --- START FIX: Fetch Properties and Checklists in parallel ---
  const { data: mainData, isLoading: isInitialLoading } = useQuery({
    queryKey: ['maintenance-page-data'],
    queryFn: async () => {
      const [checklistRes, propertiesRes] = await Promise.all([
        api.getChecklist(),
        api.getProperties(),
      ]);

      // Properties response is wrapped in APIResponse
      if (!propertiesRes.success) {
        throw new Error("Failed to fetch properties.");
      }
      
      // Map properties for quick lookup
      const propertiesMap = new Map<string, Property>();
      propertiesRes.data.properties.forEach(p => propertiesMap.set(p.id, p));

      let checklistItems: DashboardChecklistItem[] = [];
      
      if ('success' in checklistRes && checklistRes.success) {
        checklistItems = checklistRes.data.items as DashboardChecklistItem[];
      } else if ('items' in checklistRes) {
        checklistItems = (checklistRes as any).items as DashboardChecklistItem[];
      }

      return {
        checklistItems: checklistItems,
        propertiesMap: propertiesMap,
      };
    },
    staleTime: 5 * 60 * 1000, // Keep data fresh for 5 mins
  });
  // --- END FIX ---
  // =======================
  // Phase 4 — Risk Context
  // =======================
  const { data: riskReport } = useQuery({
    queryKey: ['risk-report', selectedPropertyId],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      const res = await api.getRiskReportSummary(selectedPropertyId);
      return res === 'QUEUED' ? null : res;
    },
  });
  const { data: warrantiesRes } = useQuery({
    queryKey: ['warranties', selectedPropertyId],
    enabled: !!selectedPropertyId,
    queryFn: async () => {
      if (!selectedPropertyId) return [];
      const res = await api.listWarranties(selectedPropertyId);
      return res.success ? res.data.warranties : [];
    },
  });
  
  const hasWarranty = useMemo(() => {
    return (warrantiesRes?.length ?? 0) > 0;
  }, [warrantiesRes]);

  const riskByAsset = useMemo<Record<string, AssetRiskDetail>>(() => {
    if (!riskReport || !('details' in riskReport)) return {};
    return Object.fromEntries(
      (riskReport.details || []).map(r => [r.assetName, r])
    );
  }, [riskReport]);      
  // Helper to map property ID to display name
  const getPropertyName = (propertyId: string | null): string => {
    if (!propertyId || !mainData?.propertiesMap) return 'No Property Linked';
    
    const property = mainData.propertiesMap.get(propertyId);
    if (!property) return 'Unknown Property';

    return property.name || property.address;
  }

  const allChecklistItems = mainData?.checklistItems || [];
  
  const maintenanceItems = useMemo(() => {
    let items = allChecklistItems;
  
    // 1. Filter by property
    if (selectedPropertyId) {
      items = items.filter(item => item.propertyId === selectedPropertyId);
    }
  
    // 2. Active only
    items = items.filter(
      item => item.status !== 'COMPLETED' && item.status !== 'NOT_NEEDED'
    );
  
    // 3. Exclude direct navigation categories
    items = items.filter(item => !isDirectNavigationTask(item.serviceCategory));
  
    // 4. PRIORITY MODE
    if (priority) {
      const priorityItems = items
        .map(item => {
          const risk = isAssetDrivenTask(item, riskByAsset);
          return risk ? { item, risk } : null;
        })
        .filter(Boolean) as { item: ChecklistItem; risk: AssetRiskDetail }[];
  
      if (priorityItems.length > 0) {
        // Sort by risk severity (HIGH → LOW)
        priorityItems.sort(
          (a, b) =>
            (RISK_SEVERITY_ORDER[b.risk.riskLevel] ?? 0) -
            (RISK_SEVERITY_ORDER[a.risk.riskLevel] ?? 0)
        );
  
        return priorityItems.map(p => p.item);
      }
      // else → fallback to full list
    }
  
    // 5. Default sort by next due date
    return items.sort((a, b) => {
      const dateA = a.nextDueDate ? parseISO(a.nextDueDate).getTime() : Infinity;
      const dateB = b.nextDueDate ? parseISO(b.nextDueDate).getTime() : Infinity;
      return dateA - dateB;
    });
  }, [allChecklistItems, selectedPropertyId, priority, riskByAsset]);  

  // 🔴 Priority View flag (asset-driven filtered view)
  const isPriorityView =
    priority &&
    maintenanceItems.length > 0 &&
    maintenanceItems.every(item =>
      isAssetDrivenTask(item, riskByAsset)
    );
  // --- Modal Handlers & Mutations ---
  
  // Step 3.1: Update handleOpenModal for redirection
  const handleOpenModal = (task: DashboardChecklistItem) => {
    // Check for categories that require immediate redirection (INSURANCE, WARRANTY, ATTORNEY)
    if (isDirectNavigationTask(task.serviceCategory)) {
        let redirectPath = '/dashboard/profile'; // Default safe redirect
        
        if (task.serviceCategory === 'INSURANCE') {
            redirectPath = '/dashboard/insurance';
        } else if (task.serviceCategory === 'WARRANTY') {
            redirectPath = '/dashboard/warranties';
        } else if (task.serviceCategory === 'ATTORNEY') {
            redirectPath = '/dashboard/profile'; // Or whatever the dedicated Attorney page is
        }

        router.push(redirectPath);
        toast({ 
          title: "Task Management", 
          description: `Please manage "${task.title}" directly on the ${formatEnumString(task.serviceCategory)} management page.`,
          variant: 'default' // Using default variant for informational toast
        });
        return; // Skip opening the modal
    }    
    // For MAINTENANCE, FINANCE, and ADMIN tasks, proceed to open the modal for configuration/reminders
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
      queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] }); 
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
      queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] }); 
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
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/checklist/items/${item.id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'COMPLETED' }),
        }
      );
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to mark as complete.');
      }
  
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-page-data'] });
      
      // ✅ ADD THESE LINES:
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklists'] });
      queryClient.invalidateQueries({ queryKey: ['seasonal-checklist'] });
      
      toast({ 
        title: "Task Completed", 
        description: `"${data.title}" completed successfully.`, 
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
      
      // FIX: nextDueDate assignment. Format the Date object to ISO string if it exists.
      nextDueDate: config.nextDueDate 
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
          <Wrench className="w-7 h-7 text-blue-600" /> Home Tasks & Reminders
        </h2>

        {priority && (
          <div className="flex items-center gap-3 mt-2">
            <span
              className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700"
              title="Showing only high-impact maintenance tasks affecting property health"
            >
              Priority ({maintenanceItems.length})
            </span>

            <Link
              href={`/dashboard/maintenance${
                selectedPropertyId ? `?propertyId=${selectedPropertyId}` : ''
              }`}
              className="text-xs text-blue-600 hover:underline"
            >
              Show all tasks
            </Link>
          </div>
        )}
        {/* Priority View Toggle */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Priority view</span>

          <button
            onClick={() => togglePriorityView(!priority)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              priority ? 'bg-orange-500' : 'bg-gray-300'
            }`}
            title={
              priority
                ? 'Showing only asset-related tasks affecting home health'
                : 'Show only high-impact maintenance tasks'
            }
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                priority ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Link to the Setup Page to add new tasks */}
      <div className="flex items-center gap-3">
        {/* Priority Toggle */}
        <Button
          size="sm"
          variant={priority ? 'default' : 'outline'}
          onClick={() => togglePriorityView(!priority)}
        >
          {priority ? 'Show all tasks' : 'Priority view'}
        </Button>

        {/* Add New Tasks */}
        <Button asChild>
          <Link href="/dashboard/maintenance-setup">
            <Plus className="w-4 h-4 mr-2" /> Add New Tasks
          </Link>
        </Button>
      </div>

      <p className="text-muted-foreground">Manage your scheduled maintenance, as well as crucial administrative and financial reminders.</p>

      {/* FIX: The list should now correctly show tasks because the filter was adjusted. */}
      {maintenanceItems.length === 0 && (
        <Card className="text-center py-10">
          <FileText className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <CardTitle>No Active Tasks Found</CardTitle>
          <CardDescription>
            Visit <Link href="/dashboard/maintenance-setup" className="text-blue-600 hover:underline">Task Setup</Link> to add scheduled maintenance or financial reminders.
          </CardDescription>
        </Card>
      )}

      {!isInitialLoading && maintenanceItems.length > 0 && (
        <>
          {/* Priority View Indicator */}
          <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Property</TableHead>
                <TableHead className="w-[200px]">Task</TableHead>
                <TableHead className="w-[120px]">Category</TableHead>
                <TableHead className="w-[120px] hidden sm:table-cell">Frequency/Type</TableHead>
                <TableHead className="w-[150px]">Last Done</TableHead>
                <TableHead className="w-[150px] text-center">Next Due</TableHead>
                <TableHead className="w-[150px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {maintenanceItems.map(item => {

                const dueDateInfo = formatDueDate(item.nextDueDate);                
                // FINAL FIX: Explicitly check for ADMIN and override the display based on the category,
                // ignoring the overridden isRecurring/frequency flags saved in the database.
                const frequencyDisplay = item.serviceCategory === 'ADMIN'
                  ? 'One-Time Reminder' // FIX: Hardcoded based on Category logic
                  : item.isRecurring 
                    ? formatEnumString(item.frequency) 
                    : 'One-Time Reminder'; // Fallback for general non-recurring
                
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

                      {/* ============================
                          Phase 4 — Why this exists
                        ============================ */}
                      {(() => {
                        const risk = isAssetDrivenTask(item, riskByAsset);

                        if (!risk) return null;

                        return (
                          <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                            <div>
                              <strong>Why:</strong>{' '}
                              {formatEnumString(risk.category)} —{' '}
                              {formatEnumString(risk.riskLevel)} risk (
                              {risk.age}/{risk.expectedLife} yrs)
                            </div>

                            <div>
                              <strong>Exposure:</strong>{' '}
                              ${risk.replacementCost.toLocaleString()}
                            </div>

                            {risk.actionCta &&
                              !(hasWarranty && risk.actionCta.toLowerCase().includes('warranty')) && (
                                <div className="text-blue-600 font-medium">
                                  Recommended: {risk.actionCta}
                                </div>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCategory(item.serviceCategory)}
                    </TableCell>
                    <TableCell className="text-sm hidden sm:table-cell">
                      {frequencyDisplay}
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
        </>
      )}

      {/* --- MODAL FOR EDITING (Now handles FINANCE/ADMIN flow) --- */}
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