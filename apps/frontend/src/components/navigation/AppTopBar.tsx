'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, LogOut, Menu, Search, Settings } from 'lucide-react';

import { useAuth } from '@/lib/auth/AuthContext';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { cn } from '@/lib/utils';
import type { User } from '@/types';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPropertyIdFromPathname } from '@/components/navigation/appNavConfig';

type PropertySummary = {
  id: string;
  name: string;
  address?: string | null;
};

type AppTopBarProps = {
  user: User | null;
  onOpenMobileNav: () => void;
};

function launchCommandPalette() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('ctc:command-palette:open'));
}

function PropertySwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const [properties, setProperties] = React.useState<PropertySummary[]>([]);
  const [loading, setLoading] = React.useState(false);

  const pathPropertyId = React.useMemo(
    () => getPropertyIdFromPathname(pathname || ''),
    [pathname]
  );

  React.useEffect(() => {
    let alive = true;
    const loadProperties = async () => {
      setLoading(true);
      try {
        const response = await api.getProperties();
        if (!alive) return;
        if (response.success) {
          const items = (response.data?.properties || []).map((property: any) => ({
            id: property.id,
            name: property.name || property.address || 'Property',
            address: property.address,
          }));
          setProperties(items);
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    loadProperties();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (pathPropertyId && selectedPropertyId !== pathPropertyId) {
      setSelectedPropertyId(pathPropertyId);
      return;
    }

    if (!pathPropertyId && !selectedPropertyId && properties.length > 0) {
      setSelectedPropertyId(properties[0].id);
    }
  }, [pathPropertyId, selectedPropertyId, setSelectedPropertyId, properties]);

  const value = selectedPropertyId || pathPropertyId || '';
  const hasProperties = properties.length > 0;

  const onValueChange = (nextPropertyId: string) => {
    setSelectedPropertyId(nextPropertyId);

    const currentPropertyId = getPropertyIdFromPathname(pathname || '');
    if (!currentPropertyId || currentPropertyId === nextPropertyId) return;

    const nextPath = (pathname || '').replace(
      /\/dashboard\/properties\/[^/]+/,
      `/dashboard/properties/${nextPropertyId}`
    );
    const query = searchParams.toString();
    router.push(query ? `${nextPath}?${query}` : nextPath);
  };

  return (
    <div className="min-w-[120px] max-w-[220px] flex-1 sm:min-w-[180px] sm:max-w-[320px] sm:flex-none">
      <Select
        value={hasProperties ? value : ''}
        onValueChange={onValueChange}
        disabled={!hasProperties || loading}
      >
        <SelectTrigger
          aria-label="Select property"
          className="h-9 w-full min-w-[120px] max-w-[220px] bg-white/90 text-sm sm:min-w-[180px] sm:max-w-[320px]"
        >
          <SelectValue placeholder={loading ? 'Loading properties...' : 'Select property'} />
        </SelectTrigger>
        <SelectContent>
          {properties.map((property) => (
            <SelectItem key={property.id} value={property.id}>
              {property.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function UserMenu({ user }: { user: User | null }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 items-center gap-2 rounded-md px-2.5 text-sm text-gray-700 hover:bg-teal-50 hover:text-brand-primary"
        >
          <Settings className="h-4 w-4" />
          <span className="hidden sm:inline">{user?.firstName || 'Account'}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-44">
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex items-center gap-2"
          onSelect={(event) => {
            event.preventDefault();
            handleLogout();
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppTopBar({ user, onOpenMobileNav }: AppTopBarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-white/95 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenMobileNav}
          className="h-9 w-9 md:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <Image src="/favicon.svg" alt="Contract to Cozy logo" width={22} height={22} className="h-5.5 w-5.5" />
          <span className="hidden text-base font-semibold text-brand-900 sm:inline">Contract to Cozy</span>
        </Link>

        <PropertySwitcher />

        <Button
          type="button"
          variant="outline"
          onClick={launchCommandPalette}
          className={cn(
            'ml-auto h-9 items-center gap-2 border-black/10 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900',
            'hidden min-w-[220px] justify-start sm:flex'
          )}
          aria-label="Open search and command palette"
        >
          <Search className="h-4 w-4" />
          <span className="truncate">Search or jump to...</span>
          <span className="ml-auto rounded border border-black/10 px-1.5 py-0.5 text-[10px] text-gray-500">⌘K</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={launchCommandPalette}
          className="h-9 w-9 sm:hidden"
          aria-label="Open search and command palette"
        >
          <Search className="h-4 w-4" />
        </Button>

        <NotificationBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
