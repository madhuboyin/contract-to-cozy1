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
    /* Logic: The layout has md:p-8 (2rem). 
       We use -mx-8 to pull the background to the edge 
       and w-[calc(100%+4rem)] to fill the gap.
    */
    <div className="relative -mx-4 md:-mx-8 w-[calc(100%+2rem)] md:w-[calc(100%+4rem)] bg-gradient-to-b from-teal-50 to-white py-4 md:py-6 border-b border-gray-100 mb-6">
      <div className="px-4 md:px-8"> 
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          
          {/* Left Column */}
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Welcome, {userName}! Property Intelligence Dashboard
            </h1>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Viewing intelligence for:
              </label>
              <div className="bg-white rounded-lg shadow-sm p-1.5 max-w-md border border-gray-100">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="border-0 font-semibold text-gray-900 h-auto p-0 focus:ring-0">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem key={property.id} value={property.id} className="font-medium">
                        {formatPropertyDisplay(property)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Right Column */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-[180px] sm:max-w-[200px] lg:max-w-[220px]">
              <Image 
                src="/images/home-cozy-illustration.png" 
                alt="Cozy Home" 
                width={500}
                height={375}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}