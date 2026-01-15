// apps/frontend/src/components/rooms/KitchenInsightsCard.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  profile: any;
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.02] px-2 py-0.5 text-xs font-medium text-black/70">
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="text-sm text-black/70">{label}</div>
      <div className="text-sm font-medium text-black truncate max-w-[55%] text-right">{value}</div>
    </div>
  );
}

export default function KitchenInsightsCard({ profile }: Props) {
  const highlights = useMemo(() => {
    const chips: string[] = [];
    if (profile?.countertops) chips.push(`Countertops: ${profile.countertops}`);
    if (profile?.cabinets) chips.push(`Cabinets: ${profile.cabinets}`);
    if (profile?.ventHood) chips.push(`Vent: ${profile.ventHood}`);
    if (profile?.flooring) chips.push(`Floor: ${profile.flooring}`);
    return chips.slice(0, 4);
  }, [profile]);

  const quickNudges = useMemo(() => {
    const nudges: string[] = [];
    if (profile?.ventHood) nudges.push('Replace/clean hood filter quarterly');
    nudges.push('Check under-sink area for leaks monthly');
    nudges.push('Test GFCI outlets (kitchen) every 6 months');
    return nudges.slice(0, 3);
  }, [profile]);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Kitchen</div>
            <div className="text-xs text-black/50 mt-0.5">Snapshot + quick wins</div>
          </div>
          <div className="text-xs font-medium text-black/40">Insights</div>
        </div>

        {highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {highlights.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] px-3">
          <Row label="Flooring" value={profile?.flooring} />
          <div className="h-px bg-black/10" />
          <Row label="Lighting" value={profile?.lightingType || profile?.lighting} />
          <div className="h-px bg-black/10" />
          <Row label="Ventilation" value={profile?.ventilation || profile?.ventHood} />
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-black/50 uppercase tracking-wide">Quick wins</div>
          <div className="mt-2 space-y-2">
            {quickNudges.map((t) => (
              <div
                key={t}
                className="flex items-start gap-2 rounded-xl border border-black/10 bg-white px-3 py-2"
              >
                <div className="mt-1 h-2 w-2 rounded-full bg-black/50" />
                <div className="text-sm text-black/80 leading-snug">{t}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-xs text-black/50">
          Add a couple more answers in the questionnaire to refine recommendations.
        </div>
      </CardContent>
    </Card>
  );
}
