import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';

/**
 * ACUI-001: the selected home's display name, so the launch says which home it is talking about. Best effort:
 * a failed or missing lookup yields null and the launch simply omits the label; nothing else depends on it.
 */
export function useSelectedPropertyLabel(propertyId: string | undefined, enabled: boolean): string | null {
  const [label, setLabel] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    if (!propertyId || !enabled) return;
    let active = true;
    Promise.resolve(api.getProperties?.())
      .then((response) => {
        if (!active || !response?.success || !response.data) return;
        const property = response.data.properties.find((entry) => entry.id === propertyId);
        const text = property ? (property.name?.trim() || [property.address, property.city].filter(Boolean).join(', ')) : '';
        setLabel(text ? { id: propertyId, text } : null);
      })
      .catch(() => { if (active) setLabel(null); });
    return () => { active = false; };
  }, [propertyId, enabled]);
  return propertyId && label?.id === propertyId ? label.text : null;
}
