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
    /* Outer wrapper: Uses negative margins to counteract DashboardShell/Layout padding.
       Spans full viewport width with the gradient. */
    <div className="relative -mx-4 md:-mx-6 bg-gradient-to-b from-teal-50 to-white py-4 border-b border-gray-100 mb-6">
      
      {/* Inner container: Constrains content to match the width and alignment of other dashboard cards. */}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between gap-4">
          
          {/* Left Column: Aligns with the left edge of dashboard cards */}
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Welcome, {userName}! <span className="text-gray-500 font-medium">Property Intelligence Dashboard</span>
            </h1>
            
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Viewing:
              </span>
              <div className="bg-white rounded-md shadow-sm px-2 py-1 border border-gray-200 min-w-[280px]">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="border-0 font-semibold text-sm text-gray-900 h-6 p-0 focus:ring-0">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id} className="text-sm">
                        {formatPropertyDisplay(property)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Right Column: Small Illustration aligned to the right edge of dashboard cards */}
          <div className="hidden sm:block">
            <div className="relative w-32 h-24">
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