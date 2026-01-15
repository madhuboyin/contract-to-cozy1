// apps/frontend/src/components/rooms/KitchenInsightsCard.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

type KitchenProfile = {
  style?: string;
  flooring?: string;
  countertops?: string;
  cabinets?: string;
  backsplash?: string;
  ventHood?: string;
};

interface Props {
  profile?: KitchenProfile | Record<string, any> | null;
}

export default function KitchenInsightsCard({ profile }: Props) {
  const p = (profile || {}) as any;

  const highlights = useMemo(() => {
    const rows: { label: string; value: string }[] = [];

    if (p.style) rows.push({ label: 'Style', value: String(p.style) });
    if (p.flooring) rows.push({ label: 'Flooring', value: String(p.flooring) });
    if (p.countertops) rows.push({ label: 'Countertops', value: String(p.countertops) });
    if (p.cabinets) rows.push({ label: 'Cabinet finish', value: String(p.cabinets) });
    if (p.backsplash) rows.push({ label: 'Backsplash', value: String(p.backsplash) });
    if (p.ventHood) rows.push({ label: 'Vent hood', value: String(p.ventHood) });

    return rows;
  }, [p]);

  const nudges = useMemo(() => {
    const tips: string[] = [];

    if (!p.ventHood) tips.push('Add your vent hood type to get a monthly “filter clean/replace” reminder.');
    if (!p.countertops) tips.push('Add countertop material—helps with stain/cleaning checklist defaults.');
    if (!p.cabinets) tips.push('Add cabinet finish—helps suggest gentle cleaning cadence.');
    if (tips.length === 0) tips.push('Nice—your kitchen profile is complete enough to generate defaults.');

    return tips.slice(0, 2);
  }, [p]);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white">
      <CardContent className="p-5 space-y-3">
        <div>
          <div className="text-sm font-semibold">Kitchen insights</div>
          <div className="text-xs opacity-70 mt-1">Lightweight, rule-based (no AI).</div>
        </div>

        {highlights.length === 0 ? (
          <div className="text-sm opacity-70">Add a few profile details to unlock kitchen-specific suggestions.</div>
        ) : (
          <div className="space-y-2">
            {highlights.map((h) => (
              <div key={h.label} className="flex items-center justify-between gap-3 rounded-xl border border-black/10 px-3 py-2">
                <div className="text-xs opacity-70">{h.label}</div>
                <div className="text-sm font-medium truncate max-w-[60%] text-right">{h.value}</div>
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
