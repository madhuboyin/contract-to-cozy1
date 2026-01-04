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
       - py-7 provides the slight height increase requested.
       - Full viewport width background.
    */
    <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] w-screen bg-gradient-to-b from-teal-50 to-white border-b border-gray-100 py-7 mb-8">
      
      {/* INNER CONTENT WRAPPER: Aligns with DashboardShell (max-w-7xl px-4 md:px-6) */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 w-full">
        <div className="flex items-center justify-between gap-6">
          
          {/* Left Column: Welcome Text & Refined Selector */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              Welcome, {userName}! <span className="text-gray-500 font-medium">Property Intelligence Dashboard</span>
            </h1>
            
            <div className="flex items-center gap-2 mt-4">
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
          
          {/* Right Column: Prominent Illustration */}
          <div className="hidden md:flex justify-end shrink-0">
            <div className="relative w-48 h-32"> {/* Increased from w-40 h-28 */}
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