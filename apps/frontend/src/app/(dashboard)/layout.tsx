// apps/frontend/src/app/(dashboard)/layout.tsx

'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';
// ✅ FIX 1: Import necessary icons from Lucide React
import { Home, Calendar, Users, ListChecks, User, KeyRound } from 'lucide-react'; 

// --- Helper Types (from prior context) ---
interface UserContext {
  role: 'HOMEOWNER' | 'PROVIDER';
  segment?: 'HOME_BUYER' | 'EXISTING_OWNER';
  firstName: string;
  lastName: string;
}

// ✅ FIX 2: Helper function to get the correct display name for the user's status
const getStatusDisplayName = (user: UserContext) => {
  if (user.role === 'HOMEOWNER') {
    if (user.segment === 'HOME_BUYER') {
      return 'Home Buyer';
    }
    // Fallback for generic HOMEOWNER or existing owner segment
    return 'Home Owner';
  }
  return user.role;
};


export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }
  
  // Cast user for segment/role check
  const currentUser = user as UserContext;
  const userStatus = getStatusDisplayName(currentUser);
  
  // ✅ FIX 3: Replace distorted icon characters with Lucide components
  const navigation = [
    // Dashboard: Home icon
    { name: 'Dashboard', href: '/dashboard', icon: Home }, 
    // Bookings: ListChecks icon
    { name: 'Bookings', href: '/dashboard/bookings', icon: ListChecks }, 
    // Providers: Users icon
    { name: 'Providers', href: '/dashboard/providers', icon: Users }, 
    // Properties: Home icon (for property management)
    ...(currentUser.role === 'HOMEOWNER' ? [
      { name: 'Properties', href: '/dashboard/properties', icon: Home }, 
    ] : []),
    // Profile: User icon
    { name: 'Profile', href: '/dashboard/profile', icon: User }, 
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              {/* Logo */}
              <div className="flex-shrink-0 flex items-center">
                <Link href="/dashboard" className="text-xl font-bold text-blue-600">
                  Contract to Cozy
                </Link>
              </div>

              {/* Navigation Links */}
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`${
                      pathname === item.href
                        ? 'border-blue-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                    } inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium`}
                  >
                    {/* Render Lucide Icon component */}
                    <item.icon className="mr-2 h-4 w-4" />
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* User Menu */}
            <div className="flex items-center">
              <div className="ml-3 relative flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  {currentUser.firstName} {currentUser.lastName}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {/* FIX 4: Display segment-based status */}
                  {userStatus}
                </span>
                <button
                  onClick={logout}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        <div className="sm:hidden border-t border-gray-200">
          <div className="pt-2 pb-3 space-y-1">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`${
                  pathname === item.href
                    ? 'bg-blue-50 border-blue-500 text-blue-700'
                    : 'border-transparent text-gray-500 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-700'
                } block pl-3 pr-4 py-2 border-l-4 text-base font-medium`}
              >
                {/* Render Lucide Icon component for mobile */}
                <item.icon className="mr-2 h-4 w-4 inline-block" />
                {item.name}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}