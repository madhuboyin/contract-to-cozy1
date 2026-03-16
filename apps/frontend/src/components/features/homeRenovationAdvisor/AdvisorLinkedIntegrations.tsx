'use client';

// apps/frontend/src/components/features/homeRenovationAdvisor/AdvisorLinkedIntegrations.tsx
//
// Small chip row shown after evaluation when post-evaluation integrations have
// populated linked entity IDs on the session. Provides traceability to other CtC tools.

import * as React from 'react';
import Link from 'next/link';
import { GitBranch, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';
import type { RenovationAdvisorSession } from '@/types';

interface AdvisorLinkedIntegrationsProps {
  session: RenovationAdvisorSession;
  propertyId?: string;
}

export function AdvisorLinkedIntegrations({
  session,
  propertyId,
}: AdvisorLinkedIntegrationsProps) {
  const { linkedEntities } = session;
  if (!linkedEntities) return null;

  const hasTimeline = !!linkedEntities.timelineEventId;
  const hasTwin = !!linkedEntities.digitalTwinEntityId;

  if (!hasTimeline && !hasTwin) return null;

  return (
    <div className="flex flex-wrap gap-2 py-1">
      {hasTimeline && (
        <div
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border',
            'border-[hsl(var(--mobile-border-subtle))] bg-white px-2.5 py-1',
            MOBILE_TYPE_TOKENS.caption,
            'text-[hsl(var(--mobile-text-secondary))]',
          )}
        >
          <Clock className="h-3 w-3 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
          Logged to Home Timeline
        </div>
      )}

      {hasTwin && (
        propertyId ? (
          <Link
            href={`/dashboard/properties/${propertyId}/tools/home-digital-twin`}
            className={cn(
              'no-brand-style inline-flex items-center gap-1.5 rounded-full border',
              'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-2.5 py-1',
              MOBILE_TYPE_TOKENS.caption,
              'font-medium text-[hsl(var(--mobile-brand-strong))]',
            )}
          >
            <GitBranch className="h-3 w-3 shrink-0" />
            Digital Twin scenario created
          </Link>
        ) : (
          <div
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border',
              'border-[hsl(var(--mobile-brand-border))] bg-[hsl(var(--mobile-brand-soft))] px-2.5 py-1',
              MOBILE_TYPE_TOKENS.caption,
              'text-[hsl(var(--mobile-brand-strong))]',
            )}
          >
            <GitBranch className="h-3 w-3 shrink-0" />
            Digital Twin scenario created
          </div>
        )
      )}
    </div>
  );
}
