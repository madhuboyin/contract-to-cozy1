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
    /* Background spans 100% of the parent container */
    <div className="w-full bg-gradient-to-b from-teal-50 to-white border-b border-gray-200 py-8 md:py-10">
      {/* This inner div ensures content aligns with the dashboard grid below */}
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
          
          {/* Left Side: Welcome Text and Property Selector */}
          <div className="flex-1 space-y-4">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">
              Welcome, {userName}! <br className="hidden md:block" />
              <span className="text-gray-500 font-medium text-2xl md:text-3xl">Property Intelligence Dashboard</span>
            </h1>
            
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Viewing:
              </span>
              <div className="bg-white rounded-lg shadow-sm px-3 py-2 border border-gray-200 min-w-[320px]">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="border-0 font-bold text-gray-900 h-auto p-0 focus:ring-0">
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
          
          {/* Right Side: Illustration aligned to the right-hand side of dashboard cards */}
          <div className="flex justify-start md:justify-end">
            <div className="relative w-48 h-36 md:w-64 md:h-48">
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