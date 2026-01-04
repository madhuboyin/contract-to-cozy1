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
    /* 1. Outer Container: Background spans full screen width.
       -mx-4 and -mx-8 counteract the md:p-8 from layout.tsx.
    */
    <div className="relative -mx-4 md:-mx-8 bg-gradient-to-b from-teal-50 to-white border-b border-gray-100 py-6 md:py-8 mb-8">
      
      {/* 2. Inner Content Wrapper: Centered and constrained to align with dashboard cards.
          max-w-7xl matches the standard DashboardShell width.
      */}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          
          {/* Left Column - Text and Dropdown (Aligns with left edge of cards) */}
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 leading-tight tracking-tight">
              Welcome, {userName}! <span className="block text-gray-500 text-2xl md:text-3xl font-medium mt-1">Property Intelligence Dashboard</span>
            </h1>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Viewing intelligence for:
              </label>
              <div className="bg-white rounded-xl shadow-sm p-2 min-w-[300px] border border-gray-200">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="border-0 font-bold text-gray-900 h-auto p-1 focus:ring-0">
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
          
          {/* Right Column - Illustration (Aligns with right edge of cards) */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative w-48 h-48 md:w-64 md:h-64">
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