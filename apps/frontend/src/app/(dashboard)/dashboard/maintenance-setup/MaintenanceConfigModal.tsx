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

// Step 2.1: Define RENEWAL_CATEGORIES
const RENEWAL_CATEGORIES: ServiceCategory[] = [
  'INSURANCE',
  'WARRANTY',
  'FINANCE',
  'ADMIN',
  'ATTORNEY',
];

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
  
  // Determine if it's a renewal task (Step 2.1, 2.3)
  const isRenewalTask = useMemo(() => {
    return !!initialConfig?.serviceCategory && RENEWAL_CATEGORIES.includes(initialConfig.serviceCategory as ServiceCategory);
  }, [initialConfig?.serviceCategory]);

  // Determine if the category field should be locked (it should be for all template/existing items)
  const shouldLockCategory = isEditing || isCreation;
  
  // Map category to a friendly path for redirection (Step 2.4)
  const renewalPath = useMemo(() => {
    switch(initialConfig?.serviceCategory) {
      case 'INSURANCE':
        // Updated path for deep linking to modal + return address
        return '/dashboard/insurance?action=new&from=maintenance-setup'; 
      case 'WARRANTY':
        // Updated path for deep linking to modal + return address
        return '/dashboard/warranties?action=new&from=maintenance-setup';
      default:
        return '/dashboard/profile';
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


  // Step 2.4: Handle Redirection (Made stable with useCallback)
  const handleRenewalRedirection = useCallback(() => {
    if (renewalPath) {
        router.push(renewalPath);
        onClose(); // Close the modal after triggering navigation
    }
  }, [renewalPath, router, onClose]);


  // 1. Populate state when modal opens/config changes
  useEffect(() => {
    if (initialConfig) {
      setTitle(initialConfig.title);
      setDescription(initialConfig.description || null);
      setCategory((initialConfig.serviceCategory as ServiceCategory) || null);
      
      setServerError(null);

      // --- Mode-specific initialization for recurrence and dates ---
      if (isEditing) {
        // Use properties from the existing configuration (ChecklistItem data)
        const config = existingConfig!; // Guaranteed to be MaintenanceTaskConfig type
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
                // Assumes ISO string format from API (ChecklistItem/Editing flow)
                initialDate = parseISO(config.nextDueDate as string);
            }
        }
        setNextDueDate(initialDate);

      } else if (isCreation) {
        // Use properties from the template (Creation flow)
        const temp = template!; // Guaranteed to be MaintenanceTaskTemplate type
        setInternalPropertyId(propSelectedPropertyId || null);
        
        // Defaults for a new template
        setIsRecurring(true);
        setFrequency(temp.defaultFrequency as RecurrenceFrequency);
        setNextDueDate(new Date()); // Default to today
      }
      // --- END FIX ---
    }
    
    // NEW FIX: Immediately redirect if it's a renewal task when the modal is opened
    if (isOpen && isRenewalTask && renewalPath) {
        handleRenewalRedirection();
    }
  }, [
    template, 
    existingConfig, 
    isEditing, 
    isCreation, 
    propSelectedPropertyId, 
    isOpen, 
    isRenewalTask, 
    renewalPath, 
    handleRenewalRedirection
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
    if (isRecurring && !frequency) {
        setServerError("Please select a recurrence frequency.");
        return;
    }
    if (!nextDueDate) {
        setServerError("Please select the next due date.");
        return;
    }
    if (!onSave && !onSuccess) { // Safety check
        setServerError("Modal configuration error: Missing save/success handler.");
        return;
    }

    setIsSubmitting(true);
    setServerError(null);

    const config: MaintenanceTaskConfig = {
      templateId: idToUse, // Used as item ID in editing, or template ID in creation
      title,
      description,
      isRecurring,
      frequency: isRecurring ? frequency : null,
      nextDueDate: nextDueDate,
      serviceCategory: category,
      propertyId: propertyIdToUse, // CRITICAL: Ensure property ID is included
    };

    try {
        if (isEditing && onSave) {
            // EDITING FLOW: Calls parent's onSave (triggers mutation in maintenance/page.tsx)
            onSave(config);
        } else if (isCreation && onSuccess) {
            // CREATION FLOW: Handles API call internally 
            const response = await api.createCustomMaintenanceItems({ tasks: [config] });
            if (response.success && response.data?.count) {
              onSuccess(response.data.count);
            } else {
              throw new Error(response.message || "Failed to create task.");
            }
        }
        // If creation/editing was successful, the parent (onSuccess/onSave) is responsible for calling onClose/clearing state.
    } catch (e: any) {
        console.error("Maintenance task submission failed:", e);
        setServerError(e.message || "Failed to save task configuration. Please try again.");
    } finally {
        // Only clear submitting state here if we are NOT in the creation flow managed by onSuccess
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
                    // FIX: Editing Mode - Show static, disabled text (Input field)
                    <Input
                        value={currentProperty?.name || currentProperty?.address || 'Property Not Linked'}
                        disabled
                        className="bg-gray-100 text-gray-700"
                    />
                ) : (
                    // Creation Mode - Show dropdown
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
            {shouldLockCategory ? ( // LOCK THE CATEGORY FIELD for all template/existing items
                <Input
                    value={formatEnumString(category)}
                    disabled
                    // Use cn to apply different disabled styling based on renewal status
                    className={cn("font-medium", isRenewalTask ? "bg-red-50/50 text-red-700" : "bg-gray-100 text-gray-700")}
                />
            ) : ( // Show editable dropdown only if it's a completely new, custom task not from a template
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
            
            {/* Renewal Callout (Step 2.3) */}
            {isRenewalTask && (
                <p className="text-sm text-red-500 font-medium mt-1">
                    This is a Renewal/Financial task. You must manage its due date and details directly on the associated management page.
                </p>
            )}
          </div>

          {/* Maintenance Fields - Conditional Render (Step 2.3) */}
          {!isRenewalTask && (
            <>
                {/* Is Recurring */}
                <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isRecurring"
                      checked={isRecurring}
                      onCheckedChange={(checked) => setIsRecurring(!!checked)}
                    />
                    <Label htmlFor="isRecurring">Make this a recurring task?</Label>
                </div>

                {/* Frequency & Due Date (Conditional) */}
                {isRecurring && (
                    <>
                      {/* Frequency */}
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

                      {/* Next Due Date */}
                      <div className="grid gap-2">
                        <Label htmlFor="nextDueDate">Next Due Date</Label>
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
            
            {/* Save/Redirection Button (Step 2.4) */}
            {isRenewalTask && renewalPath ? (
                <Button onClick={handleRenewalRedirection} variant="default">
                    Go to {formatEnumString(category)} Management
                </Button>
            ) : (
                <Button onClick={handleSubmit} disabled={isSubmitting || !title.trim()}>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Task'}
                </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}