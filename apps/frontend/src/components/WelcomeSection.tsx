// apps/frontend/src/components/WelcomeSection.tsx
// VERSION: Full-width with balanced grid (keeps negative margins approach)
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
    <div className="w-screen bg-gradient-to-b from-teal-50 to-white py-3 md:py-4 -mx-4 sm:-mx-6 lg:-mx-8">
      <div className="max-w-7xl mx-auto px-6">
        {/* CHANGED: lg:grid-cols-2 for 50/50 balance instead of lg:grid-cols-5 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          
          {/* Left Column - Text and Dropdown - 50% */}
          <div className="space-y-1.5">
            {/* Welcome Heading */}
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
              Welcome, {userName}! Property Intelligence Dashboard
            </h1>
            
            {/* Property Selection */}
            <div className="space-y-0.5">
              <label className="text-xs text-gray-600 block font-medium">
                Property
              </label>
              <div className="bg-white rounded-lg shadow-sm p-1.5 max-w-md border border-gray-100">
                <Select value={selectedPropertyId || ''} onValueChange={onPropertyChange}>
                  <SelectTrigger className="border-0 font-semibold text-gray-900 h-auto p-0 focus:ring-0">
                    <SelectValue placeholder="Select a property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((property) => (
                      <SelectItem 
                        key={property.id} 
                        value={property.id}
                        className="font-medium"
                      >
                        {formatPropertyDisplay(property)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          
          {/* Right Column - Home Illustration - 50% */}
          <div className="flex justify-center lg:justify-end">
            {/* CHANGED: Responsive max-widths instead of fixed w-56 */}
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