'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileCheck2 } from 'lucide-react';
import { api } from '@/lib/api/client';

type SelectedBriefingShare = {
  property: { name: string | null; city: string; state: string };
  generatedAt: string;
  baselineVersion: string;
  items: Array<{
    id: string;
    topic: string;
    title: string;
    summary: string;
    materiality: string;
    sourceLineage: Record<string, unknown>;
  }>;
  sharingBoundary: string;
  expiresAt: string;
};

function humanize(value: string) {
  return value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function SelectedHomeBriefingSharePage() {
  const params = useParams<{ token: string }>();
  const query = useQuery({
    queryKey: ['public-home-briefing-share', params.token],
    queryFn: async () => {
      const response = await api.get(`/api/home-briefing/share/${encodeURIComponent(params.token)}`);
      return response.data as SelectedBriefingShare;
    },
    enabled: Boolean(params.token),
  });

  if (query.isLoading) {
    return <main className="mx-auto min-h-screen max-w-2xl p-6 text-sm text-slate-600">Loading selected briefing items…</main>;
  }
  if (query.isError || !query.data) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
        <section className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <AlertTriangle className="h-5 w-5 text-rose-700" />
          <h1 className="mt-3 text-xl font-semibold text-slate-950">This briefing share is unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">The link may have expired or been revoked.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-5 bg-slate-50 p-6">
      <header className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-sm">
        <FileCheck2 className="h-5 w-5 text-indigo-700" />
        <h1 className="mt-3 text-xl font-semibold text-slate-950">Selected Home Briefing items</h1>
        <p className="mt-1 text-sm text-slate-600">
          {query.data.property.name ?? 'Home'} · {query.data.property.city}, {query.data.property.state}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Generated {new Date(query.data.generatedAt).toLocaleString()} · expires {new Date(query.data.expiresAt).toLocaleString()}
        </p>
      </header>

      {query.data.items.map((item) => (
        <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{humanize(item.materiality)}</span>
            <span>·</span>
            <span>{humanize(item.topic)}</span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-slate-950">{item.title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">{item.summary}</p>
        </article>
      ))}

      <aside className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
        {query.data.sharingBoundary}
      </aside>
    </main>
  );
}
