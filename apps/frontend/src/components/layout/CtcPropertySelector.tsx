// apps/frontend/src/components/layout/CtcPropertySelector.tsx
'use client';

import React from 'react';
import { Home, ChevronDown, Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Property } from '@/types';
import type { HouseholdRole } from '@/types';

const ROLE_BADGE: Record<HouseholdRole, { label: string; className: string }> = {
  OWNER: { label: 'Owner', className: 'bg-amber-100 text-amber-700' },
  CONTRIBUTOR: { label: 'Contributor', className: 'bg-blue-100 text-blue-700' },
  VIEWER: { label: 'Viewer', className: 'bg-gray-100 text-gray-600' },
};

interface CtcPropertySelectorProps {
  propertyAddress?: string;
  properties?: Property[];
  selectedPropertyId?: string;
  onPropertySelect?: (propertyId: string) => void;
  onAddProperty?: () => void;
  className?: string;
}

export function CtcPropertySelector({
  propertyAddress = 'Main Home',
  properties = [],
  selectedPropertyId,
  onPropertySelect,
  onAddProperty,
  className,
}: CtcPropertySelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-2.5 h-12 px-4 rounded-lg",
            "border border-slate-200 bg-slate-50/50 hover:bg-slate-50",
            "transition-all duration-200",
            "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400",
            className
          )}
        >
          <Home className="h-4 w-4 text-slate-600 shrink-0" />
          <span className="text-sm font-medium text-slate-700 truncate max-w-[140px]">
            {propertyAddress}
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-[260px]">
        {properties.map((property) => {
          const isSelected = property.id === selectedPropertyId;
          const displayAddress = property.address || property.name || 'Unnamed Property';
          const role = property.householdRole;
          const badge = role && role !== 'OWNER' ? ROLE_BADGE[role] : null;

          return (
            <DropdownMenuItem
              key={property.id}
              onClick={() => onPropertySelect?.(property.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Check
                className={cn(
                  "h-4 w-4 shrink-0",
                  isSelected ? "text-teal-600" : "text-transparent"
                )}
              />
              <span className="flex-1 truncate text-sm">
                {displayAddress}
              </span>
              {badge && (
                <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0', badge.className)}>
                  {badge.label}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}

        {properties.length > 0 && <DropdownMenuSeparator />}

        <DropdownMenuItem
          onClick={onAddProperty}
          className="flex items-center gap-2 cursor-pointer text-teal-600"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">Add New Property</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
