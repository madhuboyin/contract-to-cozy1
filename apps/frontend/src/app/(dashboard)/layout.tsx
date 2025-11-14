// apps/frontend/src/app/(dashboard)/layout.tsx

'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

// Assuming the User type has a 'role' and a 'segment' field for differentiation
interface UserContext {
  role: 'HOMEOWNER' | 'PROVIDER';
  segment?: 'HOME_BUYER' | 'EXISTING_OWNER'; // Assuming these segments exist
  // other fields like firstName, lastName, etc.
}

// Helper function to get the correct display name for the user's status
const getStatusDisplayName = (user: UserContext) => {
  // 1. Check for specific segment for Homeowners
  if (user.role === 'HOMEOWNER') {
    if (user.segment === 'HOME_BUYER') {
      return 'Home Buyer';
    }
    if (user.segment === 'EXISTING_OWNER') {
      return 'Home Owner';
    }
    // Fallback for generic HOMEOWNER
    return 'Home Owner';
  }
  // 2. Default to role for other types (e.g., PROVIDER)
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
  
  // Use the getStatusDisplayName helper to get the descriptive status
  const userStatus = getStatusDisplayName(user as UserContext);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: '投' },
    { name: 'Bookings', href: '/dashboard/bookings', icon: '套' },
    { name: 'Providers', href: '/dashboard/providers', icon: '剥' },
    ...(user.role === 'HOMEOWNER' ? [
      { name: 'Properties', href: '/dashboard/properties', icon: '匠' },
    ] : []),
    { name: 'Profile', href: '/dashboard/profile', icon: '側' },
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
                    <span className="mr-2">{item.icon}</span>
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            {/* User Menu */}
            <div className="flex items-center">
              <div className="ml-3 relative flex items-center space-x-4">
                <span className="text-sm text-gray-700">
                  {user.firstName} {user.lastName}
                </span>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {/* FIX: Displaying segment-based status instead of just role */}
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
                <span className="mr-2">{item.icon}</span>
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