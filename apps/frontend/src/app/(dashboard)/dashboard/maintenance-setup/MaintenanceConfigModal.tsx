// apps/frontend/src/app/(dashboard)/dashboard/maintenance-setup/MaintenanceConfigModal.tsx
// --- CORRECTED FILE ---
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
  'CARPENTRY',   // <-- Corrected
  'PAINTING',    // <-- Corrected
  'ROOFING',     // <-- Corrected
  'LANDSCAPING',
  'CLEANING',
  'OTHER',       // <-- Corrected
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
          {/* --- FIX was here --- */}
          <DialogDescription>
            Customize the details for this maintenance task.
          </DialogDescription>
          {/* --- End Fix --- */}
        </DialogHeader>
        <div className="grid gap-6 py-4">
          {/* Title */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="title" className="text-right">
              Task Name
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-3"
            />
          </div>

          {/* Description */}
          <div className="grid grid-cols-4 items-start gap-4">
            <Label htmlFor="description" className="text-right pt-2">
              Notes
            </Label>
            <Textarea
              id="description"
              value={description || ''}
              onChange={(e) => setDescription(e.target.value || null)}
              className="col-span-3"
              placeholder="e.g., Filter size is 20x20x1"
            />
          </div>

          {/* Service Category */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="category" className="text-right">
              Category
            </Label>
            <Select
              value={category || 'NONE'}
              onValueChange={(val) =>
                setCategory(val === 'NONE' ? null : (val as ServiceCategory))
              }
            >
              <SelectTrigger className="col-span-3">
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
          <div className="flex items-center space-x-2 col-start-2 col-span-3">
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="frequency" className="text-right">
                  Frequency
                </Label>
                <Select
                  value={frequency || ''}
                  onValueChange={(val) =>
                    setFrequency(val as RecurrenceFrequency)
                  }
                >
                  <SelectTrigger className="col-span-3">
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="nextDueDate" className="text-right">
                  Next Due Date
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant={'outline'}
                      className={cn(
                        'col-span-3 justify-start text-left font-normal',
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