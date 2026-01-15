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

export default function BathroomInsightsCard({ profile }: Props) {
  const highlights = useMemo(() => {
    const chips: string[] = [];
    if (profile?.bathroomType) chips.push(`Type: ${profile.bathroomType}`);
    if (profile?.showerType) chips.push(`Shower: ${profile.showerType}`);
    if (profile?.exhaustFan) chips.push(`Fan: ${profile.exhaustFan}`);
    if (profile?.gfciPresent) chips.push(`GFCI: ${profile.gfciPresent}`);
    if (profile?.flooring) chips.push(`Floor: ${profile.flooring}`);
    return chips.slice(0, 4);
  }, [profile]);

  const quickWins = useMemo(() => {
    const nudges: string[] = [];

    // Rule-based nudges (no AI)
    nudges.push('Check under-sink for slow leaks monthly (early detection)');
    nudges.push('Clean exhaust fan cover quarterly (airflow + moisture control)');

    // If they have a shower/tub, suggest caulk/grout check
    if (profile?.showerType || profile?.bathroomType) {
      nudges.push('Inspect caulk/grout quarterly (prevent water intrusion)');
    } else {
      nudges.push('Test GFCI outlets quarterly (bathrooms need reliable protection)');
    }

    return nudges.slice(0, 3);
  }, [profile]);

  const hasSnapshot =
    Boolean(profile?.bathroomType) || Boolean(profile?.showerType) || Boolean(profile?.exhaustFan) || Boolean(profile?.gfciPresent);

  return (
    <Card className="rounded-2xl border border-black/10 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Bathroom</div>
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
              <Row label="Bathroom type" value={profile?.bathroomType} />
              <Divider />
              <Row label="Shower / tub" value={profile?.showerType} />
              <Divider />
              <Row label="Exhaust fan" value={profile?.exhaustFan} />
            </>
          ) : (
            <div className="px-4 pb-3 text-sm text-black/60">
              Add basic bathroom details to generate a snapshot.
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
          Bathrooms are moisture-heavy zones: small checks prevent expensive damage.
        </div>
      </CardContent>
    </Card>
  );
}
