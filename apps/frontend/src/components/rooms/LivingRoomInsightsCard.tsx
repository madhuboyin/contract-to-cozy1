// apps/frontend/src/components/rooms/LivingRoomInsightsCard.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

type LivingRoomProfile = {
  seatingCapacity?: number | string;
  primaryUse?: string;
  tvMount?: string;
  lighting?: string;
};

interface Props {
  profile?: LivingRoomProfile | Record<string, any> | null;
}

export default function LivingRoomInsightsCard({ profile }: Props) {
  const p = (profile || {}) as any;

  const highlights = useMemo(() => {
    const rows: { label: string; value: string }[] = [];

    if (p.seatingCapacity) rows.push({ label: 'Seating', value: String(p.seatingCapacity) });
    if (p.primaryUse) rows.push({ label: 'Primary use', value: String(p.primaryUse) });
    if (p.tvMount) rows.push({ label: 'TV mount', value: String(p.tvMount) });
    if (p.lighting) rows.push({ label: 'Lighting', value: String(p.lighting) });

    return rows;
  }, [p]);

  const nudges = useMemo(() => {
    const tips: string[] = [];

    if (!p.seatingCapacity) tips.push('Add seating capacity to help plan comfort + traffic flow.');
    if (!p.primaryUse) tips.push('Set primary use (family, entertaining, TV) for better suggestions.');
    if (!p.lighting) tips.push('Add lighting type to suggest bulb replacement cadence.');
    if (tips.length === 0) tips.push('Nice—your living room profile is well defined.');

    return tips.slice(0, 2);
  }, [p]);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white">
      <CardContent className="p-5 space-y-3">
        <div>
          <div className="text-sm font-semibold">Living room insights</div>
          <div className="text-xs opacity-70 mt-1">Lightweight, rule-based (no AI).</div>
        </div>

        {highlights.length === 0 ? (
          <div className="text-sm opacity-70">
            Add a few profile details to unlock living-room-specific suggestions.
          </div>
        ) : (
          <div className="space-y-2">
            {highlights.map((h) => (
              <div
                key={h.label}
                className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2"
              >
                <div className="text-xs opacity-70">{h.label}</div>
                <div className="text-sm font-medium truncate max-w-[60%] text-right">
                  {h.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-1 space-y-1">
          {nudges.map((t, idx) => (
            <div key={idx} className="text-xs opacity-70">
              • {t}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
