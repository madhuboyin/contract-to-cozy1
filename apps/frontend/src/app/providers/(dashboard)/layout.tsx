// apps/frontend/src/app/providers/(dashboard)/layout.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Camera, Calendar, LayoutDashboard, Menu, UserCircle2, Wrench, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { resolveProviderNavigationIcon } from '@/lib/icons';

export default function ProviderDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const handleCameraFabClick = () => {
    router.push('/providers/portfolio?capture=1');
  };

  useEffect(() => {
    if (!loading && !user) {
      router.push('/providers/login');
    } else if (!loading && user && user.role !== 'PROVIDER') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    setIsMobileNavOpen(false);
    setIsAccountMenuOpen(false);
  }, [pathname]);

  const navigation = useMemo(
    () => [
      { name: 'Dashboard', href: '/providers/dashboard', icon: resolveProviderNavigationIcon('dashboard', LayoutDashboard) },
      { name: 'Bookings', href: '/providers/bookings', icon: resolveProviderNavigationIcon('bookings', Calendar) },
      { name: 'Services', href: '/providers/services', icon: resolveProviderNavigationIcon('services', Wrench) },
      { name: 'Calendar', href: '/providers/calendar', icon: resolveProviderNavigationIcon('calendar', Calendar) },
      { name: 'Portfolio', href: '/providers/portfolio', icon: resolveProviderNavigationIcon('portfolio', Camera) },
      { name: 'Profile', href: '/providers/profile', icon: resolveProviderNavigationIcon('profile', UserCircle2) },
    ],
    []
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto w-full max-w-7xl animate-pulse space-y-4">
          <div className="h-12 rounded-xl bg-slate-200" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-28 rounded-xl bg-slate-200" />
            <div className="h-28 rounded-xl bg-slate-200" />
          </div>
          <div className="h-64 rounded-xl bg-slate-200" />
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'PROVIDER') {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto max-w-7xl px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href="/providers/dashboard" className="text-base font-semibold text-slate-900 hover:text-brand-primary">
                Contract to Cozy
              </Link>
              <div className="mt-0.5 flex items-center gap-1.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Provider Ops</p>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                  Dense Mode
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAccountMenuOpen((open) => !open)}
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-2.5 pr-3 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
                    {user.firstName?.charAt(0) || 'P'}
                  </span>
                  <span className="hidden sm:inline">{user.firstName}</span>
                </button>

                {isAccountMenuOpen ? (
                  <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                    <Link href="/providers/profile" className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                      Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        logout();
                      }}
                      className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setIsMobileNavOpen((open) => !open)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 md:hidden"
                aria-label="Toggle provider navigation"
              >
                {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <nav className="mt-2 hidden items-center gap-1.5 overflow-x-auto pb-1 md:flex">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold uppercase tracking-[0.08em] transition-colors ${
                    active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {isMobileNavOpen ? (
          <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            <div className="grid grid-cols-2 gap-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex min-h-[40px] items-center gap-2 rounded-md px-3 text-xs font-semibold uppercase tracking-[0.08em] ${
                      active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8">{children}</main>

      <button
        type="button"
        onClick={handleCameraFabClick}
        className="fixed bottom-6 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-200/60 transition-transform active:scale-95 md:hidden"
        aria-label="Open camera capture"
      >
        <Camera className="h-6 w-6" />
      </button>
    </div>
  );
}
