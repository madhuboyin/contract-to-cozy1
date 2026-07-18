'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api/client';
import { PropertyContextStatusNotice } from '@/components/property-context/PropertyContextStatusNotice';
import type { PropertyContextEnvelope } from '@/components/property-context/propertyContextTypes';

export function KnowledgeTargetingNotice({ propertyId }: { propertyId?: string | null }) {
  const [context, setContext] = useState<PropertyContextEnvelope | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    let active = true;
    api.get(`/api/properties/${encodeURIComponent(propertyId)}/knowledge/articles`)
      .then((response) => {
        const data = response.data as { propertyContext?: PropertyContextEnvelope };
        if (active) setContext(data.propertyContext ?? null);
      })
      .catch(() => {
        if (active) setContext(null);
      });
    return () => { active = false; };
  }, [propertyId]);

  return <PropertyContextStatusNotice context={context} title="Knowledge targeting context" />;
}
