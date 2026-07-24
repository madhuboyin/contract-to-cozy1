'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { buildPropertyAwareDashboardHref } from '@/lib/routes/dashboardPropertyAwareHref';
import { ADMIN_NAV } from '@/lib/navigation/adminNavigation';
import { Command } from 'cmdk';
import { getDiscoverableTools } from '@/features/tools/toolDiscoveryRegistry';
import { useToolDiscoveryAvailability } from '@/features/tools/useToolDiscoveryAvailability';
import { track } from '@/lib/analytics/events';
import { useCapabilityCatalog } from '@/features/tools/useCapabilityCatalog';
import {
  appendCapabilityLaunchContext,
  capabilityCatalogSource,
  capabilitySearchTerms,
} from '@/features/tools/capabilityCatalog';
import { useCapabilityImpression } from '@/features/tools/useCapabilityImpression';

type CommandItem = {
  id: string;
  label: string;
  href: string;
  group: 'Navigation' | 'Recent Actions' | 'Quick Shortcuts' | 'Tools';
  keywords?: string[];
  toolId?: string;
};

type DashboardCommandPaletteProps = {
  propertyId?: string;
};

function CapabilityCommandItem({
  item,
  propertyId,
  registryVersion,
  onSelect,
}: {
  item: CommandItem;
  propertyId?: string;
  registryVersion: string;
  onSelect: (item: CommandItem) => void;
}) {
  const impressionRef = useCapabilityImpression<HTMLDivElement>({
    capabilityId: item.toolId!,
    propertyId,
    surface: 'command_palette',
    registryVersion,
  });
  return (
    <Command.Item
      ref={impressionRef}
      value={item.label}
      keywords={[item.group, item.href, ...(item.keywords ?? [])]}
      onSelect={() => onSelect(item)}
      className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm text-gray-700 outline-none transition-colors data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
    >
      {item.label}
    </Command.Item>
  );
}

const PROPERTY_ID_IN_PATH = /\/dashboard\/properties\/([^/]+)/;

function readRecentActions(): Array<{ id: string; label: string }> {
  if (typeof window === 'undefined') return [];
  const items: Array<{ id: string; label: string; createdAt: number }> = [];
  const prefix = 'ctc:actioncenter:recent:';

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith(prefix)) continue;

    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        actionId?: string;
        actionTitle?: string;
        createdAt?: number;
        dismissed?: boolean;
      };
      if (!parsed.actionId || !parsed.actionTitle || parsed.dismissed) continue;
      items.push({
        id: parsed.actionId,
        label: parsed.actionTitle,
        createdAt: Number(parsed.createdAt || 0),
      });
    } catch {
      // Ignore malformed cache entries.
    }
  }

  return items
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 5)
    .map(({ id, label }) => ({ id, label }));
}

function fuzzyScore(text: string, query: string): number {
  const source = text.toLowerCase();
  const target = query.trim().toLowerCase();
  if (!target) return 1;
  if (source.includes(target)) return 2;

  let fromIndex = 0;
  for (const char of target) {
    const foundAt = source.indexOf(char, fromIndex);
    if (foundAt === -1) return 0;
    fromIndex = foundAt + 1;
  }
  return 1;
}

export default function DashboardCommandPalette({ propertyId }: DashboardCommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { selectedPropertyId } = usePropertyContext();
  const availabilityQuery = useToolDiscoveryAvailability();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [recentActions, setRecentActions] = React.useState<Array<{ id: string; label: string }>>([]);
  const resolvedPropertyId =
    propertyId ||
    selectedPropertyId ||
    pathname?.match(PROPERTY_ID_IN_PATH)?.[1];
  const isAdminNav = user?.role === 'ADMIN';
  const catalogSource = capabilityCatalogSource();
  const capabilityCatalogQuery = useCapabilityCatalog(
    { propertyId: resolvedPropertyId },
    { enabled: catalogSource === 'canonical' && !isAdminNav },
  );

  React.useEffect(() => {
    setRecentActions(readRecentActions());
  }, [open]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  React.useEffect(() => {
    const onOpenRequest = () => setOpen(true);
    window.addEventListener('ctc-command-palette-open', onOpenRequest);
    return () => window.removeEventListener('ctc-command-palette-open', onOpenRequest);
  }, []);

  const propertyRoomsHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}/rooms`
    : '/dashboard/properties?navTarget=rooms';
  const inventoryHref = buildPropertyAwareDashboardHref(resolvedPropertyId, '/dashboard/inventory');
  const resolutionCenterHref = buildPropertyAwareDashboardHref(
    resolvedPropertyId,
    '/dashboard/resolution-center'
  );
  const riskReportHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}/risk-assessment`
    : '/dashboard/properties';

  const items = React.useMemo<CommandItem[]>(() => {
    // Admin gets its own dedicated command list — not the homeowner nav
    // plus an extra admin item. No property-scoped "Recent Actions" or
    // "Quick Shortcuts" either, since those are homeowner-tool concepts.
    if (isAdminNav) {
      return ADMIN_NAV.map((job) => ({
        id: `nav-${job.key}`,
        label: job.name,
        href: job.href,
        group: 'Navigation' as const,
      }));
    }

    const navItems: CommandItem[] = [
      { id: 'nav-home', label: 'Home', href: '/dashboard', group: 'Navigation' },
      { id: 'nav-plan-projects', label: 'Plan & Projects', href: '/dashboard/actions', group: 'Navigation' },
      { id: 'nav-home-record', label: 'Home Record', href: '/dashboard/properties', group: 'Navigation' },
      { id: 'nav-ask', label: 'Ask', href: '/dashboard/ask', group: 'Navigation' },
      { id: 'nav-settings', label: 'Profile & Settings', href: '/dashboard/profile', group: 'Navigation' },
    ];

    const recent: CommandItem[] = recentActions.map((action, index) => ({
      id: `recent-${action.id}-${index}`,
      label: action.label,
      href: `/dashboard/actions${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`,
      group: 'Recent Actions',
    }));

    const quick: CommandItem[] = [
      {
        id: 'quick-add-maintenance',
        label: 'Add maintenance task',
        href: `/dashboard/maintenance-setup${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`,
        group: 'Quick Shortcuts',
      },
      { id: 'quick-book-pro', label: 'Book a Pro', href: '/dashboard/providers', group: 'Quick Shortcuts' },
      { id: 'quick-risk-report', label: 'View risk report', href: riskReportHref, group: 'Quick Shortcuts' },
      { id: 'quick-rooms', label: 'Open rooms', href: propertyRoomsHref, group: 'Quick Shortcuts' },
      { id: 'quick-inventory', label: 'Open inventory', href: inventoryHref, group: 'Quick Shortcuts' },
      { id: 'quick-resolution-center', label: 'Open resolution center', href: resolutionCenterHref, group: 'Quick Shortcuts' },
      {
        id: 'quick-explore-tools',
        label: 'Explore all home tools',
        href: `/dashboard/home-tools${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`,
        group: 'Quick Shortcuts',
      },
    ];

    const tools: CommandItem[] = catalogSource === 'canonical'
      ? (capabilityCatalogQuery.data?.capabilities ?? []).map((capability) => ({
          id: `tool-${capability.id}`,
          label: capability.label,
          href: appendCapabilityLaunchContext(capability.href, {
            launchSurface: 'command_palette',
          }),
          group: 'Tools',
          keywords: capabilitySearchTerms(capability),
          toolId: capability.id,
        }))
      : getDiscoverableTools({ availability: availabilityQuery.data }).map((tool) => ({
          id: `tool-${tool.id}`,
          label: tool.label,
          href: tool.buildHref(resolvedPropertyId, { launchSurface: 'command_palette' }),
          group: 'Tools',
          keywords: [tool.description, tool.outcomeCategory.replace(/_/g, ' ')],
          toolId: tool.id,
        }));

    if (catalogSource === 'canonical' && capabilityCatalogQuery.isError) {
      tools.push({
        id: 'tool-catalog-unavailable',
        label: 'Tool catalog unavailable — open Explore Tools to retry',
        href: `/dashboard/home-tools${resolvedPropertyId ? `?propertyId=${encodeURIComponent(resolvedPropertyId)}` : ''}`,
        group: 'Tools',
        keywords: ['tools unavailable retry'],
      });
    }

    return [...navItems, ...recent, ...quick, ...tools];
  }, [
    inventoryHref,
    isAdminNav,
    propertyRoomsHref,
    recentActions,
    resolvedPropertyId,
    resolutionCenterHref,
    riskReportHref,
    availabilityQuery.data,
    capabilityCatalogQuery.data?.capabilities,
    capabilityCatalogQuery.isError,
    catalogSource,
  ]);

  const groups: Array<CommandItem['group']> = ['Navigation', 'Recent Actions', 'Quick Shortcuts', 'Tools'];

  const onSelect = (item: CommandItem) => {
    if (item.toolId) {
      track('tool_discovery_clicked', {
        propertyId: resolvedPropertyId,
        surface: 'command_palette',
        toolId: item.toolId,
      });
    }
    setOpen(false);
    setQuery('');
    router.push(item.href);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl p-0">
        <Command
          label="Dashboard Command Palette"
          className="overflow-hidden rounded-lg"
          filter={(value, search, keywords) => {
            const combined = [value, ...(keywords ?? [])].join(' ');
            return fuzzyScore(combined, search);
          }}
        >
          <div className="border-b border-gray-200 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search pages, actions, shortcuts, and tools..."
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto px-3 pb-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:[&_[cmdk-group-heading]]:tracking-normal [&_[cmdk-group-heading]]:text-gray-400">
            <Command.Empty className="px-2 py-8 text-center text-sm text-gray-500">
              No matching commands.
            </Command.Empty>

            {groups.map((group) => {
              const groupItems = items.filter((item) => item.group === group);
              if (!groupItems.length) return null;
              return (
                <Command.Group key={group} heading={group} className="pt-2">
                  {groupItems.map((item) => (
                    item.toolId ? (
                      <CapabilityCommandItem
                        key={item.id}
                        item={item}
                        propertyId={resolvedPropertyId}
                        registryVersion={capabilityCatalogQuery.data?.registryVersion ?? 'legacy-v2'}
                        onSelect={onSelect}
                      />
                    ) : (
                      <Command.Item
                        key={item.id}
                        value={item.label}
                        keywords={[item.group, item.href, ...(item.keywords ?? [])]}
                        onSelect={() => onSelect(item)}
                        className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm text-gray-700 outline-none transition-colors data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
                      >
                        {item.label}
                      </Command.Item>
                    )
                  ))}
                </Command.Group>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
