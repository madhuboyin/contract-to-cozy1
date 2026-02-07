// apps/frontend/src/app/(dashboard)/layout.tsx
'use client';

import React, { useState, useEffect } from 'react';
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
  Shield,
  Wrench,
  DollarSign,
  FileText,
  Globe,
  AlertTriangle,
  Box,
  MessageSquare
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { User } from '@/types';
import { PropertySetupBanner } from '@/components/PropertySetupBanner';
import { api } from '@/lib/api/client';
import { AIChat } from '@/components/AIChat';
import { PropertyProvider } from '@/lib/property/PropertyContext';
import { NotificationProvider } from '@/lib/notifications/NotificationContext';
import { NotificationBell } from '@/components/notifications/NotificationBell';
// Mobile-first imports
import { BottomNav } from '@/components/mobile/BottomNav';
import { PullToRefresh } from '@/components/mobile/PullToRefresh';

interface NavLink {
  name: string;
  href: string;
  icon: React.ElementType;
}

const PROPERTY_SETUP_SKIPPED_KEY = 'propertySetupSkipped';

function getUserTypeLabel(user: User | null): string {
  if (!user) return 'Guest';
  if (user.segment === 'HOME_BUYER') return 'Home Buyer';
  if (user.segment === 'EXISTING_OWNER') return 'Homeowner';
  return 'Homeowner';
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth() as { user: User | null, loading: boolean };
  const [propertyCount, setPropertyCount] = useState<number | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchPropertyCount = async () => {
      console.log('🎌 BANNER CHECK - Starting...');
      console.log('👤 User:', user ? 'exists' : 'null');
      console.log('👤 User segment:', user?.segment);
      console.log('⏳ Loading:', loading);

      if (!user) {
        console.log('❌ No user, banner hidden');
        setShowBanner(false);
        return;
      }

      if (user.segment !== 'EXISTING_OWNER') {
        console.log('❌ Not EXISTING_OWNER, banner hidden');
        setShowBanner(false);
        return;
      }

      console.log('✅ User is EXISTING_OWNER, checking properties...');

      try {
        const response = await api.getProperties();
        console.log('📦 Properties API response:', response);
        
        if (response.success) {
          const count = response.data.properties.length;
          setPropertyCount(count);
          console.log('🏠 Property count:', count);
          
          const hasSkipped = localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY) === 'true';
          console.log('📦 localStorage skip flag:', localStorage.getItem(PROPERTY_SETUP_SKIPPED_KEY));
          console.log('✅ Has skipped?', hasSkipped);
          
          const shouldShowBanner = count === 0 && !hasSkipped;
          console.log('');
          console.log('🎌 BANNER DECISION:');
          console.log('   ├─ Property count === 0?', count === 0);
          console.log('   ├─ Has skipped?', hasSkipped);
          console.log('   └─ Show banner?', shouldShowBanner);
          console.log('');
          
          setShowBanner(shouldShowBanner);
          
          if (shouldShowBanner) {
            console.log('✅ BANNER WILL BE SHOWN');
          } else {
            console.log('❌ Banner will NOT be shown');
            if (count > 0) {
              console.log('   Reason: User has properties');
            }
            if (hasSkipped) {
              console.log('   Reason: User has skipped');
            }
          }
        } else {
          console.error('❌ Properties API failed:', response);
        }
      } catch (error) {
        console.error('❌ Failed to fetch properties for banner:', error);
      }
    };

    if (!loading && user) {
      console.log('🎌 User loaded, fetching property count for banner...');
      fetchPropertyCount();
    }
  }, [user, loading]);

  const handleDismissBanner = () => {
    localStorage.setItem(PROPERTY_SETUP_SKIPPED_KEY, 'true');
    setShowBanner(false);
  };

  const handleRefresh = async () => {
    setRefreshKey(prev => prev + 1);
    // Optionally refetch property count or other data
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (user && user.role === 'PROVIDER') {
    if (typeof window !== 'undefined') {
      window.location.href = '/providers/dashboard';
    }
    return null;
  }

  console.log('🎨 RENDERING LAYOUT');
  console.log('🎌 Banner showBanner state:', showBanner);

  return (
    <NotificationProvider>
      <PropertyProvider>
        <div className="flex min-h-screen w-full flex-col">
          {/* Property Setup Banner - Shows at top */}
          {showBanner && (
            <PropertySetupBanner show={showBanner} onDismiss={handleDismissBanner} />
          )}

          {/* Desktop Header - Hidden on mobile */}
          <header className="sticky top-0 z-10 hidden lg:flex h-16 items-center gap-4 border-b bg-white px-4 sm:px-6">
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
          </header>

          {/* Mobile Header - Shown only on mobile */}
          <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200">
            <div className="px-4 py-3 flex items-center justify-between">
              <Link href="/dashboard" className="flex items-center gap-2">
                <Image
                  src="/favicon.svg"
                  alt="Cozy Logo"
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                <span className="font-bold text-blue-600 text-lg">C2C</span>
              </Link>
              
              <div className="flex items-center gap-3">
                <NotificationBell />
                
                <Sheet>
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="shrink-0"
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
              </div>
            </div>
          </header>

          {/* Main content with pull-to-refresh */}
          <main className="flex-1 bg-gray-50 pb-20 lg:pb-0">
            <PullToRefresh onRefresh={handleRefresh}>
              <div className="mx-auto w-full max-w-7xl p-4 md:p-8">
                <div key={refreshKey}>
                  {children}
                </div>
              </div>
            </PullToRefresh>
          </main>

          {/* Mobile Bottom Navigation - Hidden on desktop */}
          <BottomNav />

          {/* AI Chat Widget - Available on all screen sizes */}
          <AIChat />
        </div>
      </PropertyProvider>
    </NotificationProvider>
  );
}

function DesktopNav({ user }: { user: User | null }) {
  const pathname = usePathname();

  const allLinks: NavLink[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Actions', href: '/dashboard/actions', icon: AlertTriangle },
    { name: 'Properties', href: '/dashboard/properties', icon: Building },
    { name: 'Inventory', href: '/dashboard/inventory', icon: Box },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar },
    { name: 'Find Services', href: '/dashboard/providers', icon: Search },
    { name: 'Checklist', href: '/dashboard/checklist', icon: ListChecks },
    { name: 'Warranties', href: '/dashboard/warranties', icon: Wrench },
    { name: 'Insurance', href: '/dashboard/insurance', icon: Shield },
    { name: 'Expenses', href: '/dashboard/expenses', icon: DollarSign },
    { name: 'Documents', href: '/dashboard/documents', icon: FileText },
    { name: 'Community Events', href: '/dashboard/community-events', icon: Globe },
  ];

  const visibleLinks = allLinks.filter(link => {
    if (link.name === 'Checklist') {
      return user?.segment === 'HOME_BUYER';
    }
    if (['Warranties', 'Insurance', 'Expenses', 'Documents'].includes(link.name)) {
      return user?.segment === 'EXISTING_OWNER';
    }
    return true;
  });

  return (
    <nav className="hidden lg:flex gap-6 items-center">
      {visibleLinks.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'font-body font-medium text-sm flex items-center gap-2 transition-colors duration-200',
              isActive 
                ? 'text-brand-primary font-semibold' 
                : 'text-gray-700 hover:text-brand-primary'
            )}
          >
            <Icon className="h-4 w-4" />
            {link.name}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarNav({ user }: { user: User | null }) {
  const pathname = usePathname();

  const allLinks: NavLink[] = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Actions', href: '/dashboard/actions', icon: AlertTriangle },
    { name: 'Properties', href: '/dashboard/properties', icon: Building },
    { name: 'Inventory', href: '/dashboard/inventory', icon: Box },
    { name: 'Bookings', href: '/dashboard/bookings', icon: Calendar },
    { name: 'Find Services', href: '/dashboard/providers', icon: Search },
    { name: 'Checklist', href: '/dashboard/checklist', icon: ListChecks },
    { name: 'Warranties', href: '/dashboard/warranties', icon: Wrench },
    { name: 'Insurance', href: '/dashboard/insurance', icon: Shield },
    { name: 'Expenses', href: '/dashboard/expenses', icon: DollarSign },
    { name: 'Documents', href: '/dashboard/documents', icon: FileText },
    { name: 'Community Events', href: '/dashboard/community-events', icon: Globe },
  ];

  const visibleLinks = allLinks.filter(link => {
    if (link.name === 'Checklist') {
      return user?.segment === 'HOME_BUYER';
    }
    if (['Warranties', 'Insurance', 'Expenses', 'Documents'].includes(link.name)) {
      return user?.segment === 'EXISTING_OWNER';
    }
    return true;
  });

  return (
    <nav className="grid gap-1 px-4 text-sm font-medium">
      {visibleLinks.map((link) => {
        const Icon = link.icon;
        const isActive = pathname === link.href;
        
        return (
          <SheetClose key={link.href} asChild>
            <Link
              href={link.href}
              className={cn(
                'font-body font-medium flex items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-200',
                isActive
                  ? 'bg-teal-50 text-brand-primary font-semibold'
                  : 'text-gray-700 hover:text-brand-primary hover:bg-teal-50'
              )}
            >
              <Icon className="h-4 w-4" />
              {link.name}
            </Link>
          </SheetClose>
        );
      })}
    </nav>
  );
}

function DesktopUserNav({ user }: { user: User | null }) {
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div className="hidden lg:flex items-center gap-4">
      {/* 🔔 Notifications */}
      <NotificationBell />

      {/* 👤 Profile */}
      <Link 
        href="/dashboard/profile"
        className="font-body font-medium flex items-center gap-2 text-sm text-gray-700 hover:text-brand-primary transition-colors duration-200"
      >
        <Settings className="h-4 w-4" />
        <div>
          <div className="font-medium">{user?.firstName}</div>
          <Badge 
            variant="outline" 
            className="font-body text-xs border-brand-primary text-brand-primary"
          >
            {getUserTypeLabel(user)}
          </Badge>
        </div>
      </Link>
      
      {/* 🚪 Logout */}
      <Button 
        onClick={handleLogout} 
        variant="ghost" 
        size="sm"
        className="font-body font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive tracking-wide transition-colors duration-200"
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
          className="font-body font-semibold text-destructive justify-start hover:bg-destructive/10 hover:text-destructive tracking-wide transition-colors duration-200 -mx-3"
        >
          <LogOut className="mr-3 h-4 w-4" />
          Logout
        </Button>
      </nav>
    </div>
  );
}

export default DashboardLayout;