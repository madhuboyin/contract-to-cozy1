'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Building, Check, ChevronRight, Home, Plus } from 'lucide-react';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { Property } from '@/types';

interface PropertySwitcherSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PropertySwitcherSheet({ open, onOpenChange }: PropertySwitcherSheetProps) {
  const router = useRouter();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();

  const { data, isLoading } = useQuery({
    queryKey: ['properties-switcher'],
    queryFn: async () => {
      const res = await api.getProperties();
      return res.success ? res.data.properties : ([] as Property[]);
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const properties = data ?? [];

  const handleSelect = (property: Property) => {
    setSelectedPropertyId(property.id);
    onOpenChange(false);
    router.push(`/dashboard/properties/${property.id}`);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[72vh] flex flex-col rounded-t-2xl p-0 overflow-hidden"
      >
        <div className="mx-auto w-12 h-1.5 bg-slate-200 rounded-full mt-3 mb-1 shrink-0" />

        <SheetHeader className="px-5 pb-3 border-b border-slate-100 shrink-0">
          <SheetTitle className="text-left text-base font-semibold">Switch Property</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-slate-400">Loading properties…</div>
          ) : properties.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No properties found.</div>
          ) : (
            properties.map((property) => {
              const isSelected = property.id === selectedPropertyId;
              const location = [property.city, property.state].filter(Boolean).join(', ');
              return (
                <button
                  key={property.id}
                  type="button"
                  onClick={() => handleSelect(property)}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-brand-200 bg-brand-50'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      isSelected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {property.isPrimary ? <Home className="h-4 w-4" /> : <Building className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'truncate text-sm font-semibold',
                        isSelected ? 'text-brand-900' : 'text-slate-900'
                      )}
                    >
                      {property.name || property.address}
                    </p>
                    {location && (
                      <p className="truncate text-xs text-slate-500">{location}</p>
                    )}
                  </div>

                  {isSelected ? (
                    <Check className="h-4 w-4 shrink-0 text-brand-600" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="px-4 pb-5 pt-3 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              router.push('/dashboard/properties/new');
            }}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-3 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add new property
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
