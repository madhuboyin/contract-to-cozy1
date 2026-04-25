// apps/frontend/src/app/(dashboard)/dashboard/components/WelcomeSection.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { Property } from '@/types';

interface WelcomeSectionProps {
  userName: string;
  properties: Property[];
  selectedPropertyId: string | undefined;
  onPropertyChange: (propertyId: string) => void;
  compact?: boolean;
}

function formatPropertyDisplay(property: Property): string {
  const name = property.name?.trim() || property.address || 'Unnamed property';
  const contextType = getPropertyContextType(property);
  const structuralType = humanizeEnum(property.propertyType);
  const dedupedContextType = contextType.toLowerCase() === name.toLowerCase() ? null : contextType;
  return [name, dedupedContextType, structuralType].filter(Boolean).join(' • ');
}

function humanizeEnum(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getPropertyContextType(property: Property | null): string {
  if (!property) return 'Property';
  if (property.isPrimary) return 'Main Home';
  if (property.ownershipType === 'RENTED_OUT') return 'Rental';
  if (property.ownershipType === 'OWNER_OCCUPIED') return 'Owner Occupied';
  return 'Secondary Home';
}

export function WelcomeSection({ 
  userName, 
  properties, 
  selectedPropertyId, 
  onPropertyChange,
  compact = false,
}: WelcomeSectionProps) {
  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === selectedPropertyId) ?? properties[0] ?? null,
    [properties, selectedPropertyId]
  );
  const selectedPropertyName =
    selectedProperty?.name?.trim() || selectedProperty?.address || 'No property selected';
  const selectedPropertyContextType = getPropertyContextType(selectedProperty);
  const selectedPropertyStructuralType = humanizeEnum(selectedProperty?.propertyType);
  const coverPhotoUrl = selectedProperty?.coverPhoto?.fileUrl || null;
  const [hasCoverPhotoError, setHasCoverPhotoError] = useState(false);

  useEffect(() => {
    setHasCoverPhotoError(false);
  }, [coverPhotoUrl]);

  if (compact) {
    const activeId = selectedPropertyId || properties[0]?.id;
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full pt-3 md:pt-4 pb-2">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 shadow-sm md:px-4 md:py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-gray-400 tracking-[0.14em]">
              Property Workspace
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {properties.map((property) => {
                const isActive = property.id === activeId;
                const label = property.name?.trim() || property.address || 'Unnamed';
                return (
                  <button
                    key={property.id}
                    onClick={() => onPropertyChange(property.id)}
                    className={cn(
                      'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-teal-50 text-teal-700 border-teal-200'
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:text-slate-700'
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-gradient-to-b from-teal-50 to-white border-b border-gray-100 py-7 mb-8"
    >
      
      {/* INNER CONTENT WRAPPER: Aligns with DashboardShell (max-w-7xl px-4 md:px-6) */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        <div className="flex items-center justify-between gap-6">
          
          {/* Left Column: Context + Selector */}
          <div className="flex-1 min-w-0">
            {compact ? (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.14em]">
                  Property Workspace
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Viewing context for scores, alerts, and recommendations.
                </p>
              </div>
            ) : (
              <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                Welcome, {userName}! <span className="text-gray-500 font-medium">Property Intelligence Dashboard</span>
              </h1>
            )}
            
            <div className={`flex items-center gap-2 ${compact ? 'mt-2' : 'mt-4'}`}>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Viewing:
              </span>
              
              {/* FIXED SELECTOR: 
                  Removed the outer 'bg-white rounded-md shadow-sm px-2 py-1 border' 
                  wrapper that was causing the double-border look.
              */}
              <div className="min-w-[300px]">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="bg-white border-gray-200 shadow-sm font-semibold text-xs text-gray-900 h-9 px-3 focus:ring-1 focus:ring-teal-500/20">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id} className="text-xs font-medium">
                        {formatPropertyDisplay(property)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Right Column: Property photo (if available) with fallback illustration */}
          <div className={`hidden md:flex justify-end shrink-0 ${compact ? 'opacity-70' : ''}`}>
            <div className="relative w-48 h-32 overflow-hidden rounded-xl border border-teal-100/70 bg-white/70">
              {coverPhotoUrl && !hasCoverPhotoError ? (
                <Image
                  src={coverPhotoUrl}
                  alt={selectedProperty?.name || selectedProperty?.address || 'Property photo'}
                  fill
                  unoptimized
                  sizes="192px"
                  className="object-cover"
                  onError={() => setHasCoverPhotoError(true)}
                />
              ) : (
                <Image 
                  src="/images/home-cozy-illustration.png" 
                  alt="Cozy Home" 
                  fill
                  sizes="192px"
                  className="object-contain object-right p-2"
                  priority
                />
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
