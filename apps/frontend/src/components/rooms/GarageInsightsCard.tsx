// apps/frontend/src/components/rooms/GarageInsightsCard.tsx
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

export default function GarageInsightsCard({ profile }: Props) {
  const highlights = useMemo(() => {
    const chips: string[] = [];
    if (profile?.carCapacity) chips.push(`Cars: ${profile.carCapacity}`);
    if (profile?.doorType) chips.push(`Door: ${profile.doorType}`);
    if (profile?.storageType) chips.push(`Storage: ${profile.storageType}`);
    if (profile?.fireExtinguisherPresent) chips.push(`Extinguisher: ${profile.fireExtinguisherPresent}`);
    if (profile?.waterHeaterLocatedHere) chips.push(`Water heater: ${profile.waterHeaterLocatedHere}`);
    return chips.slice(0, 4);
  }, [profile]);

  const quickWins = useMemo(() => {
    const nudges: string[] = [];
    nudges.push('Test garage door auto-reverse quarterly (safety)');
    nudges.push('Replace opener batteries yearly (remote/keypad)');
    nudges.push('Store chemicals safely + label shelf quarterly');
    return nudges.slice(0, 3);
  }, []);

  const hasSnapshot = Boolean(profile?.carCapacity) || Boolean(profile?.doorType) || Boolean(profile?.storageType);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Garage</div>
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
              <Row label="Capacity" value={profile?.carCapacity ? String(profile.carCapacity) : null} />
              <Divider />
              <Row label="Door" value={profile?.doorType} />
              <Divider />
              <Row label="Storage" value={profile?.storageType} />
            </>
          ) : (
            <div className="px-4 pb-3 text-sm text-black/60">
              Add a couple of garage details to generate a snapshot.
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
          Garages are high-risk zones (fire + water + chemicals). Keep it simple and consistent.
        </div>
      </CardContent>
    </Card>
  );
}
