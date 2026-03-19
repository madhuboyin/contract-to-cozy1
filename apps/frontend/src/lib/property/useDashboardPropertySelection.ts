'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { usePropertyContext } from '@/lib/property/PropertyContext';

export function useDashboardPropertySelection(propertyIdFromUrl?: string | null) {
  const { selectedPropertyId: selectedPropertyIdFromContext, setSelectedPropertyId: setContextSelectedPropertyId } =
    usePropertyContext();

  const [selectedPropertyId, setSelectedPropertyIdState] = useState(
    propertyIdFromUrl || selectedPropertyIdFromContext || ''
  );

  useEffect(() => {
    const fallbackPropertyId = propertyIdFromUrl || selectedPropertyIdFromContext;

    if (fallbackPropertyId && !selectedPropertyId) {
      setSelectedPropertyIdState(fallbackPropertyId);
    }
  }, [propertyIdFromUrl, selectedPropertyIdFromContext, selectedPropertyId]);

  const setSelectedPropertyId = useCallback(
    (nextPropertyId: SetStateAction<string>) => {
      setSelectedPropertyIdState((previousPropertyId) => {
        const resolvedPropertyId =
          typeof nextPropertyId === 'function' ? nextPropertyId(previousPropertyId) : nextPropertyId;

        setContextSelectedPropertyId(resolvedPropertyId || undefined);
        return resolvedPropertyId;
      });
    },
    [setContextSelectedPropertyId]
  );

  return {
    selectedPropertyId,
    setSelectedPropertyId,
  };
}
