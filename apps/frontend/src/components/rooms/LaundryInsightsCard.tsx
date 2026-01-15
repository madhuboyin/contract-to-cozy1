// apps/frontend/src/components/rooms/LaundryInsightsCard.tsx
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

export default function LaundryInsightsCard({ profile }: Props) {
  const highlights = useMemo(() => {
    const chips: string[] = [];
    if (profile?.washerType) chips.push(`Washer: ${profile.washerType}`);
    if (profile?.dryerType) chips.push(`Dryer: ${profile.dryerType}`);
    if (profile?.ventingType) chips.push(`Venting: ${profile.ventingType}`);
    if (profile?.leakPan) chips.push(`Leak pan: ${profile.leakPan}`);
    if (profile?.floorDrain) chips.push(`Floor drain: ${profile.floorDrain}`);
    return chips.slice(0, 4);
  }, [profile]);

  const quickWins = useMemo(() => {
    const nudges: string[] = [];
    nudges.push('Clean lint trap weekly (and after heavy loads)');
    nudges.push('Run washer drum cleaning monthly (reduces odor + buildup)');
    nudges.push('Clean dryer vent yearly (fire prevention + efficiency)');
    return nudges.slice(0, 3);
  }, []);

  const hasSnapshot = Boolean(profile?.washerType) || Boolean(profile?.dryerType) || Boolean(profile?.ventingType);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Laundry</div>
            <div className="text-xs text-black/50 mt-0.5">Snapshot + quick wins</div>
          </div>
          <div className="text-xs text-black/40">Rule-based</div>
        </div>

        {highlights.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {highlights.map((c) => (
              <Chip key={c}>{c}</Chip>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] overflow-hidden">
          <div className="px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold text-black/50 uppercase tracking-wide">Snapshot</div>
          </div>

          {hasSnapshot ? (
            <>
              <Row label="Washer" value={profile?.washerType} />
              <Divider />
              <Row label="Dryer" value={profile?.dryerType} />
              <Divider />
              <Row label="Venting" value={profile?.ventingType} />
            </>
          ) : (
            <div className="px-4 pb-3 text-sm text-black/60">
              Add washer/dryer details to generate a snapshot.
            </div>
          )}

          <Divider />
          <div className="px-4 pt-3 pb-2">
            <div className="text-[11px] font-semibold text-black/50 uppercase tracking-wide">Quick wins</div>
          </div>

          {quickWins.map((t, idx) => (
            <React.Fragment key={t}>
              <BulletRow text={t} />
              {idx !== quickWins.length - 1 && <Divider />}
            </React.Fragment>
          ))}
        </div>

        <div className="mt-4 text-xs text-black/50">
          Laundry readiness is mostly prevention: water + heat + lint.
        </div>
      </CardContent>
    </Card>
  );
}
