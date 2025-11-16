// apps/frontend/src/app/(dashboard)/layout.tsx
'use client';

import React, { useState } from 'react';
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
} from 'lucide-react'; // <-- Wrench icon import removed

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

/**
 * Main layout for the authenticated dashboard.
 * Includes sidebar, header, and content area.
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

  // If user is a PROVIDER, redirect them to the provider dashboard
  if (user && user.role === 'PROVIDER') {
    if (typeof window !== 'undefined') {
      window.location.href = '/providers/dashboard';
    }
    return null; // Render nothing while redirecting
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[280px_1fr]">
      {/* --- Sidebar (Desktop) --- */}
      <div className="hidden border-r bg-gray-100/40 lg:block dark:bg-gray-800/40">
        <div className="flex h-full max-h-screen flex-col gap-2">
          <div className="flex h-[60px] items-center border-b px-6">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold"
            >
              <span className="text-xl font-bold text-blue-600">Cozy</span>
            </Link>
          </div>
          <div className="flex-1 overflow-auto py-2">
            <SidebarNav />
          </div>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex flex-col">
        {/* --- Header (Mobile + Desktop User Menu) --- */}
        <header className="flex h-14 items-center gap-4 border-b bg-white px-6 dark:bg-gray-800">
          {/* Mobile Nav Toggle */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 lg:hidden"
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
                <SidebarNav />
              </div>
            </SheetContent>
          </Sheet>

          {/* Spacer */}
          <div className="flex-1" />

          {/* User Menu */}
          <UserMenu />
        </header>

        {/* --- Page Content --- */}
        <main className="flex-1 bg-gray-50 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

/**
 * Renders the primary navigation links in the sidebar.
 * Dynamically shows "Checklist" for Home Buyers.
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

  // --- REVERTED LOGIC ---
  // Only show Checklist for Home Buyers
  if (user && user.segment === 'HOME_BUYER') {
    navLinks.push({
      name: 'Checklist',
      href: '/dashboard/checklist',
      icon: ListChecks,
    });
  }
  // --- END OF REVERT ---

  return (
    <nav className="grid items-start px-4 text-sm font-medium">
      {navLinks.map((link) => (
        <Link
          key={link.name}
          href={link.href}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-blue-600 hover:bg-gray-100',
            pathname === link.href && 'bg-blue-100 text-blue-700 hover:text-blue-700',
            'dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800',
            pathname === link.href && 'dark:bg-gray-800 dark:text-white'
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