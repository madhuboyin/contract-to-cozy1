// apps/frontend/src/components/PropertySetupBanner.tsx
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Home, X } from 'lucide-react';

const BANNER_DISMISSED_KEY = 'propertyBannerDismissed';

interface PropertySetupBannerProps {
  show: boolean;
  onDismiss?: () => void;
}

export function PropertySetupBanner({ show, onDismiss }: PropertySetupBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    console.log('🎌 BANNER COMPONENT - Mounted/Updated');
    console.log('   ├─ show prop:', show);
    
    const wasDismissed = localStorage.getItem(BANNER_DISMISSED_KEY) === 'true';
    console.log('   ├─ localStorage dismissed:', wasDismissed);
    
    setDismissed(wasDismissed);
    
    const shouldRender = show && !wasDismissed;
    console.log('   └─ Will render?', shouldRender);
    
    if (shouldRender) {
      console.log('✅ BANNER IS RENDERING');
    } else {
      console.log('❌ Banner NOT rendering');
      if (!show) {
        console.log('   Reason: show=false');
      }
      if (wasDismissed) {
        console.log('   Reason: dismissed=true');
      }
    }
  }, [show]);

  const handleDismiss = () => {
    console.log('🎌 BANNER DISMISSED by user');
    if (onDismiss) {
      onDismiss();
    } else {
      localStorage.setItem(BANNER_DISMISSED_KEY, 'true');
      setDismissed(true);
    }
  };

  // Don't render if show is false or if user dismissed it
  if (!show || dismissed) {
    return null;
  }

  console.log('🎨 BANNER RENDERING NOW');

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-orange-400 px-4 sm:px-6 py-4 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 flex-1">
          <Home className="h-5 w-5 text-orange-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-gray-900">
              Add your first property
            </p>
            <p className="text-xs text-gray-600">
              Add a property to unlock personalized maintenance insights, risk guidance, and home health scores.
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/properties/new"
            className="px-4 py-2.5 sm:py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 touch-manipulation"
          >
            Add property
          </Link>
          
          <button
            onClick={handleDismiss}
            className="p-2 text-gray-400 hover:text-gray-600 transition-colors touch-manipulation"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
