// apps/frontend/src/components/rooms/BedroomInsightsCard.tsx
'use client';

import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  profile: any;
}

type BedroomKind = 'MASTER' | 'KIDS' | 'GUEST' | '';

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
  if (value === undefined || value === null || value === '') return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="text-sm text-black/70">{label}</div>
      <div className="text-sm font-medium text-black truncate max-w-[55%] text-right">{String(value)}</div>
    </div>
  );
}

function YesNo(value: any): string | null {
  if (value === 'YES') return 'Yes';
  if (value === 'NO') return 'No';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return null;
}

export default function BedroomInsightsCard({ profile }: Props) {
  const kind = (profile?.bedroomKind || '') as BedroomKind;

  const title =
    kind === 'MASTER' ? 'Master Bedroom' : kind === 'KIDS' ? 'Kids Bedroom' : kind === 'GUEST' ? 'Guest Bedroom' : 'Bedroom';

  const subtitle =
    kind === 'MASTER'
      ? 'Comfort + sleep environment snapshot'
      : kind === 'KIDS'
        ? 'Safety + organization snapshot'
        : kind === 'GUEST'
          ? 'Hospitality readiness snapshot'
          : 'Snapshot + quick wins';

  const highlights = useMemo(() => {
    const chips: string[] = [];

    if (profile?.bedSize) chips.push(`Bed: ${profile.bedSize}`);
    if (profile?.nightLighting) chips.push(`Night light: ${profile.nightLighting}`);

    if (kind === 'MASTER') {
      if (profile?.mattressType) chips.push(`Mattress: ${profile.mattressType}`);
      if (profile?.noiseLevel) chips.push(`Noise: ${profile.noiseLevel}`);
      if (profile?.storage) chips.push(`Storage: ${profile.storage}`);
    }

    if (kind === 'KIDS') {
      if (profile?.ageRange) chips.push(`Age: ${profile.ageRange}`);
      if (profile?.toyStorage) chips.push(`Toys: ${profile.toyStorage}`);
      const anchored = YesNo(profile?.anchorFurniture);
      if (anchored) chips.push(`Anchored: ${anchored}`);
      const windowSafe = YesNo(profile?.windowSafety);
      if (windowSafe) chips.push(`Window safety: ${windowSafe}`);
    }

    if (kind === 'GUEST') {
      const blackout = YesNo(profile?.blackout);
      if (blackout) chips.push(`Blackout: ${blackout}`);
      if (profile?.charging) chips.push(`Charging: ${profile.charging}`);
      if (profile?.linens) chips.push(`Linens: ${profile.linens}`);
    }

    return chips.slice(0, 4);
  }, [profile, kind]);

  const quickNudges = useMemo(() => {
    const nudges: string[] = [];

    // baseline for all bedrooms
    nudges.push('Vacuum edges & under bed monthly');
    nudges.push('Check smoke/CO alarm battery every 6 months');

    if (kind === 'MASTER') {
      nudges.unshift('Rotate/flip mattress per manufacturer guidance');
      nudges.push('Wash bedding weekly (or as needed)');
      nudges.push('Dust vents & ceiling fan blades every 2–3 months');
    }

    if (kind === 'KIDS') {
      nudges.unshift('Do a quick “floor sweep” for small hazards weekly');
      nudges.push('Confirm furniture anchoring quarterly');
      nudges.push('Check window locks / cord safety monthly');
      nudges.push('Rotate toys monthly to reduce clutter');
    }

    if (kind === 'GUEST') {
      nudges.unshift('Refresh linens before guests arrive');
      nudges.push('Keep a spare phone charger visible');
      nudges.push('Check closet/drawer dust quarterly');
    }

    return nudges.slice(0, 3);
  }, [kind]);

  const showKidsSafety = kind === 'KIDS';

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-xs text-black/50 mt-0.5">{subtitle}</div>
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

        {/* Snapshot (grouped list style) */}
        <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] px-3">
          <Row label="Bed size" value={profile?.bedSize} />
          <Divider />
          <Row label="Night lighting" value={profile?.nightLighting} />

          {kind === 'MASTER' && (
            <>
              <Divider />
              <Row label="Mattress" value={profile?.mattressType} />
              <Divider />
              <Row label="Noise level" value={profile?.noiseLevel} />
              <Divider />
              <Row label="Storage" value={profile?.storage} />
            </>
          )}

          {kind === 'KIDS' && (
            <>
              <Divider />
              <Row label="Age range" value={profile?.ageRange} />
              <Divider />
              <Row label="Toy storage" value={profile?.toyStorage} />
              <Divider />
              <Row label="Furniture anchored" value={YesNo(profile?.anchorFurniture)} />
              <Divider />
              <Row label="Window safety" value={YesNo(profile?.windowSafety)} />
            </>
          )}

          {kind === 'GUEST' && (
            <>
              <Divider />
              <Row label="Blackout curtains" value={YesNo(profile?.blackout)} />
              <Divider />
              <Row label="Charging setup" value={profile?.charging} />
              <Divider />
              <Row label="Linens / towels" value={profile?.linens} />
            </>
          )}
        </div>

        {/* Quick wins */}
        <div className="mt-4">
          <div className="text-xs font-semibold text-black/50 uppercase tracking-wide">Quick wins</div>
          <div className="mt-2 space-y-2">
            {quickNudges.map((t) => (
              <div key={t} className="flex items-start gap-2 rounded-xl border border-black/10 bg-white px-3 py-2">
                <div className="mt-1 h-2 w-2 rounded-full bg-black/50" />
                <div className="text-sm text-black/80 leading-snug">{t}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Kids safety hint */}
        {showKidsSafety && (
          <div className="mt-4 rounded-xl border border-black/10 bg-black/[0.02] p-3">
            <div className="text-xs font-semibold text-black/50 uppercase tracking-wide">Safety hint</div>
            <div className="mt-1 text-sm text-black/80 leading-snug">
              If furniture is not anchored or window safety isn’t set, add it to your checklist. It’s a high-impact risk reducer.
            </div>
          </div>
        )}

        <div className="mt-4 text-xs text-black/50">
          Tip: set the bedroom type in the questionnaire to unlock better defaults.
        </div>
      </CardContent>
    </Card>
  );
}
