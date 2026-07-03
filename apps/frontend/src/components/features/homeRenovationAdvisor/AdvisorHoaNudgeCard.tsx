'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldCheck, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOBILE_CARD_RADIUS, MOBILE_TYPE_TOKENS } from '@/components/mobile/dashboard/mobileDesignTokens';

// Renovation types that are typically visible from outside the home and
// commonly require HOA/architectural-review approval in addition to a
// municipal permit. Kept as a small static allowlist — no backend evaluator
// integration for v1 (see plan notes on evaluationEngine.service.ts coupling).
const HOA_RELEVANT_RENOVATION_TYPES = new Set([
  'ROOM_ADDITION',
  'GARAGE_CONVERSION',
  'ADU_CONSTRUCTION',
  'DECK_ADDITION',
  'PATIO_MAJOR_ADDITION',
  'ROOF_REPLACEMENT',
  'STRUCTURAL_WALL_ADDITION',
]);

interface AdvisorHoaNudgeCardProps {
  renovationType: string;
  propertyId?: string;
}

export function AdvisorHoaNudgeCard({ renovationType, propertyId }: AdvisorHoaNudgeCardProps) {
  if (!HOA_RELEVANT_RENOVATION_TYPES.has(renovationType)) return null;

  const href = propertyId ? `/dashboard/hoa?propertyId=${propertyId}` : '/dashboard/hoa';

  return (
    <Link
      href={href}
      className={cn(
        MOBILE_CARD_RADIUS,
        'flex items-start gap-3 border border-[hsl(var(--mobile-border-subtle))] bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]'
      )}
    >
      <ShieldCheck className="h-5 w-5 shrink-0 text-[hsl(var(--mobile-brand-strong))]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[hsl(var(--mobile-text-primary))]">
          This may also need HOA approval
        </p>
        <p className={cn('mt-0.5 text-[hsl(var(--mobile-text-secondary))]', MOBILE_TYPE_TOKENS.caption)}>
          A permit doesn&apos;t cover community association rules. Track your HOA approval separately.
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--mobile-text-muted))]" />
    </Link>
  );
}
