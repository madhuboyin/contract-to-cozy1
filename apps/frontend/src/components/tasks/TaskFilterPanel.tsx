// apps/frontend/src/components/tasks/TaskFilterPanel.tsx
'use client';

import { useState } from 'react';
import { Filter, X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MaintenanceTaskFilters } from '@/types';

interface TaskFilterPanelProps {
  filters: MaintenanceTaskFilters;
  onFiltersChange: (filters: MaintenanceTaskFilters) => void;
  onReset: () => void;
  compact?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'URGENT', label: 'Urgent' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const SOURCE_OPTIONS = [
  { value: 'USER_CREATED', label: 'Manual' },
  { value: 'ACTION_CENTER', label: 'Action Center' },
  { value: 'SEASONAL', label: 'Seasonal' },
  { value: 'RISK_ASSESSMENT', label: 'Risk Report' },
  { value: 'WARRANTY_RENEWAL', label: 'Warranty' },
  { value: 'TEMPLATE', label: 'Template' },
];

const SERVICE_CATEGORY_OPTIONS = [
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'HANDYMAN', label: 'Handyman' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'PEST_CONTROL', label: 'Pest Control' },
  { value: 'LOCKSMITH', label: 'Locksmith' },
  { value: 'ROOFING', label: 'Roofing' },
  { value: 'APPLIANCE_REPAIR', label: 'Appliance Repair' },
];

export function TaskFilterPanel({
  filters,
  onFiltersChange,
  onReset,
  compact = false,
}: TaskFilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Count active filters
  const activeFilterCount = [
    filters.status ? (Array.isArray(filters.status) ? filters.status.length : 1) : 0,
    filters.priority ? (Array.isArray(filters.priority) ? filters.priority.length : 1) : 0,
    filters.source ? (Array.isArray(filters.source) ? filters.source.length : 1) : 0,
    filters.serviceCategory ? (Array.isArray(filters.serviceCategory) ? filters.serviceCategory.length : 1) : 0,
    filters.isOverdue ? 1 : 0,
    filters.isDueSoon ? 1 : 0,
    filters.isRecurring !== undefined ? 1 : 0,
    filters.hasBooking !== undefined ? 1 : 0,
    filters.search ? 1 : 0,
  ].reduce((sum, count) => sum + count, 0);

  // Handle multi-select checkbox
  const handleCheckboxChange = (
    field: keyof MaintenanceTaskFilters,
    value: string,
    checked: boolean
  ) => {
    const currentValues = filters[field];
    let newValues: string[];

    if (Array.isArray(currentValues)) {
      newValues = checked
        ? [...currentValues, value]
        : currentValues.filter((v) => v !== value);
    } else {
      newValues = checked ? [value] : [];
    }

    onFiltersChange({
      ...filters,
      [field]: newValues.length > 0 ? newValues : undefined,
    });
  };

  // Handle search
  const handleSearchChange = (value: string) => {
    onFiltersChange({
      ...filters,
      search: value || undefined,
    });
  };

  // Handle boolean filters
  const handleBooleanChange = (field: keyof MaintenanceTaskFilters, checked: boolean) => {
    onFiltersChange({
      ...filters,
      [field]: checked ? true : undefined,
    });
  };

  const content = (
    <div className="space-y-4">
      {/* Search */}
      <div className="space-y-2">
        <Label htmlFor="search">Search</Label>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            id="search"
            placeholder="Search tasks..."
            value={filters.search || ''}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Status Filter */}
      <div className="space-y-2">
        <Label>Status</Label>
        <div className="space-y-2">
          {STATUS_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`status-${option.value}`}
                checked={
                  Array.isArray(filters.status)
                    ? filters.status.includes(option.value as any)
                    : filters.status === option.value
                }
                onCheckedChange={(checked) =>
                  handleCheckboxChange('status', option.value, checked as boolean)
                }
              />
              <label
                htmlFor={`status-${option.value}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Filter */}
      <div className="space-y-2">
        <Label>Priority</Label>
        <div className="space-y-2">
          {PRIORITY_OPTIONS.map((option) => (
            <div key={option.value} className="flex items-center space-x-2">
              <Checkbox
                id={`priority-${option.value}`}
                checked={
                  Array.isArray(filters.priority)
                    ? filters.priority.includes(option.value as any)
                    : filters.priority === option.value
                }
                onCheckedChange={(checked) =>
                  handleCheckboxChange('priority', option.value, checked as boolean)
                }
              />
              <label
                htmlFor={`priority-${option.value}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {option.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Filters */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            <span>Advanced Filters</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
          {/* Source Filter */}
          <div className="space-y-2">
            <Label>Source</Label>
            <div className="space-y-2">
              {SOURCE_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`source-${option.value}`}
                    checked={
                      Array.isArray(filters.source)
                        ? filters.source.includes(option.value as any)
                        : filters.source === option.value
                    }
                    onCheckedChange={(checked) =>
                      handleCheckboxChange('source', option.value, checked as boolean)
                    }
                  />
                  <label
                    htmlFor={`source-${option.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Service Category Filter */}
          <div className="space-y-2">
            <Label>Service Category</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {SERVICE_CATEGORY_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`category-${option.value}`}
                    checked={
                      Array.isArray(filters.serviceCategory)
                        ? filters.serviceCategory.includes(option.value as any)
                        : filters.serviceCategory === option.value
                    }
                    onCheckedChange={(checked) =>
                      handleCheckboxChange('serviceCategory', option.value, checked as boolean)
                    }
                  />
                  <label
                    htmlFor={`category-${option.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Boolean Filters */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="overdue"
                checked={filters.isOverdue || false}
                onCheckedChange={(checked) =>
                  handleBooleanChange('isOverdue', checked as boolean)
                }
              />
              <label
                htmlFor="overdue"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Overdue Only
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="due-soon"
                checked={filters.isDueSoon || false}
                onCheckedChange={(checked) =>
                  handleBooleanChange('isDueSoon', checked as boolean)
                }
              />
              <label
                htmlFor="due-soon"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Due Within 7 Days
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="recurring"
                checked={filters.isRecurring || false}
                onCheckedChange={(checked) =>
                  handleBooleanChange('isRecurring', checked as boolean)
                }
              />
              <label
                htmlFor="recurring"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Recurring Tasks Only
              </label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="has-booking"
                checked={filters.hasBooking || false}
                onCheckedChange={(checked) =>
                  handleBooleanChange('hasBooking', checked as boolean)
                }
              />
              <label
                htmlFor="has-booking"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Has Linked Booking
              </label>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Reset Button */}
      {activeFilterCount > 0 && (
        <Button variant="outline" className="w-full" onClick={onReset}>
          <X className="h-4 w-4 mr-2" />
          Clear All Filters ({activeFilterCount})
        </Button>
      )}
    </div>
  );

  if (compact) {
    return (
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between mb-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="ml-2" variant="secondary">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <Card>
            <CardContent className="pt-6">{content}</CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Filter className="h-5 w-5 mr-2" />
            Filters
          </span>
          {activeFilterCount > 0 && (
            <Badge variant="secondary">{activeFilterCount} active</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}