// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal.tsx
// --- UNIFIED MODAL FOR BOTH CREATION AND EDITING ---
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MaintenanceTaskConfig,
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
  Property,
  MaintenanceTaskPriority,
  MaintenanceTaskServiceCategory, // Add service category type for API
} from '@/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { CalendarIcon, Home, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client'; 
import { Badge } from '@/components/ui/badge';

// Manually define options
const frequencyOptions: RecurrenceFrequency[] = [
  RecurrenceFrequency.MONTHLY,
  RecurrenceFrequency.QUARTERLY,
  RecurrenceFrequency.SEMI_ANNUALLY,
  RecurrenceFrequency.ANNUALLY,
];

const categoryOptions: ServiceCategory[] = [
  'INSPECTION', 'HANDYMAN', 'PLUMBING', 'ELECTRICAL', 'HVAC', 'LANDSCAPING', 
  'CLEANING', 'MOVING', 'PEST_CONTROL', 'LOCKSMITH',
];

// START: UPDATED LOGIC FOR ROUTING
// Categories that immediately redirect upon selection (Insurance, Warranty)
const DIRECT_REDIRECT_CATEGORIES: ServiceCategory[] = [
  'INSURANCE',
  'WARRANTY',
  'ATTORNEY',
];

// Categories that require configuration but navigate to a management page post-save (Finance, Admin)
const CONFIG_REDIRECT_CATEGORIES: ServiceCategory[] = [
  'FINANCE',
  'ADMIN',
];
// END: UPDATED LOGIC FOR ROUTING

function formatEnumString(val: string | null | undefined) {
  if (!val) return 'N/A';
  return val.toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
function getSourceBadge(input: {
  isEditing: boolean;
  orchestrationMode: boolean;
  existingConfig?: any | null;
  template?: any | null;
}) {
  // 1) Seasonal (edit flow)
  if (input.isEditing) {
    const src = input.existingConfig?.source;
    const seasonalId = input.existingConfig?.seasonalChecklistItemId;

    if (seasonalId || src === 'SEASONAL') {
      return { label: 'Seasonal', variant: 'secondary' as const };
    }

    if (src) {
      return { label: formatEnumString(src), variant: 'outline' as const };
    }

    return null;
  }

  // 2) Orchestration mode (Action Center)
  if (input.orchestrationMode) {
    return { label: 'Action Center', variant: 'outline' as const };
  }

  // 3) Creation from template (maintenance setup / seasonal add)
  // If your template has a notion of seasonal source, you can map it later.
  // For now, show "Template" badge in creation flow.
  if (input.template) {
    return { label: 'Template', variant: 'outline' as const };
  }

  return null;
}

// === Unified Props Interface ===
interface MaintenanceConfigModalProps {
  // Base Dialog Props (Required)
  isOpen: boolean;
  onClose: () => void;

  // --- Creation Flow Props (Only required by maintenance-setup/page.tsx) ---
  template?: MaintenanceTaskTemplate | null; // The task template used for creation
  onSuccess?: (count: number) => void;
  properties?: Property[]; // Full list of properties
  selectedPropertyId?: string; // Current selected property ID from parent state (Creation flow)
  onPropertyChange?: (id: string) => void; // State setter for property ID

  // --- Editing Flow Props (Only required by maintenance/page.tsx) ---
  existingConfig?: (MaintenanceTaskConfig & {
    propertyId: string | null;
  
    // ✅ NEW (optional): lets edit modal show source badge
    source?: string | null;
    seasonalChecklistItemId?: string | null;
  }) | null;
  // Existing task data
  onSave?: (config: MaintenanceTaskConfig) => void; // Callback for saving edits
  onRemove?: (taskId: string) => void; // Callback for removing task
  orchestrationMode?: boolean;
  orchestrationActionKey?: string | null; // ID of the orchestration action that triggered this modal
}
// === END FIX ===

export function MaintenanceConfigModal({
  template,
  existingConfig,
  isOpen,
  onClose,
  onSuccess,
  properties = [],
  selectedPropertyId: propSelectedPropertyId,
  onPropertyChange,
  onSave,
  onRemove,
  orchestrationMode = false,
  orchestrationActionKey,
}: MaintenanceConfigModalProps) {
  const router = useRouter();

  // Determine mode and source of initial data
  const isEditing = !!existingConfig;
  const isCreation = !!template && !isEditing;
  const initialConfig = existingConfig || template;
  
  // Determine if it's a direct redirect task (INSURANCE, WARRANTY)
  const isDirectRedirectTask = useMemo(() => {
    return !!initialConfig?.serviceCategory && DIRECT_REDIRECT_CATEGORIES.includes(initialConfig.serviceCategory as ServiceCategory);
  }, [initialConfig?.serviceCategory]);
  
  // Determine if it's a task that requires post-config navigation (FINANCE, ADMIN)
  const isConfigRedirectTask = useMemo(() => {
    return !!initialConfig?.serviceCategory && CONFIG_REDIRECT_CATEGORIES.includes(initialConfig.serviceCategory as ServiceCategory);
  }, [initialConfig?.serviceCategory]);

  // Determine if the category field should be locked
  const shouldLockCategory = isEditing || isCreation;
  
  // Map category to a friendly path for redirection
  const finalDestinationPath = useMemo(() => {
    switch(initialConfig?.serviceCategory) {
      case 'INSURANCE':
        return '/dashboard/insurance'; 
      case 'WARRANTY':
        return '/dashboard/warranties';
      case 'FINANCE':
        return '/dashboard/expenses'; // Final Destination for Finance
      case 'ADMIN':
        return '/dashboard/documents'; // Final Destination for Admin
      case 'ATTORNEY':
        return '/dashboard/profile';
      default:
        return null;
    }
  }, [initialConfig?.serviceCategory]);

  // State initialization
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(null);
  const [nextDueDate, setNextDueDate] = useState<Date | null>(null);
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  
  // Internal state for property ID management
  const [internalPropertyId, setInternalPropertyId] = useState<string | null>(null);


  // Handle Redirection (Used for direct redirects and post-save for FINANCE/ADMIN)
  const handleRedirection = useCallback(() => {
    if (finalDestinationPath) {
        // Use a slight delay to ensure the modal closes visually before navigating
        setTimeout(() => {
            router.push(finalDestinationPath);
        }, 100);
        onClose(); // Close the modal
    }
  }, [finalDestinationPath, router, onClose]);


  // 1. Populate state when modal opens/config changes
  useEffect(() => {
    if (initialConfig) {
      setTitle(initialConfig.title);
      setDescription(initialConfig.description || null);
      setCategory((initialConfig.serviceCategory as ServiceCategory) || null);
      
      setServerError(null);
      
      const isTemplateAdmin = initialConfig.serviceCategory === 'ADMIN';

      // --- Mode-specific initialization for recurrence and dates ---
      if (isEditing) {
        // Use properties from the existing configuration (ChecklistItem data)
        const config = existingConfig!; 
        setInternalPropertyId(config.propertyId);
        
        // Recurrence
        const rec = config.isRecurring;
        setIsRecurring(rec);
        setFrequency(rec ? (config.frequency as RecurrenceFrequency) : null);

        // Date - Must handle both Date objects (from page state) and ISO strings (from API)
        let initialDate: Date | null = null;
        if (config.nextDueDate) {
            if (config.nextDueDate instanceof Date) {
                initialDate = config.nextDueDate;
            } else {
                initialDate = parseISO(config.nextDueDate as string);
            }
        }
        
        // FIX: If the task is a CONFIG_REDIRECT_CATEGORY (FINANCE or ADMIN) and the date is missing, 
        // default it to today's date to force the user to save a corrected value.
        if (isConfigRedirectTask && !initialDate) {
            initialDate = new Date();
        }
        
        setNextDueDate(initialDate);

      } else if (isCreation) {
        // Use properties from the template (Creation flow)
        const temp = template!; 
        setInternalPropertyId(propSelectedPropertyId || null);
        
        // Defaults for a new template
        // ADMIN tasks are non-recurring by user request, FINANCE is recurring (default true)
        const initialIsRecurring = !isTemplateAdmin; 
        setIsRecurring(initialIsRecurring);
        
        // Only set frequency if it's explicitly recurring.
        setFrequency(initialIsRecurring ? (temp.defaultFrequency as RecurrenceFrequency) : null);
        setNextDueDate(new Date()); // Default to today
      }
    }
    
    // NEW LOGIC: Immediately redirect only for DIRECT_REDIRECT_CATEGORIES
    if (isOpen && isDirectRedirectTask && finalDestinationPath) {
        handleRedirection();
    }
  }, [
    template, 
    existingConfig, 
    isEditing, 
    isCreation, 
    propSelectedPropertyId, 
    isOpen, 
    isDirectRedirectTask, 
    finalDestinationPath, 
    handleRedirection,
    isConfigRedirectTask 
  ]);
  
  // Handle change in property selection
  const handlePropertyChange = (id: string) => {
    if (isCreation && onPropertyChange) {
        onPropertyChange(id);
    }
    // Update internal state for both flows
    setInternalPropertyId(id);
  }
  
  // 2. Handle Save/Submit Logic (Unified)
  const handleSubmit = async () => {
    // Determine the task ID and property ID based on mode
    const idToUse = existingConfig?.templateId || template?.id;
    const propertyIdToUse = existingConfig?.propertyId || propSelectedPropertyId || internalPropertyId;

    if (!idToUse || !propertyIdToUse) {
        setServerError("Cannot save: Missing task/template ID or property ID.");
        return;
    }
    
    // --- Logic to handle recurrence and date formatting for API DTO ---
    const isTemplateAdmin = template?.serviceCategory === 'ADMIN';

    // 1. Calculate final state variables
    // CRITICAL WORKAROUND: If ADMIN, force isRecurring to true and set a dummy frequency 
    // to bypass backend nullification logic and save the date.
    const finalIsRecurring = isTemplateAdmin ? true : isRecurring;
    const finalFrequency = isTemplateAdmin ? RecurrenceFrequency.ANNUALLY : finalIsRecurring ? frequency : null;

    // 2. Validation based on final state
    if (finalIsRecurring && !finalFrequency) {
        setServerError("Please select a recurrence frequency.");
        return;
    }
    if (!nextDueDate) {
        const dateFieldError = (category === 'ADMIN') ? "Please select a reminder date." : "Please select the next due date.";
        setServerError(dateFieldError);
        return;
    }
    if (!onSave && !onSuccess) { // Safety check
        setServerError("Modal configuration error: Missing save/success handler.");
        return;
    }

    // 3. Format Date for API DTO (Required to ensure date is saved as string, fixing 'N/A' issue)
    // CRITICAL FIX: Format the date as a full ISO timestamp ('YYYY-MM-DD' plus UTC time),
    // which the backend's DateTime field requires.
    const datePart = format(nextDueDate, 'yyyy-MM-dd');
    const finalNextDueDateString = `${datePart}T00:00:00.000Z`; // Guarantees full ISO format is sent

    // 4. Construct the DTO for the API call (used for creation)
    const configForApi = {
        templateId: idToUse,
        title,
        description: description || null,
        isRecurring: finalIsRecurring, // <-- WORKAROUND: Will be true for ADMIN
        frequency: finalFrequency,     // <-- WORKAROUND: Will be ANNUAL for ADMIN
        nextDueDate: finalNextDueDateString, // <-- Uses the guaranteed full ISO format
        serviceCategory: category,
        propertyId: propertyIdToUse,
    };
    
    // This config object is used for the onSave (editing) flow where the parent handles final serialization.
    const configForEdit: MaintenanceTaskConfig = {
        templateId: idToUse,
        title,
        description,
        isRecurring: isRecurring, // Pass actual UI state for editing flow
        frequency: frequency,
        nextDueDate: nextDueDate, // Pass Date object
        serviceCategory: category,
        propertyId: propertyIdToUse,
    };

    setIsSubmitting(true);
    setServerError(null);

    try {
// ============================================================
        // 🟢 ORCHESTRATION MODE (Action Center Integration)
        // ============================================================
        if (orchestrationMode) {
          if (!orchestrationActionKey) {
            setServerError('Missing orchestration context. Please refresh and try again.');
            return;
          }

          // Validation
          if (!title || !propertyIdToUse) {
            setServerError('Missing required fields: title and property');
            return;
          }

          // 🔑 Map category if valid
          const validMaintenanceCategories = [
            'HVAC', 'PLUMBING', 'ELECTRICAL', 'HANDYMAN', 
            'LANDSCAPING', 'CLEANING', 'PEST_CONTROL', 
            'LOCKSMITH', 'ROOFING', 'APPLIANCE_REPAIR'
          ];
          
          const mappedCategory = category && validMaintenanceCategories.includes(category)
            ? (category as any)
            : undefined;

          console.log('🔍 Orchestration Mode - Creating PropertyMaintenanceTask:', {
            propertyId: propertyIdToUse,
            title,
            assetType: (template as any)?.assetType,
            priority: (template as any)?.priority,
            riskLevel: (template as any)?.riskLevel,
            estimatedCost: (template as any)?.estimatedCost,
            serviceCategory: mappedCategory,
            nextDueDate: finalNextDueDateString,
            actionKey: orchestrationActionKey, // 🔑 CRITICAL: Pass the original actionKey
          });

          await api.createMaintenanceTaskFromActionCenter({
            propertyId: propertyIdToUse,
            title,
            description: description || undefined,
            assetType: (template as any)?.assetType || 'UNKNOWN',
            priority: (template as any)?.priority || 'MEDIUM',
            riskLevel: (template as any)?.riskLevel,
            serviceCategory: mappedCategory,
            estimatedCost: (template as any)?.estimatedCost,
            nextDueDate: finalNextDueDateString,
            actionKey: orchestrationActionKey, // 🔑 CRITICAL: Use original actionKey
          });

          onSuccess?.(1);
          onClose();
          return;
        }
        
        if (isEditing && onSave) {
            // EDITING FLOW: Calls parent's onSave 
            onSave(configForEdit);
        } else if (isCreation && onSuccess) {
            // 🔑 FIX: Use correct API endpoint for PropertyMaintenanceTask table
            if (!propertyIdToUse) {
              throw new Error('Property selection required');
            }
            
            // Format data for PropertyMaintenanceTask API
            // 🔑 Map ServiceCategory to MaintenanceTaskServiceCategory
            // Only certain categories are valid for PropertyMaintenanceTask
            const validMaintenanceCategories: MaintenanceTaskServiceCategory[] = [
              'HVAC', 'PLUMBING', 'ELECTRICAL', 'HANDYMAN', 
              'LANDSCAPING', 'CLEANING', 'PEST_CONTROL', 
              'LOCKSMITH', 'ROOFING', 'APPLIANCE_REPAIR'
            ];
            
            const mappedCategory = category && validMaintenanceCategories.includes(category as MaintenanceTaskServiceCategory)
              ? (category as MaintenanceTaskServiceCategory)
              : undefined;
            
            const createTaskData = {
              title: title.trim(),
              description: (description || '').trim(),
              serviceCategory: mappedCategory,
              isRecurring: finalIsRecurring,
              frequency: finalIsRecurring ? finalFrequency : null,
              nextDueDate: datePart, // Use yyyy-MM-dd format
              priority: 'MEDIUM' as MaintenanceTaskPriority,
              estimatedCost: 0,
            };
            
            const response = await api.createMaintenanceTask(propertyIdToUse, createTaskData);
            
            if (response.success && response.data) {
              onSuccess(1); // Created 1 task
              
              // Post-creation routing for Management Config Tasks (FINANCE/ADMIN)
              if (isConfigRedirectTask) {
                  handleRedirection();
                  return; 
              }
            } else {
              throw new Error(response.message || "Failed to create task.");
            }
        }
    } catch (e: any) {
        console.error("Maintenance task submission failed:", e);
        setServerError(e.message || "Failed to save task configuration. Please try again.");
    } finally {
        if (isEditing) { 
            setIsSubmitting(false);
        }
    }
  };


  // 3. Handle Remove Logic (Editing Only)
  const handleRemove = () => {
    const idToRemove = existingConfig?.templateId;
    if (idToRemove && onRemove) {
        onRemove(idToRemove); // Call parent's onRemove handler (triggers deletion mutation)
    }
  };
  

  const isNew = isCreation; 
  const currentProperty = properties.find(p => p.id === (internalPropertyId || propSelectedPropertyId));

  // UI Customization Flags based on current category
  const isCurrentCategoryAdmin = category === 'ADMIN';
  const isCurrentCategoryFinance = category === 'FINANCE';
  
  // Show recurrence checkbox for general tasks and FINANCE, but hide for ADMIN
  const showRecurrenceCheckbox = !isCurrentCategoryAdmin;
  
  // Show frequency field only if recurrence is checked AND it's not an ADMIN task
  const showFrequencyField = isRecurring && !isCurrentCategoryAdmin;
  
  // Show date fields if recurring OR if it's an ADMIN/FINANCE task (always needs a date set)
  const showDateFields = isRecurring || isCurrentCategoryAdmin || isCurrentCategoryFinance;
  
  // Dynamically set date field label (Reminder Date for ADMIN)
  const dateLabel = isCurrentCategoryAdmin ? 'Reminder Date' : 'Next Due Date';
  
  // If it's a direct redirect task, don't render the modal as the redirect is immediate
  if (isDirectRedirectTask) {
      return null;
  }


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[90dvh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-0 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="pr-8 break-words">
                {isNew ? 'Add Task' : 'Edit Task'}: {title}
              </DialogTitle>

              <div className="mt-1 flex items-center gap-2">
                <DialogDescription className="m-0">
                  {isNew ? 'Set the next due date and recurrence.' : 'Update task details and schedule.'}
                </DialogDescription>

                {(() => {
                  const badge = getSourceBadge({
                    isEditing,
                    orchestrationMode,
                    existingConfig,
                    template,
                  });
                  if (!badge) return null;

                  return (
                    <Badge variant={badge.variant} className="whitespace-nowrap">
                      {badge.label}
                    </Badge>
                  );
                })()}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="grid gap-4 sm:gap-6 py-4">

            {/* --- Property Selection Field --- */}
            <div className="grid gap-2">
                <Label className="flex items-center gap-1">
                    <Home className="h-4 w-4" /> Property
                </Label>
                
                {isEditing || orchestrationMode ? (
                    <Input
                        value={currentProperty?.name || currentProperty?.address || 'Property Not Linked'}
                        disabled
                        className="bg-gray-100 text-gray-700 text-base min-h-[44px]"
                    />
                ) : (
                    <Select 
                        value={internalPropertyId || ''} 
                        onValueChange={handlePropertyChange}
                        disabled={properties.length <= 1} 
                    >
                        <SelectTrigger className="w-full text-base min-h-[44px]">
                            <SelectValue placeholder="Select a Property" />
                        </SelectTrigger>
                        <SelectContent>
                            {properties.map((property) => (
                                <SelectItem key={property.id} value={property.id} className="min-h-[44px]">
                                    {property.name || property.address}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                
                <p className="text-sm text-gray-500">
                    {isEditing || orchestrationMode ? 'Property link cannot be changed.' : 'This task will be linked to the selected property.'}
                </p>
            </div>
            {/* --- End Property Selection Field --- */}

          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Task Name</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base min-h-[44px]"
            />
          </div>

          {/* Description */}
          <div className="grid gap-2">
            <Label htmlFor="description">Notes</Label>
            <Textarea
              id="description"
              value={description || ''}
              onChange={(e) => setDescription(e.target.value || null)}
              placeholder="e.g., Filter size is 20x20x1"
              className="text-base min-h-[80px]"
            />
          </div>

          {/* Service Category */}
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            {shouldLockCategory ? ( 
                <Input
                    value={formatEnumString(category)}
                    disabled
                    className={cn("font-medium text-base min-h-[44px]", isConfigRedirectTask ? "bg-blue-50/50 text-blue-700" : "bg-gray-100 text-gray-700")}
                />
            ) : ( 
                <Select
                  value={category || 'NONE'}
                  onValueChange={(val) =>
                    setCategory(val === 'NONE' ? null : (val as ServiceCategory))
                  }
                >
                  <SelectTrigger className="text-base min-h-[44px]">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE" className="min-h-[44px]">None</SelectItem>
                    {categoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat} className="min-h-[44px]">
                        {formatEnumString(cat)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
            )}
            
            {/* Contextual description for FINANCE/ADMIN */}
            {isCurrentCategoryFinance && (
                <p className="text-sm text-gray-500 font-medium mt-1">
                    This task sets a **recurring reminder** for a financial event. After setup, you'll be directed to the Expenses page.
                </p>
            )}
            {isCurrentCategoryAdmin && (
                <p className="text-sm text-gray-500 font-medium mt-1">
                    This task sets a **one-time reminder** to review documents. After setup, you'll be directed to the Documents page.
                </p>
            )}
          </div>

          {/* Maintenance Fields - Customization applied here */}
          
          {/* Is Recurring Checkbox (Visible for Service/FINANCE, Hidden for ADMIN) */}
          {showRecurrenceCheckbox && (
              <div className="flex items-start gap-3 p-3 -mx-3 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <Checkbox
                    id="isRecurring"
                    checked={isRecurring}
                    onCheckedChange={(checked) => setIsRecurring(!!checked)}
                    className="mt-0.5 h-5 w-5"
                  />
                  <Label htmlFor="isRecurring" className="flex-1 cursor-pointer text-sm leading-snug">
                    Make this a recurring task?
                  </Label>
              </div>
          )}

          {/* Frequency & Due Date/Reminder Date Fields */}
          {showDateFields && (
            <>
              {/* Frequency - Visible only if recurring AND NOT ADMIN */}
              {showFrequencyField && (
                  <div className="grid gap-2">
                    <Label htmlFor="frequency">Frequency</Label>
                    <Select
                      value={frequency || ''}
                      onValueChange={(val) =>
                        setFrequency(val as RecurrenceFrequency)
                      }
                    >
                      <SelectTrigger className="text-base min-h-[44px]">
                        <SelectValue placeholder="Select a frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {frequencyOptions.map((freq) => (
                          <SelectItem key={freq} value={freq} className="min-h-[44px]">
                            {formatEnumString(freq)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
              )}

              {/* Next Due Date / Reminder Date */}
              <div className="grid gap-2">
                {/* Use dynamic dateLabel */}
                <Label htmlFor="nextDueDate">{dateLabel}</Label> 
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'w-full justify-start text-left font-normal text-base min-h-[44px]',
                        !nextDueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                      {nextDueDate ? (
                        format(nextDueDate, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" side="bottom" avoidCollisions>
                    <Calendar
                      mode="single"
                      selected={nextDueDate || undefined}
                      onSelect={(date) => setNextDueDate(date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </>
          )}
        </div>
        
        {serverError && (
            <p className="text-sm font-medium text-red-600">
                {serverError}
            </p>
        )}
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-between gap-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6 shrink-0 border-t">
          {/* Remove Button (Editing Only) */}
          {!isNew && (
            <>
              <Button
                variant="outline"
                onClick={handleRemove}
                disabled={isSubmitting}
                className="min-h-[44px] w-full sm:hidden border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Remove Task
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemove}
                disabled={isSubmitting}
                className="min-h-[44px] hidden sm:inline-flex sm:w-auto"
              >
                Remove Task
              </Button>
            </>
          )}
          <div className="flex gap-2 w-full sm:w-auto">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting} className="min-h-[44px] flex-1 sm:flex-initial">
              Cancel
            </Button>
            
            {/* Save Button (used for Service, FINANCE, and ADMIN config) */}
            <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim()} className="min-h-[44px] flex-1 sm:flex-initial">
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Task'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
