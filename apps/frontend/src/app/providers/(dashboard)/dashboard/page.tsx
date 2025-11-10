'use client';

export default function ProviderDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900">
          Provider Dashboard
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Welcome to your provider portal! This dashboard is under construction.
        </p>
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">
            Coming Soon
          </h2>
          <ul className="space-y-2 text-blue-800">
            <li>• View and manage your bookings</li>
            <li>• Update your services and pricing</li>
            <li>• Manage your calendar and availability</li>
            <li>• Upload portfolio photos</li>
            <li>• Update your business profile</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
