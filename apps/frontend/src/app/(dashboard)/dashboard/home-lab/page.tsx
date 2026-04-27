'use client';

import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, TrendingDown, Ghost, PiggyBank, CalendarRange, 
  Hammer, Landmark, BarChart3, Activity, Scale, DollarSign, 
  Info, Zap, Map, Box, Search, HeartPulse, Timer, History, 
  Waves, Sprout, Newspaper, Scroll, CheckCircle2, Layers, 
  ShieldAlert, LayoutGrid, SlidersHorizontal
} from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import { ToolCard } from './components/ToolCard';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const CATEGORIES = [
  'All',
  'Finance & Savings',
  'Risk & Protection',
  'Intelligence & Trends',
  'Lifestyle & Future'
];

interface Tool {
  id: string;
  title: string;
  description: string;
  category: typeof CATEGORIES[number];
  icon: any;
  href: string;
  isNew?: boolean;
}

const TOOLS: Tool[] = [
  // Financial & Savings
  {
    id: 'home-savings',
    title: 'Savings Radar',
    description: 'Find every dollar hidden in your monthly home operating costs.',
    category: 'Finance & Savings',
    icon: PiggyBank,
    href: '/dashboard/home-savings'
  },
  {
    id: 'mortgage-refinance-radar',
    title: 'Refinance Watch',
    description: 'Track interest rates and see exactly when refinancing saves you money.',
    category: 'Finance & Savings',
    icon: Zap,
    href: '/dashboard/mortgage-refinance-radar'
  },
  {
    id: 'property-tax',
    title: 'Tax Appeal Assistant',
    description: 'Check if your property assessment is too high and get help appealing.',
    category: 'Finance & Savings',
    icon: Landmark,
    href: '/dashboard/property-tax'
  },
  {
    id: 'hidden-asset-finder',
    title: 'Asset Explorer',
    description: 'Identify high-value items in your home that qualify for lower insurance rates.',
    category: 'Finance & Savings',
    icon: Search,
    href: '/dashboard/hidden-asset-finder'
  },
  {
    id: 'break-even',
    title: 'Break-Even Calculator',
    description: 'See how long it takes for a home improvement to pay for itself.',
    category: 'Finance & Savings',
    icon: Timer,
    href: '/dashboard/break-even?source=home-lab'
  },
  {
    id: 'price-finalization',
    title: 'Price Guard',
    description: 'Ensure you aren’t overpaying on service contracts and final invoices.',
    category: 'Finance & Savings',
    icon: CheckCircle2,
    href: '/dashboard/price-finalization'
  },
  {
    id: 'quote-comparison',
    title: 'Quote Workspace',
    description: 'Compare multiple contractor bids side-by-side to find the best value.',
    category: 'Finance & Savings',
    icon: Layers,
    href: '/dashboard/quote-comparison'
  },
  
  // Risk & Protection
  {
    id: 'coverage-intelligence',
    title: 'Coverage Pulse',
    description: 'Identify silent gaps in your home insurance before you need to file a claim.',
    category: 'Risk & Protection',
    icon: ShieldCheck,
    href: '/dashboard/coverage-intelligence'
  },
  {
    id: 'risk-premium-optimizer',
    title: 'Premium Lowerer',
    description: 'Fix small home risks that cause insurance companies to charge you more.',
    category: 'Risk & Protection',
    icon: TrendingDown,
    href: '/dashboard/risk-premium-optimizer'
  },
  {
    id: 'do-nothing',
    title: 'The Wait-and-See Cost',
    description: 'See the financial risk of delaying common maintenance tasks.',
    category: 'Risk & Protection',
    icon: Ghost,
    href: '/dashboard/do-nothing-simulator'
  },
  {
    id: 'home-renovation-risk-advisor',
    title: 'Renovation Safety Check',
    description: 'Avoid common pitfalls and insurance issues before you start building.',
    category: 'Risk & Protection',
    icon: Hammer,
    href: '/dashboard/home-renovation-risk-advisor'
  },
  {
    id: 'negotiation-shield',
    title: 'Contract Shield',
    description: 'AI-powered review of service agreements to protect your interests.',
    category: 'Risk & Protection',
    icon: ShieldAlert,
    href: '/dashboard/negotiation-shield'
  },
  {
    id: 'home-digital-will',
    title: 'Legacy Vault',
    description: 'Ensure your home’s records and value are safely transferable to heirs.',
    category: 'Risk & Protection',
    icon: Scroll,
    href: '/dashboard/home-digital-will'
  },

  // Intelligence & Trends
  {
    id: 'neighborhood-change-radar',
    title: 'Market Watch',
    description: 'Track how your neighborhood is changing and what it means for your home value.',
    category: 'Intelligence & Trends',
    icon: Map,
    href: '/dashboard/neighborhood-change-radar'
  },
  {
    id: 'cost-growth',
    title: 'Inflation Tracker',
    description: 'Track how home service and material costs are trending in your area.',
    category: 'Intelligence & Trends',
    icon: Activity,
    href: '/dashboard/cost-growth'
  },
  {
    id: 'insurance-trend',
    title: 'Insurance Market Pulse',
    description: 'See if insurance rates are rising or falling for homes like yours.',
    category: 'Intelligence & Trends',
    icon: BarChart3,
    href: '/dashboard/insurance-trend'
  },
  {
    id: 'sell-hold-rent',
    title: 'Real Estate Strategy',
    description: 'A data-backed look at whether you should sell, hold, or rent your home.',
    category: 'Intelligence & Trends',
    icon: Scale,
    href: '/dashboard/sell-hold-rent'
  },
  {
    id: 'true-cost',
    title: 'True Cost of Ownership',
    description: 'Your actual monthly cost including hidden expenses, maintenance, and taxes.',
    category: 'Intelligence & Trends',
    icon: DollarSign,
    href: '/dashboard/true-cost'
  },
  {
    id: 'cost-explainer',
    title: 'Cost Breakdown',
    description: 'A clear explanation of why your home expenses are what they are.',
    category: 'Intelligence & Trends',
    icon: Info,
    href: '/dashboard/cost-explainer?source=home-lab'
  },
  {
    id: 'cost-volatility',
    title: 'Budget Risk Radar',
    description: 'Identify which of your home expenses are most likely to spike soon.',
    category: 'Intelligence & Trends',
    icon: Waves,
    href: '/dashboard/cost-volatility'
  },
  {
    id: 'capital-timeline',
    title: 'Future Expense Plan',
    description: 'A 10-year outlook of major home replacement costs (roof, HVAC, etc).',
    category: 'Intelligence & Trends',
    icon: History,
    href: '/dashboard/capital-timeline'
  },

  // Lifestyle & Future
  {
    id: 'home-event-radar',
    title: 'Local Impact Events',
    description: 'Storms, outages, and local events that might affect your home today.',
    category: 'Lifestyle & Future',
    icon: CalendarRange,
    href: '/dashboard/home-event-radar'
  },
  {
    id: 'home-digital-twin',
    title: 'Digital Home Model',
    description: 'A visual map of your home’s systems, rooms, and critical shut-off valves.',
    category: 'Lifestyle & Future',
    icon: Box,
    href: '/dashboard/home-digital-twin'
  },
  {
    id: 'home-habit-coach',
    title: 'Habit Coach',
    description: 'Small daily routines that extend the life of your appliances.',
    category: 'Lifestyle & Future',
    icon: HeartPulse,
    href: '/dashboard/home-habit-coach'
  },
  {
    id: 'plant-advisor',
    title: 'GreenThumb',
    description: 'Personalized plant suggestions based on your home’s climate and layout.',
    category: 'Lifestyle & Future',
    icon: Sprout,
    href: '/dashboard/plant-advisor'
  },
  {
    id: 'home-gazette',
    title: 'The Home Gazette',
    description: 'A weekly personalized digest of news relevant to your specific property.',
    category: 'Lifestyle & Future',
    icon: Newspaper,
    href: '/dashboard/home-gazette'
  }
];

export default function HomeLabPage() {
  const { selectedPropertyId } = usePropertyContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredTools = useMemo(() => {
    return TOOLS.filter(tool => {
      const matchesSearch = tool.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           tool.description.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || tool.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  return (
    <div className="space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-brand-600 font-bold text-[10px] tracking-normal">
            <LayoutGrid className="h-3.5 w-3.5" />
            Home Lab
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Expert Tools</h1>
          <p className="text-slate-500 max-w-2xl">
            A library of specialized intelligence and analysis tools built for high-performance homeowners.
          </p>
        </div>
      </div>

      {/* Search & Filter Bar */}
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
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
          <SlidersHorizontal className="h-4 w-4 text-slate-400 mr-1 flex-shrink-0" />
          {CATEGORIES.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-semibold transition-all",
                selectedCategory === category
                  ? "bg-brand-600 text-white shadow-md shadow-brand-100"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-brand-200 hover:text-brand-600"
              )}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Tools Grid */}
      {filteredTools.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredTools.map((tool) => (
            <ToolCard
              key={tool.id}
              title={tool.title}
              description={tool.description}
              category={tool.category}
              icon={tool.icon}
              href={buildPropertyAwareDashboardHref(selectedPropertyId, tool.href)}
              isNew={tool.isNew}
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

      {/* Footer Note */}
      <div className="rounded-2xl bg-teal-50/50 border border-brand-100 p-6 text-center">
        <p className="text-sm text-brand-800 font-medium">
          New expert tools are added monthly based on the latest home data and product signals.
        </p>
      </div>
    </div>
  );
}
