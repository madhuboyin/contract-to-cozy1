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

function Divider() {
  return <div className="h-px bg-black/10" />;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="text-sm text-black/70">{label}</div>
      <div className="text-sm font-medium text-black truncate max-w-[55%] text-right">{value}</div>
    </div>
  );
}

function BulletRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="mt-1.5 h-2 w-2 rounded-full bg-black/40" />
      <div className="text-sm text-black/80 leading-snug">{text}</div>
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

  const hasSnapshot =
    Boolean(profile?.flooring) || Boolean(profile?.lightingType || profile?.lighting) || Boolean(profile?.ventilation || profile?.ventHood);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Kitchen</div>
            <div className="text-xs text-black/50 mt-0.5">Snapshot + quick wins</div>
          </div>
          <div className="text-xs text-black/40">Rule-based</div>
        </div>

        {/* Chips */}
        {highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {highlights.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}

        {/* Grouped list */}
        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] overflow-hidden">
          {/* Snapshot */}
          <div className="px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold text-black/50 uppercase tracking-wide">Snapshot</div>
          </div>

          {hasSnapshot ? (
            <>
              <Row label="Flooring" value={profile?.flooring} />
              <Divider />
              <Row label="Lighting" value={profile?.lightingType || profile?.lighting} />
              <Divider />
              <Row label="Ventilation" value={profile?.ventilation || profile?.ventHood} />
            </>
          ) : (
            <div className="px-4 pb-3 text-sm text-black/60">
              Add a couple of answers in the questionnaire to generate a snapshot.
            </div>
          )}

          {/* Quick wins */}
          <Divider />
          <div className="px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold text-black/50 uppercase tracking-wide">Quick wins</div>
          </div>

          {quickNudges.length === 0 ? (
            <div className="px-4 pb-3 text-sm text-black/60">No quick wins yet.</div>
          ) : (
            quickNudges.map((t, idx) => (
              <React.Fragment key={t}>
                <BulletRow text={t} />
                {idx !== quickNudges.length - 1 && <Divider />}
              </React.Fragment>
            ))
          )}
        </div>

        <div className="mt-4 text-xs text-black/50">
          Small habits → fewer incidents and better claims readiness.
        </div>
      </CardContent>
    </Card>
  );
}
