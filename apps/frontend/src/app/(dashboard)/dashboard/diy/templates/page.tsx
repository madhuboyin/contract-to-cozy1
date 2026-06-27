'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import type { DiyTemplateSummary, DiyProjectCategory, DiyDifficultyLevel } from '@/types';
import TemplateCard from '@/components/features/diy/TemplateCard';

const CATEGORIES: DiyProjectCategory[] = ['HVAC', 'PLUMBING', 'ELECTRICAL', 'PAINTING', 'GENERAL', 'EXTERIOR', 'FLOORING', 'APPLIANCE', 'LANDSCAPING'];
const DIFFICULTIES: { value: DiyDifficultyLevel; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'HARD', label: 'Hard' },
];

export default function TemplateLibraryPage() {
  const searchParams = useSearchParams();
  const propertyId = searchParams.get('propertyId') ?? '';

  const [templates, setTemplates] = useState<DiyTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<DiyProjectCategory | ''>('');
  const [difficulty, setDifficulty] = useState<DiyDifficultyLevel | ''>('');

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api.listDiyTemplates({
      ...(category && { category }),
      ...(difficulty && { difficulty }),
      ...(search && { search }),
      limit: 50,
    }).catch(() => ({ items: [], nextCursor: undefined }));
    setTemplates(result.items);
    setLoading(false);
  }, [category, difficulty, search]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="space-y-4 p-4 pb-10">
      <h1 className="text-xl font-bold">Project Library</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Search projects…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--mobile-brand-strong))]"
      />

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${!category ? 'bg-[hsl(var(--mobile-brand-strong))] text-white border-[hsl(var(--mobile-brand-strong))]' : 'border-neutral-200 text-neutral-600'}`}
        >
          All
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(category === c ? '' : c)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border ${category === c ? 'bg-[hsl(var(--mobile-brand-strong))] text-white border-[hsl(var(--mobile-brand-strong))]' : 'border-neutral-200 text-neutral-600'}`}
          >
            {c === 'HVAC' ? 'HVAC' : c.charAt(0) + c.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Difficulty filter */}
      <div className="flex gap-2">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => setDifficulty(difficulty === d.value ? '' : d.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium border ${difficulty === d.value ? 'bg-neutral-800 text-white border-neutral-800' : 'border-neutral-200 text-neutral-600'}`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-200 border-t-[hsl(var(--mobile-brand-strong))]" />
        </div>
      ) : templates.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No templates found</p>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} propertyId={propertyId} />
          ))}
        </div>
      )}
    </div>
  );
}
