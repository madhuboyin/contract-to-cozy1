'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { AdminConsoleShell } from '@/components/ops/AdminConsoleShell';
import type { AdminDiyTemplateSummary, DiyTemplateStatus, DiyProjectCategory } from '@/types';
import AdminTemplateTable from '@/components/features/diy/admin/AdminTemplateTable';

const CATEGORIES: { value: DiyProjectCategory; label: string }[] = [
  { value: 'HVAC', label: 'HVAC' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'GENERAL', label: 'General' },
  { value: 'EXTERIOR', label: 'Exterior' },
  { value: 'FLOORING', label: 'Flooring' },
  { value: 'APPLIANCE', label: 'Appliances' },
  { value: 'LANDSCAPING', label: 'Landscaping' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_TABS: { value: DiyTemplateStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export default function AdminDiyTemplatesPage() {
  const guard = useAdminGuard({
    title: 'DIY Templates',
    subtitle: 'Manage DIY project templates shown to homeowners.',
  });
  const router = useRouter();

  const [templates, setTemplates] = useState<AdminDiyTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DiyTemplateStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<DiyProjectCategory | ''>('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.adminListDiyTemplates({
      ...(statusFilter && { status: statusFilter }),
      ...(categoryFilter && { category: categoryFilter }),
      ...(search && { search }),
      limit: 100,
    }).catch(() => ({ items: [] }));
    setTemplates(res.items);
    setLoading(false);
  }, [statusFilter, categoryFilter, search]);

  useEffect(() => {
    if (!guard.isAdmin) return;
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [guard.isAdmin, load]);

  function handleStatusChange(id: string, status: DiyTemplateStatus) {
    setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, status } : t));
  }

  function handleDuplicate(_newId: string) {
    // Navigate happens inside TemplateStatusActions; just refresh list on return
  }

  if (guard.status !== 'ready') return guard.node;

  return (
    <AdminConsoleShell
      title="DIY Templates"
      subtitle="Manage DIY project templates shown to homeowners."
      actions={
        <button
          onClick={() => router.push('/dashboard/admin/diy/templates/new')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Template
        </button>
      }
    >
      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Status tabs */}
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as DiyProjectCategory | '')}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700 focus:border-blue-500 focus:outline-none"
        >
          <option value="">All Categories</option>
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title…"
          className="flex-1 min-w-[200px] rounded-lg border border-neutral-200 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-neutral-400">Loading…</div>
      ) : (
        <AdminTemplateTable
          templates={templates}
          onStatusChange={handleStatusChange}
          onDuplicate={handleDuplicate}
        />
      )}
    </AdminConsoleShell>
  );
}
