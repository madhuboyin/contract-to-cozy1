// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal.tsx
// --- UNIFIED MODAL FOR BOTH CREATION AND EDITING ---
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MaintenanceTaskConfig,
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
  Property, // Import Property type
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
  existingConfig?: (MaintenanceTaskConfig & { propertyId: string | null }) | null; // Existing task data
  onSave?: (config: MaintenanceTaskConfig) => void; // Callback for saving edits
  onRemove?: (taskId: string) => void; // Callback for removing task
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
    const finalIsRecurring = isTemplateAdmin ? false : isRecurring;
    const finalFrequency = finalIsRecurring ? frequency : null;

    // 2. Validation based on final state
    if (finalIsRecurring && !finalFrequency) {
        setServerError("Please select a recurrence frequency.");
        return;
    }
    if (!nextDueDate) {
        // Use isCurrentCategoryAdmin for the error message display, but rely on nextDueDate state
        const dateFieldError = isCurrentCategoryAdmin ? "Please select a reminder date." : "Please select the next due date.";
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
        isRecurring: finalIsRecurring, 
        frequency: finalFrequency,     
        nextDueDate: finalNextDueDateString, // <-- Uses the guaranteed full ISO format
        serviceCategory: category,
        propertyId: propertyIdToUse,
    };
    
    // This config object is used for the onSave (editing) flow where the parent handles final serialization.
    const configForEdit: MaintenanceTaskConfig = {
        templateId: idToUse,
        title,
        description,
        isRecurring: isRecurring,
        frequency: frequency,
        nextDueDate: nextDueDate, // Pass Date object
        serviceCategory: category,
        propertyId: propertyIdToUse,
    };

    setIsSubmitting(true);
    setServerError(null);

    try {
        if (isEditing && onSave) {
            // EDITING FLOW: Calls parent's onSave 
            onSave(configForEdit);
        } else if (isCreation && onSuccess) {
            // CREATION FLOW: Handles API call internally, passing the explicitly formatted DTO
            const response = await api.createCustomMaintenanceItems({ tasks: [configForApi as any] }); 
            if (response.success && response.data?.count) {
              onSuccess(response.data.count);
              
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'Add Task' : 'Edit Task'}: {title}
          </DialogTitle>
          <DialogDescription>
            {isNew ? 'Set the next due date and recurrence.' : 'Update task details and schedule.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">

            {/* --- Property Selection Field --- */}
            <div className="grid gap-2">
                <Label className="flex items-center gap-1">
                    <Home className="h-4 w-4" /> Property
                </Label>
                
                {isEditing ? (
                    <Input
                        value={currentProperty?.name || currentProperty?.address || 'Property Not Linked'}
                        disabled
                        className="bg-gray-100 text-gray-700"
                    />
                ) : (
                    <Select 
                        value={internalPropertyId || ''} 
                        onValueChange={handlePropertyChange}
                        disabled={properties.length <= 1} 
                    >
                        <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select a Property" />
                        </SelectTrigger>
                        <SelectContent>
                            {properties.map((property) => (
                                <SelectItem key={property.id} value={property.id}>
                                    {property.name || property.address}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                )}
                
                <p className="text-sm text-gray-500">
                    {isEditing ? 'Property link cannot be changed.' : 'This task will be linked to the selected property.'}
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
            />
          </div>

          {/* Service Category */}
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            {shouldLockCategory ? ( 
                <Input
                    value={formatEnumString(category)}
                    disabled
                    // Highlight categories that result in an immediate post-save action
                    className={cn("font-medium", isConfigRedirectTask ? "bg-blue-50/50 text-blue-700" : "bg-gray-100 text-gray-700")}
                />
            ) : ( 
                <Select
                  value={category || 'NONE'}
                  onValueChange={(val) =>
                    setCategory(val === 'NONE' ? null : (val as ServiceCategory))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">None</SelectItem>
                    {categoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat}>
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
              <div className="flex items-center space-x-2">
                  <Checkbox
                    id="isRecurring"
                    checked={isRecurring}
                    onCheckedChange={(checked) => setIsRecurring(!!checked)}
                  />
                  <Label htmlFor="isRecurring">Make this a recurring task?</Label>
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
                      <SelectTrigger>
                        <SelectValue placeholder="Select a frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        {frequencyOptions.map((freq) => (
                          <SelectItem key={freq} value={freq}>
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
                        'w-full justify-start text-left font-normal',
                        !nextDueDate && 'text-muted-foreground'
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {nextDueDate ? (
                        format(nextDueDate, 'PPP')
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
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

        <DialogFooter className="sm:justify-between">
          {/* Remove Button (Editing Only) */}
          {!isNew && (
            <Button variant="destructive" onClick={handleRemove} disabled={isSubmitting}>
              Remove Task
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            
            {/* Save Button (used for Service, FINANCE, and ADMIN config) */}
            <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Task'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}