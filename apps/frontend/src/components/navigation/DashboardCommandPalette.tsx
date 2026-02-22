'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Search } from 'lucide-react';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { Command } from 'cmdk';

type CommandItem = {
  id: string;
  label: string;
  href: string;
  group: 'Navigation' | 'Recent Actions' | 'Quick Shortcuts';
};

type DashboardCommandPaletteProps = {
  propertyId?: string;
};

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
  const { selectedPropertyId } = usePropertyContext();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [recentActions, setRecentActions] = React.useState<Array<{ id: string; label: string }>>([]);
  const resolvedPropertyId =
    propertyId ||
    selectedPropertyId ||
    pathname?.match(PROPERTY_ID_IN_PATH)?.[1];

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

  const propertyRoomsHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}/rooms`
    : '/dashboard/properties?navTarget=rooms';
  const homeToolsHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}/status-board`
    : '/dashboard/properties?navTarget=status-board';
  const protectionHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}/risk-assessment`
    : '/dashboard/properties';
  const riskReportHref = resolvedPropertyId
    ? `/dashboard/properties/${resolvedPropertyId}/risk-assessment`
    : '/dashboard/properties';

  const items = React.useMemo<CommandItem[]>(() => {
    const navItems: CommandItem[] = [
      { id: 'nav-dashboard', label: 'Dashboard', href: '/dashboard', group: 'Navigation' },
      { id: 'nav-actions', label: 'Actions', href: '/dashboard/actions', group: 'Navigation' },
      { id: 'nav-rooms', label: 'Rooms', href: propertyRoomsHref, group: 'Navigation' },
      { id: 'nav-services', label: 'Find Services', href: '/dashboard/providers', group: 'Navigation' },
      { id: 'nav-inventory', label: 'Inventory', href: '/dashboard/inventory', group: 'Navigation' },
      { id: 'nav-ai-tools', label: 'AI Tools', href: '/dashboard/coverage-intelligence', group: 'Navigation' },
      { id: 'nav-home-tools', label: 'Home Tools', href: homeToolsHref, group: 'Navigation' },
      { id: 'nav-protection', label: 'Protection', href: protectionHref, group: 'Navigation' },
      { id: 'nav-home-admin', label: 'Home Admin', href: '/dashboard/warranties', group: 'Navigation' },
      { id: 'nav-community', label: 'Community Events', href: '/dashboard/community-events', group: 'Navigation' },
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
    ];

    return [...navItems, ...recent, ...quick];
  }, [homeToolsHref, propertyRoomsHref, protectionHref, recentActions, resolvedPropertyId, riskReportHref]);

  const groups: Array<CommandItem['group']> = ['Navigation', 'Recent Actions', 'Quick Shortcuts'];

  const onSelect = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
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
                placeholder="Search pages, actions, and shortcuts..."
                className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
          </div>

          <Command.List className="max-h-[420px] overflow-y-auto px-3 pb-3 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-gray-400">
            <Command.Empty className="px-2 py-8 text-center text-sm text-gray-500">
              No matching commands.
            </Command.Empty>

            {groups.map((group) => {
              const groupItems = items.filter((item) => item.group === group);
              if (!groupItems.length) return null;
              return (
                <Command.Group key={group} heading={group} className="pt-2">
                  {groupItems.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.label}
                      keywords={[item.group, item.href]}
                      onSelect={() => onSelect(item.href)}
                      className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm text-gray-700 outline-none transition-colors data-[selected=true]:bg-brand-50 data-[selected=true]:text-brand-700"
                    >
                      {item.label}
                    </Command.Item>
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
