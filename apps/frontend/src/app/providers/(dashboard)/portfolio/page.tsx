// apps/frontend/src/app/providers/(dashboard)/portfolio/page.tsx

'use client';

import { useState } from 'react';

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  serviceCategory: string;
  imageUrl: string;
  completedDate: string;
}

export default function ProviderPortfolioPage() {
  const [portfolioItems] = useState<PortfolioItem[]>([
    {
      id: '1',
      title: 'Complete Home Inspection',
      description: 'Comprehensive 3-hour inspection of a 3-bedroom colonial home',
      serviceCategory: 'Home Inspection',
      imageUrl: 'https://via.placeholder.com/400x300?text=Home+Inspection',
      completedDate: '2025-10-15',
    },
    {
      id: '2',
      title: 'Kitchen Repairs',
      description: 'Fixed cabinet doors, replaced faucet, and repaired tile backsplash',
      serviceCategory: 'Minor Repairs',
      imageUrl: 'https://via.placeholder.com/400x300?text=Kitchen+Repairs',
      completedDate: '2025-10-20',
    },
  ]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Portfolio</h1>
          <p className="mt-2 text-gray-600">Showcase your best work to attract more customers</p>
        </div>
        <button className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Add Photos
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Total Photos</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{portfolioItems.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Portfolio Views</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">1,234</p>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-600">Featured Projects</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">3</p>
        </div>
      </div>

      {/* Portfolio Grid */}
      {portfolioItems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {portfolioItems.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden group">
              <div className="relative aspect-video bg-gray-200">
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 right-2">
                  <span className="px-2 py-1 text-xs font-medium bg-white text-gray-900 rounded-full shadow">
                    {item.serviceCategory}
                  </span>
                </div>
              </div>
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                <p className="mt-2 text-sm text-gray-600">{item.description}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    Completed: {new Date(item.completedDate).toLocaleDateString()}
                  </span>
                  <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No photos yet</h3>
          <p className="mt-1 text-sm text-gray-500">
            Start building your portfolio by adding photos of your completed projects.
          </p>
          <div className="mt-6">
            <button className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
              + Upload First Photo
            </button>
          </div>
        </div>
      )}

      {/* Tips Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">💡 Portfolio Tips</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>• Take high-quality photos with good lighting</li>
          <li>• Show before and after shots when possible</li>
          <li>• Add detailed descriptions of the work performed</li>
          <li>• Feature your best and most recent projects</li>
          <li>• Update your portfolio regularly to show active work</li>
        </ul>
      </div>
    </div>
  );
}
