// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { TrendingUp, Shield, DollarSign, Info, PanelBottomOpen ,Calculator, Scale, Activity, Target} from 'lucide-react';

// shadcn/ui (already used elsewhere in your app)
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type ToolDef = {
  key: string;
  label: string;
  href: (propertyId: string) => string;
  Icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
};

const HOME_TOOLS: ToolDef[] = [
  {
    key: 'property-tax',
    label: 'Property Tax',
    href: (id) => `/dashboard/properties/${id}/tools/property-tax`,
    Icon: DollarSign,
    tooltip: 'Estimate tax trend and reassessment drivers for your state/ZIP.',
  },
  {
    key: 'cost-growth',
    label: 'Cost Growth',
    href: (id) => `/dashboard/properties/${id}/tools/cost-growth`,
    Icon: TrendingUp,
    tooltip: 'Compare appreciation vs expenses to understand net ownership cost trend.',
  },
  {
    key: 'insurance-trend',
    label: 'Insurance Trend',
    href: (id) => `/dashboard/properties/${id}/tools/insurance-trend`,
    Icon: Shield,
    tooltip: 'See insurance cost growth vs state average and localized climate pressure.',
  },
  {
    key: 'cost-explainer',
    label: 'Cost Explainer',
    href: (id) => `/dashboard/properties/${id}/tools/cost-explainer`,
    Icon: Info,
    tooltip: 'Plain-English reasons why taxes/insurance/maintenance are rising.',
  },
  {
    key: 'true-cost',
    label: 'True Cost',
    href: (id) => `/dashboard/properties/${id}/tools/true-cost`,
    Icon: Calculator,
    tooltip: '5-year total ownership cost projection: tax + insurance + maintenance + utilities.',
  },
  {
    key: 'sell-hold-rent',
    label: 'Sell / Hold / Rent',
    href: (id) => `/dashboard/properties/${id}/tools/sell-hold-rent`,
    Icon: Scale,
    tooltip: 'Compare Sell vs Hold vs Rent outcomes over 5y or 10y using appreciation, ownership costs, and rent assumptions.',
  },  
  {
    key: 'cost-volatility',
    label: 'Volatility',
    href: (id) => `/dashboard/properties/${id}/tools/cost-volatility`,
    Icon: Activity,
    tooltip: 'How unpredictable your costs are year-to-year.',
  },
  {
    key: 'break-even',
    label: 'Break-Even',
    href: (id) => `/dashboard/properties/${id}/tools/break-even`,
    Icon: Target,
    tooltip: 'Find the year when appreciation outweighs cumulative ownership costs.',
  },
  
];

function isActivePath(pathname: string, href: string) {
  // Active if you’re on the tool route or any nested sub-route
  return pathname === href || pathname.startsWith(`${href}/`);
}

function ToolButton({
  href,
  label,
  Icon,
  tooltip,
  active,
}: {
  href: string;
  label: string;
  Icon: ToolDef['Icon'];
  tooltip: string;
  active: boolean;
}) {
  const base = 'gap-2 rounded-full border border-black/10 bg-white hover:bg-black/[0.03]';
  const activeCls = 'bg-black/[0.06] border-black/20 text-black font-medium';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          asChild
          variant="outline"
          size="sm"
          className={`${base} ${active ? activeCls : ''}`}
        >
          <Link href={href}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        </Button>
      </TooltipTrigger>

      <TooltipContent side="bottom" align="center">
        <div className="max-w-[260px] text-xs leading-5">{tooltip}</div>
      </TooltipContent>
    </Tooltip>
  );
}

export default function HomeToolsRail({
  propertyId,
  showLabel = true,
}: {
  propertyId: string;
  showLabel?: boolean;
}) {
  const pathname = usePathname() || '';

  const tools = HOME_TOOLS.map((t) => {
    const href = t.href(propertyId);
    return { ...t, hrefResolved: href, active: isActivePath(pathname, href) };
  });

  return (
    <TooltipProvider delayDuration={120}>
      {/* Desktop rail */}
      <div className="hidden md:block">
        {showLabel && (
          <div className="text-xs uppercase tracking-wide text-black/60 mb-1">
            Home Tools
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {tools.map((t) => (
            <ToolButton
              key={t.key}
              href={t.hrefResolved}
              label={t.label}
              Icon={t.Icon}
              tooltip={t.tooltip}
              active={t.active}
            />
          ))}
        </div>
      </div>

      {/* Mobile: hide rail, show bottom sheet */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full border border-black/10 bg-white"
            >
              <PanelBottomOpen className="h-4 w-4" />
              Home Tools
            </Button>
          </SheetTrigger>

          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Home Tools</SheetTitle>
            </SheetHeader>

            <div className="mt-4 space-y-2">
              {tools.map((t) => (
                <Link key={t.key} href={t.hrefResolved} className="block">
                  <div
                    className={`rounded-xl border p-3 ${
                      t.active
                        ? 'border-black/20 bg-black/[0.04]'
                        : 'border-black/10 bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <t.Icon className="h-4 w-4 text-black/70" />
                      <div className="text-sm font-medium">{t.label}</div>
                    </div>
                    <div className="mt-1 text-xs text-black/60 leading-5">
                      {t.tooltip}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}
