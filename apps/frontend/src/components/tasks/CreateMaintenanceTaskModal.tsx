// apps/frontend/src/components/tasks/CreateMaintenanceTaskModal.tsx
// PHASE 4.5: TASK MANAGEMENT MODALS
'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Loader2, DollarSign, Calendar, Repeat } from 'lucide-react';
import { api } from '@/lib/api/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import {
  MaintenanceTaskPriority,
  MaintenanceTaskServiceCategory,
  MaintenanceTaskFrequency,
  CreateMaintenanceTaskInput,
} from '@/types';

interface CreateMaintenanceTaskModalProps {
  propertyId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const PRIORITY_OPTIONS: MaintenanceTaskPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

const SERVICE_CATEGORY_OPTIONS: MaintenanceTaskServiceCategory[] = [
  'HVAC',
  'PLUMBING',
  'ELECTRICAL',
  'HANDYMAN',
  'LANDSCAPING',
  'CLEANING',
  'PEST_CONTROL',
  'LOCKSMITH',
  'ROOFING',
  'APPLIANCE_REPAIR',
];

const FREQUENCY_OPTIONS: MaintenanceTaskFrequency[] = [
  'MONTHLY',
  'QUARTERLY',
  'SEMI_ANNUALLY',
  'ANNUALLY',
];

export function CreateMaintenanceTaskModal({
  propertyId,
  isOpen,
  onClose,
  onSuccess,
}: CreateMaintenanceTaskModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Form state
  const [formData, setFormData] = useState<CreateMaintenanceTaskInput>({
    title: '',
    description: '',
    priority: 'MEDIUM',
    estimatedCost: undefined,
    serviceCategory: undefined,
    isRecurring: false,
    frequency: undefined,
    nextDueDate: undefined,
  });

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: CreateMaintenanceTaskInput) => {
      return await api.createMaintenanceTask(propertyId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['maintenance-stats'] });

      toast({
        title: 'Task Created',
        description: 'Maintenance task has been created successfully',
      });

      onSuccess?.();
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Create Task',
        description: error.message || 'Please try again',
        variant: 'destructive',
      });
    },
  });

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'MEDIUM',
      estimatedCost: undefined,
      serviceCategory: undefined,
      isRecurring: false,
      frequency: undefined,
      nextDueDate: undefined,
    });
    setErrors({});
    onClose();
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.isRecurring && !formData.frequency) {
      newErrors.frequency = 'Frequency is required for recurring tasks';
    }

    if (formData.estimatedCost && formData.estimatedCost < 0) {
      newErrors.estimatedCost = 'Cost must be a positive number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Clean up data before submission
    const cleanedData: CreateMaintenanceTaskInput = {
      ...formData,
      description: formData.description?.trim() || undefined,
      estimatedCost: formData.estimatedCost || undefined,
      serviceCategory: formData.serviceCategory || undefined,
      frequency: formData.isRecurring ? formData.frequency : undefined,
      nextDueDate: formData.nextDueDate || undefined,
    };

    createMutation.mutate(cleanedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Maintenance Task</DialogTitle>
          <DialogDescription>
            Add a new maintenance task to your property schedule
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">
              Task Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g., HVAC filter replacement"
              className={errors.title ? 'border-red-500' : ''}
            />
            {errors.title && (
              <p className="text-sm text-red-500">{errors.title}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Add any additional details..."
              rows={3}
            />
          </div>

          {/* Priority & Service Category Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value as MaintenanceTaskPriority })
                }
              >
                <SelectTrigger id="priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {priority}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceCategory">Service Category</Label>
              <Select
                value={formData.serviceCategory || 'none'}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    serviceCategory:
                      value === 'none' ? undefined : (value as MaintenanceTaskServiceCategory),
                  })
                }
              >
                <SelectTrigger id="serviceCategory">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {SERVICE_CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Estimated Cost & Next Due Date Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="estimatedCost">Estimated Cost</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="estimatedCost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.estimatedCost || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      estimatedCost: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                  placeholder="0.00"
                  className={`pl-8 ${errors.estimatedCost ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.estimatedCost && (
                <p className="text-sm text-red-500">{errors.estimatedCost}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="nextDueDate">Next Due Date</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                <Input
                  id="nextDueDate"
                  type="date"
                  value={formData.nextDueDate || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, nextDueDate: e.target.value || undefined })
                  }
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          {/* Recurring Task Toggle */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="isRecurring">Recurring Task</Label>
                <p className="text-sm text-gray-600">
                  This task repeats on a regular schedule
                </p>
              </div>
              <Switch
                id="isRecurring"
                checked={formData.isRecurring}
                onCheckedChange={(checked: boolean) =>
                  setFormData({ ...formData, isRecurring: checked, frequency: checked ? 'ANNUALLY' : undefined })
                }
              />
            </div>

            {/* Frequency (only if recurring) */}
            {formData.isRecurring && (
              <div className="space-y-2 pl-4 border-l-2">
                <Label htmlFor="frequency">
                  Frequency <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={formData.frequency || ''}
                  onValueChange={(value) =>
                    setFormData({ ...formData, frequency: value as MaintenanceTaskFrequency })
                  }
                >
                  <SelectTrigger id="frequency" className={errors.frequency ? 'border-red-500' : ''}>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        <div className="flex items-center gap-2">
                          <Repeat className="h-4 w-4" />
                          {freq.replace('_', ' ')}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.frequency && (
                  <p className="text-sm text-red-500">{errors.frequency}</p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}