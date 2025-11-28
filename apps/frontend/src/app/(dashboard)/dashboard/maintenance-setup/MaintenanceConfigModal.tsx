// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal.tsx
// --- FIXED FILE ---
'use client';

import React, { useState, useEffect } from 'react';
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
import { CalendarIcon, Home, Loader2 } from 'lucide-react'; // Added Home and Loader2
import { format } from 'date-fns';
import { api } from '@/lib/api/client'; // Import API client

// Manually define options instead of using Object.values
const frequencyOptions: RecurrenceFrequency[] = [
  RecurrenceFrequency.MONTHLY,
  RecurrenceFrequency.QUARTERLY,
  RecurrenceFrequency.SEMI_ANNUALLY,
  RecurrenceFrequency.ANNUALLY,
];

// This array now EXACTLY matches your index.ts file
const categoryOptions: ServiceCategory[] = [
  'INSPECTION',
  'HANDYMAN',
  'PLUMBING',
  'ELECTRICAL',
  'HVAC',
  'LANDSCAPING',
  'CLEANING',
  'MOVING',
  'PEST_CONTROL',
  'LOCKSMITH',
];

// Helper to format the enum strings for display
function formatEnumString(val: string) {
  if (!val) return '';
  return val.charAt(0) + val.slice(1).toLowerCase().replace(/_/g, ' ');
}

// === FIX: Updated Props Interface to match page.tsx requirements ===
interface MaintenanceConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: MaintenanceTaskTemplate | null;
  
  // NEW PROPS
  onSuccess: (count: number) => void;
  properties: Property[];
  selectedPropertyId: string | undefined; // Now accepts undefined
  onPropertyChange: (id: string) => void;
  
  // NOTE: Old props (existingConfig, onSave, onRemove) removed as they are obsolete in this flow
}

export function MaintenanceConfigModal({
  template,
  isOpen,
  onClose,
  onSuccess,
  properties,
  selectedPropertyId,
  onPropertyChange,
}: MaintenanceConfigModalProps) {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(null);
  const [nextDueDate, setNextDueDate] = useState<Date | null>(null);
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false); // NEW STATE FOR SUBMISSION
  const [serverError, setServerError] = useState<string | null>(null); // NEW STATE FOR ERRORS

  // Populate state when template changes
  useEffect(() => {
    if (template) {
      setTitle(template.title);
      setDescription(template.description || null);
      setCategory((template.serviceCategory as ServiceCategory) || null);

      // Defaults for a new template
      setIsRecurring(true); // Default to recurring
      setFrequency(template.defaultFrequency as RecurrenceFrequency);
      setNextDueDate(new Date()); // Default to today
    }
  }, [template, isOpen]);

  const handleSubmit = async () => {
    if (!template || !selectedPropertyId) {
        setServerError("Please ensure a property is selected and a template is configured.");
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

    setIsSubmitting(true);
    setServerError(null);

    // 1. Construct MaintenanceTaskConfig DTO
    const taskConfig: MaintenanceTaskConfig = {
      templateId: template.id,
      title,
      description,
      isRecurring,
      frequency: isRecurring ? frequency : null,
      nextDueDate: nextDueDate, // Date object is fine, API handles conversion
      serviceCategory: category,
      propertyId: selectedPropertyId, // CRITICAL: Use the prop
    };

    try {
        const response = await api.createCustomMaintenanceItems({ tasks: [taskConfig] });
        
        if (response.success && response.data?.count) {
          onSuccess(response.data.count); // Call success handler from parent
        } else {
          throw new Error(response.message || "Failed to create maintenance task.");
        }
    } catch (e: any) {
        console.error("Maintenance task submission failed:", e);
        setServerError(e.message || "Failed to save task configuration. Please try again.");
    } finally {
        setIsSubmitting(false);
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            Configure Task: {template?.title}
          </DialogTitle>
          <DialogDescription>
            Customize the details for this maintenance task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">

            {/* --- NEW: Property Selection Field --- */}
            <div className="grid gap-2">
                <Label className="flex items-center gap-1">
                    <Home className="h-4 w-4" /> Property
                </Label>
                <Select 
                    value={selectedPropertyId} 
                    onValueChange={onPropertyChange}
                    disabled={properties.length <= 1} // Disable if only one property exists
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
                <p className="text-sm text-gray-500">
                    This task will be linked to the selected property.
                </p>
            </div>
            {/* --- END NEW: Property Selection Field --- */}

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
          </div>

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
        </div>
        
        {serverError && (
            <p className="text-sm font-medium text-red-600">
                {serverError}
            </p>
        )}

        <DialogFooter className="sm:justify-end">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            {/* Call new handleSubmit function */}
            <Button onClick={handleSubmit} disabled={isSubmitting || !selectedPropertyId}> 
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Save Task'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}