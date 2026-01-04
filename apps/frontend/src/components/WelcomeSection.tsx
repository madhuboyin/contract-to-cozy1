// apps/frontend/src/app/(dashboard)/dashboard/components/WelcomeSection.tsx
'use client';

import React from 'react';
import Image from 'next/image';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Property } from '@/types';

interface WelcomeSectionProps {
  userName: string;
  properties: Property[];
  selectedPropertyId: string | undefined;
  onPropertyChange: (propertyId: string) => void;
}

function formatPropertyDisplay(property: Property): string {
  const address = property.address?.toUpperCase() || 'UNKNOWN ADDRESS';
  const name = property.name?.toUpperCase() || 'PRIMARY HOME';
  return `${address} | ${name}`;
}

export function WelcomeSection({ 
  userName, 
  properties, 
  selectedPropertyId, 
  onPropertyChange 
}: WelcomeSectionProps) {
  return (
    /* OUTER WRAPPER: 
       - Background spans 100% viewport width.
       - py-4 reduces the height significantly from previous versions.
    */
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-gradient-to-b from-teal-50 to-white border-b border-gray-100 py-4 mb-6">
      
      {/* INNER CONTENT WRAPPER:
          - Uses EXACT same max-w and px as DashboardShell (max-w-7xl px-4 md:px-6)
          - This fixes the alignment offset.
      */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        <div className="flex items-center justify-between gap-4">
          
          {/* Left Column: Refined Font Sizes */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight truncate">
              Welcome, {userName}! <span className="text-gray-500 font-medium text-lg md:text-xl hidden sm:inline ml-1">Property Intelligence Dashboard</span>
            </h1>
            
            <div className="flex items-center gap-2 mt-2">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Viewing:
              </label>
              <div className="bg-white rounded-md shadow-sm px-2 py-0.5 border border-gray-200 min-w-[260px]">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="border-0 font-semibold text-xs text-gray-900 h-6 p-0 focus:ring-0">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id} className="text-xs">
                        {formatPropertyDisplay(property)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Right Column: Scaled-down illustration to reduce height footprint */}
          <div className="hidden md:flex justify-end shrink-0">
            <div className="relative w-32 h-20">
              <Image 
                src="/images/home-cozy-illustration.png" 
                alt="Cozy Home" 
                fill
                className="object-contain object-right"
                priority
              />
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}