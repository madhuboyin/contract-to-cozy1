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
    /* OUTER CONTAINER: 
       - Counteracts parent padding (md:p-8 from layout) using negative margins.
       - bg-gradient spans the full screen width.
    */
    <div className="relative -mx-4 md:-mx-8 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] bg-gradient-to-b from-teal-50 to-white border-b border-gray-100 py-4 mb-6">
      
      {/* INNER CONTAINER: 
          - Aligns content with the DashboardShell (max-w-7xl).
          - px-4/6 ensures the left text and right image don't hit the screen edge.
      */}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between">
          
          {/* Left Side: Welcome Message & Selector */}
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              Welcome, {userName}! <span className="text-gray-500 font-medium hidden sm:inline">Property Intelligence Dashboard</span>
            </h1>
            
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
                Viewing:
              </span>
              <div className="bg-white rounded-md shadow-sm px-2 py-0.5 border border-gray-200 min-w-[240px]">
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
          
          {/* Right Side: Small Illustration (Aligned to right of cards) */}
          <div className="hidden sm:block">
            <div className="relative w-28 h-20">
              <Image 
                src="/images/home-cozy-illustration.png" 
                alt="Cozy Home" 
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}