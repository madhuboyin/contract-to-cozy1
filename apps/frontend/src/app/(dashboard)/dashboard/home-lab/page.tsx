'use client';

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal, LayoutGrid } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { MOBILE_HOME_TOOL_LINKS } from '@/components/mobile/dashboard/mobileToolCatalog';
import { ToolCard } from './components/ToolCard';
import { ScrollFadeX } from '@/components/ui/ScrollFadeX';

const HOME_TOOL_GROUPS = [
  {
    key: 'monitoring',
    title: 'Monitoring + Awareness',
    toolKeys: ['home-event-radar', 'neighborhood-change-radar'],
  },
  {
    key: 'history',
    title: 'History + Replay',
    toolKeys: ['home-risk-replay'],
  },
  {
    key: 'negotiation',
    title: 'Negotiation + Review',
    toolKeys: ['service-price-radar', 'negotiation-shield', 'price-finalization'],
  },
  {
    key: 'ownership',
    title: 'Ownership Strategy',
    toolKeys: [
      'property-tax',
      'cost-growth',
      'insurance-trend',
      'cost-explainer',
      'true-cost',
      'sell-hold-rent',
      'cost-volatility',
      'break-even',
      'mortgage-refinance-radar',
      'financing',
    ],
  },
  {
    key: 'renovation',
    title: 'Renovation Planning',
    toolKeys: ['home-renovation-risk-advisor', 'diy', 'permits', 'hoa-compliance', 'inspection-hub', 'project-tracker'],
  },
  {
    key: 'timeline',
    title: 'Readiness + Timeline',
    toolKeys: ['capital-timeline', 'reserve-fund', 'seller-prep', 'home-timeline', 'status-board'],
  },
  {
    key: 'habits',
    title: 'Home Habits',
    toolKeys: ['home-habit-coach', 'plant-advisor'],
  },
  {
    key: 'records',
    title: 'Property Records',
    toolKeys: ['material-specs'],
  },
] as const;

const TOOL_BY_KEY = new Map(MOBILE_HOME_TOOL_LINKS.map((t) => [t.key, t]));

const GROUPED_TOOLS = HOME_TOOL_GROUPS.map((group) => ({
  ...group,
  items: group.toolKeys
    .map((key) => TOOL_BY_KEY.get(key))
    .filter((t): t is (typeof MOBILE_HOME_TOOL_LINKS)[number] => Boolean(t)),
})).filter((g) => g.items.length > 0);

const ALL_TOOLS = GROUPED_TOOLS.flatMap((group) =>
  group.items.map((tool) => ({ ...tool, groupTitle: group.title }))
);

const CATEGORIES = ['All', ...HOME_TOOL_GROUPS.map((g) => g.title)];

function buildPropertyAwareHref(
  propertyId: string | undefined,
  hrefSuffix: string,
  navTarget: string,
): string {
  if (propertyId) {
    return `/dashboard/properties/${propertyId}/${hrefSuffix}`;
  }
  return `/dashboard/properties?navTarget=${encodeURIComponent(navTarget)}`;
}

export default function HomeLabPage() {
  const searchParams = useSearchParams();
  const { selectedPropertyId } = usePropertyContext();
  const propertyIdFromQuery = searchParams.get('propertyId') || undefined;
  const resolvedPropertyId = selectedPropertyId || propertyIdFromQuery;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredTools = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return ALL_TOOLS.filter((tool) => {
      const matchesSearch =
        !q ||
        tool.name.toLowerCase().includes(q) ||
        (tool.desktopDescription ?? tool.description).toLowerCase().includes(q);
      const matchesCategory = selectedCategory === 'All' || tool.groupTitle === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-[11px] tracking-normal">
            <LayoutGrid className="h-3.5 w-3.5" />
            Home Lab
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Expert Tools</h1>
          <p className="text-slate-500 max-w-2xl">
            A library of specialized intelligence and analysis tools built for high-performance homeowners.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search all expert tools..."
            className="h-11 pl-10 pr-4 rounded-xl border-slate-200 bg-white shadow-sm focus:ring-brand-500"
          />
        </div>
        <ScrollFadeX fromColor="from-white">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
          <SlidersHorizontal className="h-4 w-4 text-slate-400 mr-1 flex-shrink-0" />
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                'whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all',
                selectedCategory === category
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-100'
                  : 'bg-white border border-slate-200 text-slate-600 hover:border-brand-200 hover:text-brand-600',
              )}
            >
              {category}
            </button>
          ))}
        </div>
        </ScrollFadeX>
      </div>

      {filteredTools.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.key}
              title={tool.name}
              description={tool.desktopDescription ?? tool.description}
              category={tool.groupTitle}
              icon={tool.icon}
              href={buildPropertyAwareHref(resolvedPropertyId, tool.hrefSuffix, tool.navTarget)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-3xl border border-dashed border-slate-300">
          <div className="mb-4 rounded-full bg-slate-50 p-4">
            <Search className="h-8 w-8 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900">No tools found</h3>
          <p className="text-sm text-slate-500 max-w-xs">
            We couldn&apos;t find any expert tools matching &quot;{searchQuery}&quot;. Try a different term or category.
          </p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory('All'); }}
            className="mt-6 text-sm font-bold text-brand-600 hover:text-brand-700 underline underline-offset-4"
          >
            Clear all filters
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-teal-50/50 border border-brand-100 p-6 text-center">
        <p className="text-sm text-brand-800 font-medium">
          New expert tools are added monthly based on the latest home data and product signals.
        </p>
      </div>
    </div>
  );
}
