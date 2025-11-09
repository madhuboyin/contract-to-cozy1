'use client';

import { useAuth } from '@/lib/auth/AuthContext';

export default function ProfilePage() {
  const { user } = useAuth();

  if (!user) {
    return (
      <div className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-64 bg-gray-200 rounded"></div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">Profile</h1>
          <p className="mt-2 text-sm text-gray-700">
            Your account information
          </p>
        </div>
      </div>

      <div className="mt-8">
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-6">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                <div className="text-base text-gray-900">
                  {user.firstName || 'Not provided'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                <div className="text-base text-gray-900">
                  {user.lastName || 'Not provided'}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="text-base text-gray-900">{user.email}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role
                </label>
                <div>
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {user.role}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Status
                </label>
                <div>
                  {user.status ? (
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                      user.status === 'ACTIVE' 
                        ? 'bg-green-100 text-green-800'
                        : user.status === 'PENDING_VERIFICATION'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {user.status.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-500">Not set</span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Verified
                </label>
                <div className="flex items-center">
                  {user.emailVerified ? (
                    <>
                      <span className="text-green-600 text-xl mr-2">✓</span>
                      <span className="text-sm text-gray-900">Verified</span>
                    </>
                  ) : (
                    <>
                      <span className="text-yellow-600 text-xl mr-2">⚠</span>
                      <span className="text-sm text-gray-900">Not verified</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
