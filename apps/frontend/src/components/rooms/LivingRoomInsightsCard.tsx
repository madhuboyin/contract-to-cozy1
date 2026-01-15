// apps/frontend/src/components/rooms/LivingRoomInsightsCard.tsx
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

export default function LivingRoomInsightsCard({ profile }: Props) {
  const highlights = useMemo(() => {
    const chips: string[] = [];
    if (profile?.primaryUse) chips.push(`Use: ${profile.primaryUse}`);
    if (profile?.windowsCount) chips.push(`${profile.windowsCount} windows`);
    if (profile?.wallColor) chips.push(`Walls: ${profile.wallColor}`);
    if (profile?.tvMount) chips.push(`TV: ${profile.tvMount}`);
    return chips.slice(0, 4);
  }, [profile]);

  const quickNudges = useMemo(() => {
    const nudges: string[] = [];
    nudges.push('Vacuum under sofas & along edges monthly');
    if (profile?.windowsCount) nudges.push('Check window seals before winter');
    nudges.push('Dust vents / fan blades every 2–3 months');
    return nudges.slice(0, 3);
  }, [profile]);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Living Room</div>
            <div className="text-xs text-black/50 mt-0.5">Comfort + upkeep snapshot</div>
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
          <Row label="Primary use" value={profile?.primaryUse} />
          <div className="h-px bg-black/10" />
          <Row label="Wall color" value={profile?.wallColor} />
          <div className="h-px bg-black/10" />
          <Row label="Natural light" value={profile?.windowsCount ? `${profile.windowsCount} windows` : null} />
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
          Add a micro-checklist item to keep this room “alive” over time.
        </div>
      </CardContent>
    </Card>
  );
}
