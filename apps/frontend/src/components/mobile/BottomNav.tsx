// apps/frontend/src/components/mobile/BottomNav.tsx

'use client';

import { Home, AlertTriangle, Calendar, Building, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { 
      href: '/dashboard', 
      icon: Home, 
      label: 'Home',
      match: (path: string) => path === '/dashboard'
    },
    { 
      href: '/dashboard/actions', 
      icon: AlertTriangle, 
      label: 'Actions',
      match: (path: string) => path.startsWith('/dashboard/actions')
    },
    { 
      href: '/dashboard/properties', 
      icon: Building, 
      label: 'Properties',
      match: (path: string) => path.startsWith('/dashboard/properties')
    },
    { 
      href: '/dashboard/bookings', 
      icon: Calendar, 
      label: 'Bookings',
      match: (path: string) => path.startsWith('/dashboard/bookings')
    },
    { 
      href: '/dashboard/profile', 
      icon: User, 
      label: 'Profile',
      match: (path: string) => path.startsWith('/dashboard/profile')
    },
  ];

  return (
    <>
      {/* Bottom navigation - hidden on desktop */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 safe-area-inset-bottom lg:hidden z-50 shadow-lg">
        <div className="grid grid-cols-5 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.match(pathname || '');
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center justify-center space-y-1 transition-all duration-200",
                  "active:scale-95",
                  isActive 
                    ? "text-blue-600" 
                    : "text-gray-500 hover:text-gray-700"
                )}
              >
                <Icon className={cn(
                  "transition-all duration-200",
                  isActive ? "h-6 w-6" : "h-5 w-5"
                )} />
                <span className={cn(
                  "text-xs font-medium transition-all duration-200",
                  isActive && "font-semibold"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom padding spacer for content - only on mobile */}
      <div className="h-16 lg:hidden" aria-hidden="true" />
    </>
  );
}