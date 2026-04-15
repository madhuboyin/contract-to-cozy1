// apps/frontend/src/lib/property/PropertyContext.tsx

'use client';

import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

interface PropertyContextType {
  selectedPropertyId: string | undefined;
  setSelectedPropertyId: (id: string | undefined) => void;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);
const STORAGE_KEY = 'selectedPropertyId';
const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;

function getPropertyIdFromPathname(pathname: string): string | undefined {
  const match = pathname.match(PROPERTY_ID_IN_PATH);
  return match?.[1];
}

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return (stored && stored !== 'undefined') ? stored : undefined;
  });

  // Keep selection synced with route context when present.
  useEffect(() => {
    const propertyIdFromPath = getPropertyIdFromPathname(pathname || '');
    const raw = searchParams.get('propertyId');
    const propertyIdFromQuery = (raw && raw !== 'undefined') ? raw : undefined;
    const routePropertyId = propertyIdFromPath || propertyIdFromQuery;

    if (routePropertyId && routePropertyId !== selectedPropertyId) {
      setSelectedPropertyId(routePropertyId);
    }
  }, [pathname, searchParams, selectedPropertyId]);

  // Persist across pages/refresh so Home Tools can always default to the last selected property.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedPropertyId) {
      window.localStorage.setItem(STORAGE_KEY, selectedPropertyId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [selectedPropertyId]);

  const value = useMemo(() => ({
    selectedPropertyId,
    setSelectedPropertyId,
  }), [selectedPropertyId]);

  return (
    <PropertyContext.Provider value={value}>
      {children}
    </PropertyContext.Provider>
  );
};

export const usePropertyContext = () => {
  const context = useContext(PropertyContext);
  if (context === undefined) {
    throw new Error('usePropertyContext must be used within a PropertyProvider');
  }
  return context;
};
