// apps/frontend/src/app/(dashboard)/layout.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Home,
  Calendar,
  Building,
  Search,
  ListChecks,
  LogOut,
  PanelLeft,
  Settings,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

/**
 * Main layout for the authenticated dashboard.
 * Top-bar navigation with centered content and inlined user menu.
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
    <div className="flex min-h-screen w-full flex-col">
      {/* --- Header (Contains all nav) --- */}
      {/* 1. Increased header height to h-16 (4rem) to give content room */}
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-4 sm:px-6">
        {/* --- FIX: "SHRUNK" NAV/OVERLAP (Part 1) --- */}
        {/* Added `shrink-0` to the logo link to prevent it from compressing */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold shrink-0"
        >
          <Image
            src="/favicon.svg"
            alt="Cozy Logo"
            width={24}
            height={24}
            className="h-6 w-6"
          />
          <span className="text-xl font-bold text-blue-600">Contract to Cozy</span>
        </Link>

        {/* Desktop-only horizontal nav */}
        <DesktopNav />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Replaced Dropdown with new DesktopUserNav */}
        <DesktopUserNav />

        {/* Mobile-only hamburger menu */}
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
          <SheetContent side="left" className="w-[280px] p-0 flex flex-col">
            <div className="flex h-16 items-center border-b px-6">
              <Link
                href="/dashboard"
                className="flex items-center gap-2 font-semibold"
              >
                <Image
                  src="/favicon.svg"
                  alt="Cozy Logo"
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                <span className="text-xl font-bold text-blue-600">Contract to Cozy</span>
              </Link>
            </div>
            
            {/* Main nav links */}
            <div className="py-2 flex-1 overflow-auto">
              <SidebarNav />
            </div>

            {/* User links at bottom of mobile menu */}
            <MobileUserNav />
          </SheetContent>
        </Sheet>
      </header>

      {/* --- 2. THIS IS THE CENTERING FIX --- */}
      {/* This main element provides the background color */}
      <main className="flex-1 bg-gray-50">
        {/* This div centers your content, sets its max width, and adds the padding */}
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
          {children}
        </div>
      </main>
      {/* --- END CENTERING FIX --- */}
    </div>
  );
}

/**
 * Renders the horizontal navigation for desktop.
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
    // --- FIX: "SHRUNK" NAV/OVERLAP (Part 2) ---
    // Added `shrink-0` to prevent this nav from shrinking
    <nav className="hidden items-center gap-4 lg:flex lg:gap-6 ml-6 shrink-0">
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
 * Renders the vertical navigation for the mobile sheet.
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

  // Use SheetClose to make links close the menu on navigation
  return (
    <nav className="grid items-start px-4 text-sm font-medium">
      {navLinks.map((link) => (
        <SheetClose asChild key={link.name}>
          <Link
            href={link.href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-blue-600 hover:bg-gray-100',
              pathname === link.href && 'bg-blue-100 text-blue-700 hover:text-blue-700'
            )}
          >
            <link.icon className="h-4 w-4" />
            {link.name}
          </Link>
        </SheetClose>
      ))}
    </nav>
  );
}

// Helper function to format user type
const getUserTypeLabel = (user: any) => {
  if (!user) return '';
  if (user.role === 'PROVIDER') return 'Provider';
  if (user.segment === 'HOME_BUYER') return 'Home Buyer';
  if (user.segment === 'EXISTING_OWNER') return 'Homeowner';
  return 'Homeowner'; // Default
};

// New component for DESKTOP user info
function DesktopUserNav() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    // --- FIX: "SHRUNK" NAV/OVERLAP (Part 3) ---
    // Added `shrink-0` to prevent this component from shrinking
    <div className="hidden items-center gap-4 lg:flex shrink-0">
      
      {/* --- THIS IS THE TEXT OVERLAP FIX (Already present in your file) --- */}
      {/* This div stacks the name and badge vertically */}
      <div className="flex flex-col items-end space-y-1"> {/* Added space-y-1 */}
        <span className="font-medium text-sm leading-tight"> {/* Use leading-tight */}
          {user?.firstName} {user?.lastName}
        </span>
        <Badge variant="outline" className="h-auto text-xs px-1.5 py-0">
          {getUserTypeLabel(user)}
        </Badge>
      </div>
      {/* --- END OF OVERLAP FIX --- */}

      <Button asChild variant="ghost" size="sm" className="text-gray-600 hover:text-blue-600">
        <Link href="/dashboard/profile">Profile</Link>
      </Button>
      <Button 
        onClick={handleLogout} 
        variant="ghost" 
        size="sm" 
        className="text-red-600 hover:bg-red-50 hover:text-red-700"
      >
        Logout
      </Button>
    </div>
  );
}

// New component for MOBILE user info
function MobileUserNav() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div className="border-t p-4">
      <div className="mb-2">
        <div className="font-medium">{user?.firstName} {user?.lastName}</div>
        <div className="text-xs text-gray-500">{user?.email}</div>
        <Badge variant="outline" className="w-fit mt-1">
          {getUserTypeLabel(user)}
        </Badge>
      </div>
      <nav className="flex flex-col gap-1">
        <SheetClose asChild>
          <Link 
            href="/dashboard/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-all hover:text-blue-600 hover:bg-gray-100 -mx-3"
          >
            <Settings className="h-4 w-4" />
            Profile
          </Link>
        </SheetClose>
        <Button 
          onClick={handleLogout} 
          variant="ghost" 
          className="text-red-600 justify-start -mx-3"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </Button>
      </nav>
    </div>
  );
}

export default DashboardLayout;