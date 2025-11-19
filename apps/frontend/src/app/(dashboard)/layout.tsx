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
import { User } from '@/types'; 

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

/**
 * Main layout for the authenticated dashboard.
 */
function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null, loading: boolean };

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
      <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white px-4 sm:px-6">
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

        <DesktopNav user={user} />
        <div className="flex-1" />
        <DesktopUserNav user={user} />

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
            
            <div className="py-2 flex-1 overflow-auto">
              <SidebarNav user={user} />
            </div>

            <MobileUserNav user={user} />
          </SheetContent>
        </Sheet>
      </header>

      <main className="flex-1 bg-gray-50">
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Renders the horizontal navigation for desktop.
 */
function DesktopNav({ user }: { user: User | null }) {
  const pathname = usePathname();

  const navLinks: NavLink[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar },
    { name: 'Properties', href: '/dashboard/properties', icon: Building },
    { name: 'Find Providers', href: '/dashboard/providers', icon: Search },
  ];

  // FIX: Check the top-level 'user.segment' property
  if (user && user.segment === 'HOME_BUYER') {
    navLinks.push({
      name: 'Checklist',
      href: '/dashboard/checklist',
      icon: ListChecks,
    });
  }

  return (
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
function SidebarNav({ user }: { user: User | null }) {
  const pathname = usePathname();

  const navLinks: NavLink[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar },
    { name: 'Properties', href: '/dashboard/properties', icon: Building },
    { name: 'Find Providers', href: '/dashboard/providers', icon: Search },
  ];

  // FIX: Check the top-level 'user.segment' property
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
const getUserTypeLabel = (user: User | null) => {
  if (!user) return '';
  if (user.role === 'PROVIDER') return 'Provider';
  
  // FIX: Check the top-level 'user.segment' property
  const segment = user.segment;
  
  if (segment === 'HOME_BUYER') return 'Home Buyer';
  if (segment === 'EXISTING_OWNER') return 'Homeowner';
  
  return 'Homeowner'; // Default
};

// New component for DESKTOP user info
function DesktopUserNav({ user }: { user: User | null }) {
  const { logout } = useAuth(); 

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div className="hidden items-center gap-4 lg:flex shrink-0">
      <div className="flex items-center gap-2">
        <span className="font-body font-medium text-sm text-gray-900">
          {user?.firstName} {user?.lastName}
        </span>
        <Badge 
          variant="outline" 
          className="h-auto text-xs px-2 py-0.5 border-brand-primary text-brand-primary font-body"
        >
          {getUserTypeLabel(user)}
        </Badge>
      </div>

      <Button 
        asChild 
        variant="ghost" 
        size="sm" 
        className="font-body font-semibold text-gray-600 hover:text-brand-primary hover:bg-teal-50 tracking-wide transition-colors duration-200"
      >
        <Link href="/dashboard/profile">Profile</Link>
      </Button>

      <Button 
        onClick={handleLogout} 
        variant="ghost" 
        size="sm" 
        className="font-body font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 tracking-wide transition-colors duration-200"
      >
        Logout
      </Button>
    </div>
  );
}

function MobileUserNav({ user }: { user: User | null }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div className="border-t p-4">
      <div className="mb-2">
        <div className="font-body font-medium">{user?.firstName} {user?.lastName}</div>
        <div className="font-body text-xs text-gray-500">{user?.email}</div>
        <Badge 
          variant="outline" 
          className="w-fit mt-1 border-brand-primary text-brand-primary font-body"
        >
          {getUserTypeLabel(user)}
        </Badge>
      </div>
      <nav className="flex flex-col gap-1">
        <SheetClose asChild>
          <Link 
            href="/dashboard/profile"
            className="font-body font-medium flex items-center gap-3 rounded-lg px-3 py-2 text-gray-700 transition-colors duration-200 hover:text-brand-primary hover:bg-teal-50 -mx-3"
          >
            <Settings className="h-4 w-4" />
            Profile
          </Link>
        </SheetClose>
        <Button 
          onClick={handleLogout} 
          variant="ghost" 
          className="font-body font-semibold text-red-600 justify-start hover:bg-red-50 hover:text-red-700 tracking-wide transition-colors duration-200 -mx-3"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </Button>
      </nav>
    </div>
  );
}

export default DashboardLayout;