// apps/frontend/src/components/PropertySetupBanner.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BANNER_DISMISSED_KEY = 'propertyBannerDismissed';

interface PropertySetupBannerProps {
  show: boolean; // Parent controls visibility based on property count
}

export const PropertySetupBanner: React.FC<PropertySetupBannerProps> = ({ show }) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // Check localStorage on mount
  useEffect(() => {
    const dismissed = localStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissed === 'true') {
      setIsDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setIsDismissed(true);
  };

  // Don't render if parent says don't show OR if user dismissed it
  if (!show || isDismissed) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-orange-400 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center flex-1">
            <div className="flex-shrink-0">
              <Home className="h-6 w-6 text-orange-600" />
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-sm font-semibold text-gray-900">
                Complete Your Property Profile
              </h3>
              <p className="mt-1 text-sm text-gray-700">
                Add your property details to unlock personalized maintenance insights, property health scores, and tailored service recommendations.
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3 ml-4">
            <Link href="/dashboard/properties/new">
              <Button 
                size="sm" 
                className="bg-orange-600 hover:bg-orange-700 text-white font-medium"
              >
                Add Property Now
              </Button>
            </Link>
            
            <button
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              aria-label="Dismiss banner"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};