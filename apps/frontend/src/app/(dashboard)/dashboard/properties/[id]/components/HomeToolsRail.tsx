// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/components/HomeToolsRail.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { PanelBottomOpen } from 'lucide-react';
import { MOBILE_HOME_TOOL_LINKS } from '@/components/mobile/dashboard/mobileToolCatalog';
import RelatedTools from '@/components/tools/RelatedTools';
import HomeToolHeader from '@/components/tools/HomeToolHeader';
import type { PageContextId } from '@/features/tools/contextToolMappings';
import type { ToolId } from '@/features/tools/toolRegistry';
import { getContextToolId } from '@/features/tools/getRelatedTools';
import { resolvePageContext } from '@/features/tools/resolvePageContext';

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
  Icon: React.ElementType;
  tooltip: string;
};

const HOME_TOOLS: ToolDef[] = MOBILE_HOME_TOOL_LINKS
  .filter((tool) => !tool.workflowOnly)
  .map((tool) => ({
    key: tool.key,
    label: tool.name,
    href: (propertyId) => `/dashboard/properties/${propertyId}/${tool.hrefSuffix}`,
    Icon: tool.icon,
    tooltip: tool.description,
  }));

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
  context,
  currentToolId,
  showDesktop = true,
}: {
  propertyId: string;
  context?: PageContextId | null;
  currentToolId?: ToolId | null;
  showDesktop?: boolean;
}) {
  const pathname = usePathname() || '';
  const resolvedContext = resolvePageContext({ pathname, explicitContext: context });
  const resolvedToolId = currentToolId ?? getContextToolId(resolvedContext);
  const relatedToolsContext: PageContextId = context ?? resolvedContext ?? 'property-hub';
  const relatedToolsCurrentToolId = currentToolId ?? getContextToolId(relatedToolsContext);

  const tools = HOME_TOOLS.map((t) => {
    const href = t.href(propertyId);
    return { ...t, hrefResolved: href, active: isActivePath(pathname, href) };
  });

  return (
    <TooltipProvider delayDuration={120}>
      {/* Desktop rail */}
      {showDesktop ? (
        <div className="hidden lg:block">
          {resolvedToolId ? (
            <HomeToolHeader
              toolId={resolvedToolId}
              propertyId={propertyId}
              context={resolvedContext}
              currentToolId={resolvedToolId}
            />
          ) : (
            <RelatedTools
              propertyId={propertyId}
              context={relatedToolsContext}
              currentToolId={relatedToolsCurrentToolId}
              minViewport="lg"
            />
          )}
        </div>
      ) : null}

      {/* Mobile: hide rail, show bottom sheet */}
      <div className="lg:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 rounded-full border border-black/10 bg-white"
            >
              <PanelBottomOpen className="h-4 w-4" />
              Home tools
            </Button>
          </SheetTrigger>

          <SheetContent side="bottom" className="rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>Home tools</SheetTitle>
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
