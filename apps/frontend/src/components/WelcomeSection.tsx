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
    <div className="w-full bg-gradient-to-b from-teal-50 to-white py-3 md:py-4 border-b border-gray-100">
      <div className="px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          
          {/* Left Column - Text and Dropdown */}
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 tracking-tight">
              Welcome back, {userName}!
            </h1>
            
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wider">
                Viewing intelligence for:
              </span>
              <div className="bg-white shadow-sm p-1.5 max-w-md border border-gray-100 rounded-md">
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
          
          {/* Right Column - Home Illustration */}
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