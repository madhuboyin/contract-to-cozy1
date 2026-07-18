'use client';

// apps/frontend/src/app/(dashboard)/dashboard/admin/page.tsx
//
// ADMIN landing dashboard (ADMIN_MODULE_FRD.md §17 Phase 1): global search
// across viewable domains, live work-queue tiles, and the full workspace
// grid. Search results and queue counts respect the actor's capabilities
// server-side; each linked workspace re-enforces its own capability.

import React, { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Loader2, Search } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell } from '@/components/ops/AdminConsoleShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAdminWorkQueues } from '@/hooks/useAdminWorkQueues';
import { adminGlobalSearch } from '@/lib/api/adminSearch';
import { ADMIN_NAV } from '@/lib/navigation/adminNavigation';

const TYPE_BADGE: Record<string, string> = {
  USER: 'bg-sky-50 text-sky-700',
  PROVIDER: 'bg-indigo-50 text-indigo-700',
  BOOKING: 'bg-emerald-50 text-emerald-700',
  CASE: 'bg-amber-50 text-amber-700',
  PRIVACY_REQUEST: 'bg-rose-50 text-rose-700',
};

export default function AdminLandingPage() {
  const guard = useAdminGuard({
    title: 'Admin Console',
    subtitle: 'Search, queues, and workspaces.',
  });

  const [query, setQuery] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const queuesQ = useAdminWorkQueues();
  const searchQ = useQuery({
    queryKey: ['admin-global-search', searchTerm],
    queryFn: () => adminGlobalSearch(searchTerm),
    enabled: searchTerm.trim().length > 0,
    staleTime: 15_000,
  });

  if (guard.status !== 'ready') return guard.node;

  const actionableQueues = (queuesQ.data?.queues ?? []).filter((q) => q.count > 0);

  return (
    <AdminConsoleShell
      title="Admin Console"
      subtitle="Search across your domains, see where work is waiting, and jump into a workspace."
      chips={
        <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          <LayoutDashboard className="h-3 w-3" />
          {ADMIN_NAV.length} workspaces
        </span>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearchTerm(query);
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search users, providers, bookings, cases, privacy requests…"
          className="h-10 max-w-xl text-sm"
        />
        <Button type="submit" size="sm" className="h-10" disabled={!query.trim()}>
          <Search className="mr-1.5 h-4 w-4" />
          Search
        </Button>
      </form>

      {searchTerm ? (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {searchQ.isLoading ? (
            <div className="flex items-center gap-2 p-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
            </div>
          ) : null}
          {searchQ.isError ? <p className="p-2 text-xs text-rose-600">Search failed. Try again.</p> : null}
          {searchQ.data && searchQ.data.length === 0 ? (
            <p className="p-2 text-xs text-slate-400">
              Nothing matched &ldquo;{searchTerm}&rdquo; in the domains you can view.
            </p>
          ) : null}
          <ul className="divide-y divide-slate-50">
            {(searchQ.data ?? []).map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <Link href={r.href} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50">
                  <Badge className={`text-[10px] ${TYPE_BADGE[r.type] ?? ''}`}>{r.type.replace('_', ' ')}</Badge>
                  <span className="text-xs font-semibold text-slate-800">{r.label}</span>
                  <span className="text-xs text-slate-400">{r.sublabel}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actionableQueues.length > 0 ? (
        <div className="mt-6">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Work waiting</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {actionableQueues.map((q) => (
              <Link
                key={q.key}
                href={q.href}
                className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300"
              >
                <p className="text-xl font-semibold text-slate-900">{q.count}</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-600">{q.label}</p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Workspaces</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_NAV.filter((item) => item.key !== 'admin-home').map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300"
              >
                <span className="rounded-lg bg-slate-100 p-2">
                  <Icon className="h-4 w-4 text-slate-600" />
                </span>
                <span>
                  <p className="text-xs font-semibold text-slate-800">{item.name}</p>
                  <p className="text-[11px] text-slate-500">{item.description}</p>
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </AdminConsoleShell>
  );
}
