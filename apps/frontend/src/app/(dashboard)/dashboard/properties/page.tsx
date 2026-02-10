// apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { useToast } from '@/components/ui/use-toast';

export default function PropertiesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadProperties();
  }, []);

  const loadProperties = async () => {
    setLoading(true);
    try {
      const response = await api.getProperties();
      if (response.success) {
        setProperties(response.data.properties);
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name || 'this property'}"?`)) {
      return;
    }

    setDeleting(id);
    try {
      const response = await api.deleteProperty(id);
      if (response.success) {
        setProperties(properties.filter(p => p.id !== id));
        toast({ title: 'Property deleted successfully' });
      } else {
        toast({ title: response.message || 'Failed to delete property', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Failed to delete property. It may have active bookings.', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage your properties and service locations
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/dashboard/properties/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Property
          </Link>
        </div>
      </div>

      {/* Properties List */}
      <div className="mt-8">
        {properties.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No properties</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by adding your first property.
            </p>
            <div className="mt-6">
              <Link
                href="/dashboard/properties/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Property
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <div
                key={property.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 border border-gray-200"
              >
                {/* Primary Badge */}
                {property.isPrimary && (
                  <div className="mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      Primary
                    </span>
                  </div>
                )}

                {/* Property Name */}
                {property.name && (
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    {property.name}
                  </h3>
                )}

                {/* Address */}
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-start">
                    <svg className="w-4 h-4 mr-2 mt-0.5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <p>{property.address}</p>
                      <p>{property.city}, {property.state} {property.zipCode}</p>
                    </div>
                  </div>
                </div>

                {/* Actions: Reconfigured to prioritize View Details */}
                <div className="mt-6 flex items-center justify-between pt-4 border-t border-gray-200">
                  {/* Left: Primary Action (View) */}
                  <Link
                    href={`/dashboard/properties/${property.id}`}
                    className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                  >
                    View Details
                  </Link>
                  {/* Right: Secondary Actions (Edit and Delete) */}
                  <div className="flex items-center space-x-4">
                    <Link
                      href={`/dashboard/properties/${property.id}/edit`}
                      className="text-sm font-medium text-gray-600 hover:text-gray-900"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => handleDelete(property.id, property.name || property.address)}
                      disabled={deleting === property.id}
                      className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting === property.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}