// apps/frontend/src/app/providers/(dashboard)/layout.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';

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
      { name: 'Dashboard', href: '/providers/dashboard', icon: '📊' },
      { name: 'Bookings', href: '/providers/bookings', icon: '📅' },
      { name: 'Services', href: '/providers/services', icon: '🔧' },
      { name: 'Calendar', href: '/providers/calendar', icon: '🗓️' },
      { name: 'Portfolio', href: '/providers/portfolio', icon: '📸' },
      { name: 'Profile', href: '/providers/profile', icon: '⚙️' },
    ],
    []
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-b-2 border-brand-primary" />
          <p className="mt-3 text-sm text-slate-600">Loading provider portal...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'PROVIDER') {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <Link href="/providers/dashboard" className="text-base font-semibold text-slate-900 hover:text-brand-primary">
                Contract to Cozy
              </Link>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Provider Portal</p>
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

          <nav className="mt-3 hidden items-center gap-2 overflow-x-auto pb-1 md:flex">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + '/');
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
                    active ? 'bg-brand-primary text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{item.icon}</span>
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
                const active = pathname === item.href || pathname?.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm font-medium ${
                      active ? 'bg-brand-primary text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
