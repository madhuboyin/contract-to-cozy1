// apps/frontend/src/lib/property/PropertyContext.tsx

'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';

interface PropertyContextType {
  selectedPropertyId: string | undefined;
  setSelectedPropertyId: (id: string | undefined) => void;
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(undefined);

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