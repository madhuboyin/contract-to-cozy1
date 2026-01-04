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
    <div className="w-screen bg-gradient-to-b from-teal-50 to-white py-3 md:py-4 -mx-4 sm:-mx-6 lg:-mx-8">
      <div className="w-full px-8 sm:px-12 lg:px-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-center">
          {/* Left Column - 60% */}
          <div className="lg:col-span-3 space-y-1.5">
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
          
          {/* Right Column - 40% with SMALLER Home Illustration */}
          <div className="lg:col-span-2 relative flex justify-center lg:justify-end">
            {/* ✨ FIXED: Changed from "w-full max-w-md" to "w-56" for compact height */}
            <div className="w-56 h-auto">
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