// apps/frontend/src/app/(dashboard)/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Home,
  Calendar,
  Building,
  Search,
  ListChecks,
  UserCircle,
  LogOut,
  PanelLeft,
  Settings,
} from 'lucide-react';

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType; // Icon is still needed for the mobile nav
}

/**
 * Main layout for the authenticated dashboard.
 * Reverted to a top-bar navigation layout.
 */
function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p>Loading user data...</p>
      </div>
    );
  }

  // If user is a PROVIDER, redirect them
  if (user && user.role === 'PROVIDER') {
    if (typeof window !== 'undefined') {
      window.location.href = '/providers/dashboard';
    }
    return null;
  }

  return (
    // 1. Reverted to a simple flex-col layout
    <div className="flex min-h-screen w-full flex-col">
      {/* --- Header (Contains all nav) --- */}
      <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-b bg-white px-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold"
        >
          <span className="text-xl font-bold text-blue-600">Cozy</span>
        </Link>

        {/* 2. New Desktop-only horizontal nav */}
        <DesktopNav />

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Menu */}
        <UserMenu />

        {/* 3. Mobile-only hamburger menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0 lg:hidden" // Hidden on desktop
            >
              <PanelLeft className="h-5 w-5" />
              <span className="sr-only">Toggle navigation menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] p-0">
            <div className="flex h-[60px] items-center border-b px-6">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 font-semibold"
              >
                <span className="text-xl font-bold text-blue-600">Cozy</span>
              </Link>
            </div>
            <div className="py-2">
              {/* 4. The original vertical nav is used *only* for mobile */}
              <SidebarNav />
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* --- Page Content --- */}
      <main className="flex-1 bg-gray-50 p-4 md:p-8">{children}</main>
    </div>
  );
}

/**
 * Renders the new horizontal navigation for desktop.
 * Is hidden on mobile.
 */
function DesktopNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const navLinks: NavLink[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar },
    { name: 'Properties', href: '/dashboard/properties', icon: Building },
    { name: 'Find Providers', href: '/dashboard/providers', icon: Search },
  ];

  if (user && user.segment === 'HOME_BUYER') {
    navLinks.push({
      name: 'Checklist',
      href: '/dashboard/checklist',
      icon: ListChecks,
    });
  }

  return (
    <nav className="hidden items-center gap-4 lg:flex lg:gap-6 ml-6">
      {navLinks.map((link) => (
        <Link
          key={link.name}
          href={link.href}
          className={cn(
            'text-sm font-medium text-gray-600 transition-all hover:text-blue-600',
            pathname === link.href && 'text-blue-600 font-semibold'
          )}
        >
          {link.name}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Renders the original vertical navigation, now *only* for the mobile sheet.
 */
function SidebarNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  const navLinks: NavLink[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar },
    { name: 'Properties', href: '/dashboard/properties', icon: Building },
    { name: 'Find Providers', href: '/dashboard/providers', icon: Search },
  ];

  if (user && user.segment === 'HOME_BUYER') {
    navLinks.push({
      name: 'Checklist',
      href: '/dashboard/checklist',
      icon: ListChecks,
    });
  }

  return (
    <nav className="grid items-start px-4 text-sm font-medium">
      {navLinks.map((link) => (
        <Link
          key={link.name}
          href={link.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-blue-600 hover:bg-gray-100',
            pathname === link.href && 'bg-blue-100 text-blue-700 hover:text-blue-700'
          )}
        >
          <link.icon className="h-4 w-4" />
          {link.name}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Renders the user dropdown menu in the header.
 */
function UserMenu() {
  const { user, logout } = useAuth();

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
          size="icon"
          className="rounded-full border w-8 h-8"
        >
          <UserCircle className="h-5 w-5" />
          <span className="sr-only">Toggle user menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="text-xs font-normal text-gray-500">
              {user?.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/profile">
            <Settings className="mr-2 h-4 w-4" />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-red-600">
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default DashboardLayout;