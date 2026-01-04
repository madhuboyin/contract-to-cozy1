// apps/frontend/src/components/WelcomeSection.tsx
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
    <div className="w-full bg-gradient-to-b from-teal-50 to-white py-8 md:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
          {/* Left Column - 60% */}
          <div className="lg:col-span-3 space-y-4">
            {/* Welcome Heading - ORIGINAL MESSAGE */}
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
              Welcome, {userName}! Property Intelligence Dashboard
            </h1>
            
            {/* Property Selection */}
            <div className="space-y-2">
              <label className="text-sm text-gray-600 block font-medium">
                Account
              </label>
              <div className="bg-white rounded-lg shadow-sm p-3 max-w-md border border-gray-100">
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
          
          {/* Right Column - 40% with Detailed Home Illustration */}
          <div className="lg:col-span-2 relative flex justify-center lg:justify-end">
            <div className="w-full max-w-md h-auto">
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