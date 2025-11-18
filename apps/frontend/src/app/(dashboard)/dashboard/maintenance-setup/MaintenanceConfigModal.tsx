// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal.tsx
// --- FIXED FILE ---
'use client';

import React, { useState, useEffect } from 'react';
import {
  MaintenanceTaskConfig,
  MaintenanceTaskTemplate,
  RecurrenceFrequency,
  ServiceCategory,
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
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  template: MaintenanceTaskTemplate | null;
  existingConfig: MaintenanceTaskConfig | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: MaintenanceTaskConfig) => void;
  onRemove: (templateId: string) => void;
}

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
  'INSURANCE',
  'ATTORNEY',
  'FINANCE',
  'WARRANTY',
  'ADMIN',
];

// Helper to format the enum strings for display (e.g., "SEMI_ANNUALLY" -> "Semi_annually")
function formatEnumString(val: string) {
  if (!val) return '';
  return val.charAt(0) + val.slice(1).toLowerCase().replace(/_/g, ' ');
}

export function MaintenanceConfigModal({
  template,
  existingConfig,
  isOpen,
  onClose,
  onSave,
  onRemove,
}: Props) {
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency | null>(null);
  const [nextDueDate, setNextDueDate] = useState<Date | null>(null);
  const [category, setCategory] = useState<ServiceCategory | null>(null);

  // Populate state when template or config changes
  useEffect(() => {
    const config = existingConfig || template; // Use existing config if it exists
    if (config) {
      setTitle(config.title);
      setDescription(config.description || null);
      // Cast the string from the API to the ServiceCategory enum
      setCategory((config.serviceCategory as ServiceCategory) || null);

      // Handle recurrence fields
      if (existingConfig) {
        setIsRecurring(existingConfig.isRecurring);
        setFrequency(existingConfig.frequency);
        setNextDueDate(existingConfig.nextDueDate);
      } else if (template) {
        // Defaults for a new template
        setIsRecurring(true); // Default to recurring
        // Cast the string from the API to the RecurrenceFrequency enum
        setFrequency(template.defaultFrequency as RecurrenceFrequency);
        // Default next due date
        setNextDueDate(new Date());
      }
    }
  }, [template, existingConfig, isOpen]);

  const handleSave = () => {
    if (!template) return;

    onSave({
      templateId: template.id,
      title,
      description,
      isRecurring,
      frequency: isRecurring ? frequency : null,
      nextDueDate: isRecurring ? nextDueDate : null,
      serviceCategory: category,
    });
  };

  const handleRemove = () => {
    if (!template) return;
    onRemove(template.id);
  };

  const isNew = !existingConfig;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {isNew ? 'Add Task' : 'Edit Task'}: {template?.title}
          </DialogTitle>
          <DialogDescription>
            Customize the details for this maintenance task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* --- FIX: Changed to 1-column grid --- */}
          {/* Title */}
          <div className="grid gap-2">
            <Label htmlFor="title">Task Name</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* --- FIX: Changed to 1-column grid --- */}
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

          {/* --- FIX: Changed to 1-column grid --- */}
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

          {/* --- FIX: Removed col-start-2 and col-span-3 --- */}
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
              {/* --- FIX: Changed to 1-column grid --- */}
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

              {/* --- FIX: Changed to 1-column grid --- */}
              {/* Next Due Date */}
              <div className="grid gap-2">
                <Label htmlFor="nextDueDate">Next Due Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'outline'}
                      className={cn(
                        // --- FIX: Removed col-span-3, added w-full ---
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
        <DialogFooter className="sm:justify-between">
          {!isNew ? (
            <Button variant="destructive" onClick={handleRemove}>
              Remove Task
            </Button>
          ) : (
            <div /> // Placeholder
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save Task</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}