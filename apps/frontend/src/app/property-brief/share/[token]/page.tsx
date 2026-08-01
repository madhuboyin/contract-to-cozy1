'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Download, FileCheck2, LockKeyhole } from 'lucide-react';
import { api } from '@/lib/api/client';

type SharedBrief = {
  title: string;
  purpose: string;
  asOf: string;
  excludedSections: string[];
  limitationStatement: string;
  expiresAt: string;
  downloadPolicy: 'VIEW_ONLY' | 'ALLOW_DOWNLOAD';
  property: { name: string | null; city: string; state: string };
  sections: Array<{
    id: string;
    title: string;
    sensitive: boolean;
    asOf: string;
    payload: { items?: Array<Record<string, unknown> & { key: string }>; excludedFields?: string[]; completenessBoundary?: string };
    evidenceLinks: Array<{ itemKey: string; sourceLabel: string; sourceAsOf: string; verification: string }>;
  }>;
};

function humanize(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Not recorded';
  return String(value).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemSummary(item: Record<string, unknown>) {
  return Object.entries(item)
    .filter(([key, value]) => !['key', 'asOf', 'source', 'verification'].includes(key) && value !== null && value !== undefined)
    .map(([key, value]) => `${humanize(key)}: ${humanize(value)}`)
    .join(' · ');
}

export default function SharedPropertyBriefPage() {
  const params = useParams<{ token: string }>();
  const query = useQuery({
    queryKey: ['shared-property-brief', params.token],
    queryFn: async () => {
      const response = await api.get(`/api/property-briefs/shares/${encodeURIComponent(params.token)}`);
      return response.data as SharedBrief;
    },
    enabled: Boolean(params.token),
    retry: false,
  });

  if (query.isLoading) {
    return <main className="mx-auto min-h-screen max-w-3xl p-6 text-sm text-slate-600">Loading Property Brief…</main>;
  }
  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
        <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-700" />
          <h1 className="mt-3 text-xl font-semibold text-slate-950">This Property Brief is unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">The controlled link may have expired or been revoked.</p>
        </section>
      </main>
    );
  }
  const brief = query.data;

  return (
    <main className="mx-auto min-h-screen max-w-3xl space-y-5 bg-slate-50 p-4 pb-16 sm:p-6">
      <header className="rounded-2xl border border-sky-200 bg-white p-6 shadow-sm">
        <FileCheck2 className="h-6 w-6 text-sky-700" />
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-sky-700">Property Brief</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-950">{brief.title}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {brief.property.name ?? 'Home'} · {brief.property.city}, {brief.property.state}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Purpose: {humanize(brief.purpose)} · Snapshot as of {new Date(brief.asOf).toLocaleString()} ·
          Expires {new Date(brief.expiresAt).toLocaleString()}
        </p>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">
          Explicitly excluded: {brief.excludedSections.length > 0
            ? brief.excludedSections.map(humanize).join(', ')
            : 'No template sections'}.
        </p>
        {brief.downloadPolicy === 'ALLOW_DOWNLOAD' && (
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/property-briefs/shares/${encodeURIComponent(params.token)}/download`}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
          >
            <Download className="h-4 w-4" /> Download this snapshot
          </a>
        )}
      </header>

      {brief.sections.map((section) => {
        const evidence = new Map(section.evidenceLinks.map((item) => [item.itemKey, item]));
        return (
          <section key={section.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">{section.title}</h2>
                <p className="mt-1 text-xs text-slate-500">As of {new Date(section.asOf).toLocaleString()}</p>
              </div>
              {section.sensitive && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                  <LockKeyhole className="h-3 w-3" /> Sensitive
                </span>
              )}
            </div>
            <div className="mt-4 space-y-3">
              {(section.payload.items ?? []).length === 0 && (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No eligible records were included.</p>
              )}
              {(section.payload.items ?? []).map((item) => {
                const proof = evidence.get(item.key);
                return (
                  <article key={item.key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-900">{itemSummary(item)}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Source: {proof?.sourceLabel ?? humanize(item.source)} · As of{' '}
                      {new Date(proof?.sourceAsOf ?? String(item.asOf)).toLocaleDateString()} ·{' '}
                      {humanize(proof?.verification ?? item.verification)}
                    </p>
                  </article>
                );
              })}
              {section.payload.completenessBoundary && (
                <p className="text-xs leading-5 text-slate-500">{section.payload.completenessBoundary}</p>
              )}
              {section.payload.excludedFields && (
                <p className="text-xs leading-5 text-slate-500">
                  Excluded fields: {section.payload.excludedFields.join(', ')}.
                </p>
              )}
            </div>
          </section>
        );
      })}

      <aside className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-xs leading-5 text-amber-950">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">Important limitations</p>
            <p className="mt-1">{brief.limitationStatement}</p>
          </div>
        </div>
      </aside>
    </main>
  );
}
