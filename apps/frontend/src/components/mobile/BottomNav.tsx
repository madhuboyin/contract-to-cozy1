'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_NAV } from '@/lib/navigation/adminNavigation';
import { PRIMARY_JOBS } from '@/lib/navigation/jobsNavigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = user?.role === 'ADMIN' ? ADMIN_NAV.slice(0, 5) : PRIMARY_JOBS;

  return (
    <nav
      aria-label="Primary navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-xl grid-cols-5 px-1">
        {items.map((item) => {
          const active = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname?.startsWith(item.href) || item.engines?.some((engine) => pathname?.includes(engine));
          const Icon = item.icon;
          const shortLabel = item.key === 'plan-projects'
            ? 'Plan'
            : item.key === 'home-record'
              ? 'Record'
              : item.key === 'settings'
                ? 'Settings'
                : item.name;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] font-semibold transition-colors',
                active ? 'text-teal-700' : 'text-slate-500 hover:text-slate-800',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="max-w-full truncate">{shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
