'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, Loader2, LogOut, Search, Settings, Sparkles, UserRound } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { CtcPropertySelector } from '@/components/layout/CtcPropertySelector';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api/client';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useAskAccount } from './useAskAccount';

export function AskShellHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const { unreadCount } = useNotifications();
  const { accountName, accountEmail, loggingOut, handleLogout } = useAskAccount();
  const { data } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.getProperties();
      return response.success ? response.data : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const properties = data?.properties ?? [];
  const selected = properties.find((property) => property.id === selectedPropertyId);
  const address = selected?.address?.trim() || selected?.name?.trim() || 'Select a home';
  const accountLabel = accountName || accountEmail || 'Account';

  const switchProperty = (propertyId: string) => {
    setSelectedPropertyId(propertyId);
    const next = new URLSearchParams(searchParams.toString());
    next.set('propertyId', propertyId);
    // Conversation identity belongs to the old property. Keep the destination,
    // but never carry an inaccessible session across a property boundary.
    next.delete('sessionId');
    next.delete('executionId');
    next.delete('question');
    router.replace(`${pathname}?${next.toString()}`);
  };

  return (
    <header className="flex min-h-[72px] shrink-0 items-center gap-2 border-b border-stone-200 bg-[#fcfbf8] px-3 sm:gap-3 sm:px-6" aria-label="Ask Cozy utilities">
      <Link href="/dashboard/ask" className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2" aria-label="Ask Cozy Home">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
        <span className="hidden text-base font-semibold tracking-[-0.01em] text-[#17231d] sm:inline">Ask Cozy</span>
      </Link>

      <CtcPropertySelector
        className="ml-1 h-11 min-w-0 max-w-[15rem] bg-white sm:ml-3"
        propertyAddress={address}
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onPropertySelect={switchProperty}
        onAddProperty={() => router.push('/dashboard/properties/new')}
      />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('ctc-command-palette-open'))} aria-label="Search pages, actions, and tools" className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
          <Search className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link href="/dashboard/notifications" aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'} className="relative grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && <span className="absolute right-0.5 top-0.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white" aria-hidden="true">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={`Open settings for ${accountLabel}`} className="grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-stone-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2">
              <UserRound className="h-5 w-5" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>
              <span className="block truncate text-sm font-semibold text-slate-900">{accountLabel}</span>
              {accountName && accountEmail && <span className="mt-0.5 block truncate text-xs font-normal text-slate-500">{accountEmail}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/dashboard/profile"><Settings className="mr-2 h-4 w-4" aria-hidden="true" />Profile, privacy &amp; settings</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/dashboard/notifications"><Bell className="mr-2 h-4 w-4" aria-hidden="true" />Notification settings</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={loggingOut} onSelect={() => void handleLogout()} className="text-red-700 focus:text-red-800">
              {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />}
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
