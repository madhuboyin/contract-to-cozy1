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
            Your account information and settings
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-6">
        {/* Personal Information */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Personal Information
            </h3>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  First Name
                </label>
                <div className="mt-1 text-sm text-gray-900">{user.firstName}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <div className="mt-1 text-sm text-gray-900">{user.lastName}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Email
                </label>
                <div className="mt-1 text-sm text-gray-900">{user.email}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <div className="mt-1 text-sm text-gray-900">
                  {user.phone || 'Not provided'}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Role
                </label>
                <div className="mt-1">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {user.role}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <div className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user.status === 'ACTIVE' 
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {user.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Account Details */}
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
              Account Details
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Email Verified</div>
                  <div className="text-sm text-gray-500">
                    {user.emailVerified ? 'Verified' : 'Not verified'}
                  </div>
                </div>
                <div>
                  {user.emailVerified ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <button className="text-sm text-blue-600 hover:text-blue-800">
                      Verify email
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-700">Phone Verified</div>
                  <div className="text-sm text-gray-500">
                    {user.phoneVerified ? 'Verified' : 'Not verified'}
                  </div>
                </div>
                <div>
                  {user.phoneVerified ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <button className="text-sm text-blue-600 hover:text-blue-800">
                      Verify phone
                    </button>
                  )}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-700">Member Since</div>
                <div className="text-sm text-gray-500">
                  {new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </div>
              </div>

              {user.lastLoginAt && (
                <div>
                  <div className="text-sm font-medium text-gray-700">Last Login</div>
                  <div className="text-sm text-gray-500">
                    {new Date(user.lastLoginAt).toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio Section */}
        {user.bio && (
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <h3 className="text-lg font-medium leading-6 text-gray-900 mb-4">
                About
              </h3>
              <p className="text-sm text-gray-700">{user.bio}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
