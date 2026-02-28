// apps/frontend/src/app/(dashboard)/dashboard/properties/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api/client';
import { Property } from '@/types';
import { useToast } from '@/components/ui/use-toast';

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  SINGLE_FAMILY: 'Single Family',
  TOWNHOME: 'Townhome',
  CONDO: 'Condo',
  APARTMENT: 'Apartment',
  MULTI_UNIT: 'Multi-Unit',
  INVESTMENT_PROPERTY: 'Investment Property',
};

const MAX_PROPERTIES = 10;

export default function PropertiesPage() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const navTarget = searchParams.get('navTarget');

  const navTargetLabelMap: Record<string, string> = {
    rooms: 'Rooms',
    incidents: 'Incidents',
    claims: 'Claims',
    recalls: 'Recalls',
    'seller-prep': 'Home Tools > Seller Prep',
    'home-timeline': 'Home Tools > Home Timeline',
    'status-board': 'Home Tools > Status Board',
    reports: 'Home Admin > Reports',
    'tool:property-tax': 'Home Tools > Property Tax',
    'tool:cost-growth': 'Home Tools > Cost Growth',
    'tool:insurance-trend': 'Home Tools > Insurance Trend',
    'tool:cost-explainer': 'Home Tools > Cost Explainer',
    'tool:true-cost': 'Home Tools > True Cost',
    'tool:sell-hold-rent': 'Home Tools > Sell / Hold / Rent',
    'tool:cost-volatility': 'Home Tools > Volatility',
    'tool:break-even': 'Home Tools > Break-Even',
    'tool:capital-timeline': 'Home Tools > Home Capital Timeline',
  };

  const navTargetLabel = navTarget ? navTargetLabelMap[navTarget] || 'selected section' : null;

  const resolvePropertyHref = (propertyId: string): string => {
    if (!navTarget) return `/dashboard/properties/${propertyId}`;
    if (navTarget === 'rooms') return `/dashboard/properties/${propertyId}/rooms`;
    if (navTarget === 'incidents') return `/dashboard/properties/${propertyId}/incidents`;
    if (navTarget === 'claims') return `/dashboard/properties/${propertyId}/claims`;
    if (navTarget === 'recalls') return `/dashboard/properties/${propertyId}/recalls`;
    if (navTarget === 'seller-prep') return `/dashboard/properties/${propertyId}/seller-prep`;
    if (navTarget === 'home-timeline') return `/dashboard/properties/${propertyId}/timeline`;
    if (navTarget === 'status-board') return `/dashboard/properties/${propertyId}/status-board`;
    if (navTarget === 'reports') return `/dashboard/properties/${propertyId}/reports`;
    if (navTarget.startsWith('tool:')) {
      const toolSlug = navTarget.replace('tool:', '');
      return `/dashboard/properties/${propertyId}/tools/${toolSlug}`;
    }
    return `/dashboard/properties/${propertyId}`;
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setMenuOpenId(null);
    if (!confirm(`Are you sure you want to delete "${name || 'this property'}"?`)) return;

    setDeleting(id);
    try {
      const response = await api.deleteProperty(id);
      if (response.success) {
        setProperties(properties.filter(p => p.id !== id));
        toast({ title: 'Property deleted successfully' });
      } else {
        toast({ title: response.message || 'Failed to delete property', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to delete property. It may have active bookings.', variant: 'destructive' });
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2].map(i => (
              <div key={i} className="h-52 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const canAddMore = properties.length < MAX_PROPERTIES;

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:flex sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Properties</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your properties and service locations
            {properties.length > 0 && (
              <span className="ml-2 text-gray-400">
                · {properties.length} of {MAX_PROPERTIES}
              </span>
            )}
          </p>
        </div>
        {canAddMore && (
          <div className="mt-4 sm:mt-0">
            <Link
              href="/dashboard/properties/new"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Property
            </Link>
          </div>
        )}
      </div>

      {navTargetLabel && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Select a property to continue to <span className="font-semibold">{navTargetLabel}</span>.
        </div>
      )}

      {/* Grid */}
      <div className="mt-8">
        {properties.length === 0 ? (
          /* Empty state */
          <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
            <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <h3 className="mt-3 text-sm font-medium text-gray-900">No properties yet</h3>
            <p className="mt-1 text-sm text-gray-500">Add your first property to get started.</p>
            <div className="mt-6">
              <Link
                href="/dashboard/properties/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Property
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => {
              const isMenuOpen = menuOpenId === property.id;
              const isDeleting = deleting === property.id;
              const typeLabel = property.propertyType ? PROPERTY_TYPE_LABELS[property.propertyType] : null;
              const hasMeta = property.bedrooms || property.bathrooms || property.yearBuilt;

              return (
                <div
                  key={property.id}
                  className={`relative bg-white rounded-xl border transition-all duration-150 group
                    ${property.isPrimary
                      ? 'border-blue-200 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md'
                      : 'border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md'
                    }`}
                >
                  {/* Clickable main area */}
                  <Link
                    href={resolvePropertyHref(property.id)}
                    className="block p-6 pb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset rounded-t-xl"
                  >
                    {/* Top row: badge + property type */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {property.isPrimary && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 text-blue-700">
                            Primary
                          </span>
                        )}
                        {typeLabel && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
                            {typeLabel}
                          </span>
                        )}
                      </div>
                      {/* Spacer so overflow button doesn't overlap */}
                      <div className="w-8" />
                    </div>

                    {/* Property name */}
                    <h3 className="text-base font-semibold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                      {property.name || property.address}
                    </h3>

                    {/* Address */}
                    <div className="flex items-start gap-1.5 text-sm text-gray-500">
                      <svg className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd"
                          d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                          clipRule="evenodd" />
                      </svg>
                      <span>
                        {property.name ? property.address + ', ' : ''}{property.city}, {property.state} {property.zipCode}
                      </span>
                    </div>

                    {/* Meta row: beds · baths · year built */}
                    {hasMeta && (
                      <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                        {property.bedrooms != null && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 12h18M3 6h18M3 18h18" />
                            </svg>
                            {property.bedrooms} bed
                          </span>
                        )}
                        {property.bathrooms != null && (
                          <span>{property.bathrooms} bath</span>
                        )}
                        {property.yearBuilt != null && (
                          <span>Built {property.yearBuilt}</span>
                        )}
                      </div>
                    )}
                  </Link>

                  {/* Footer: View Details CTA */}
                  <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                    <Link
                      href={resolvePropertyHref(property.id)}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
                      tabIndex={-1}
                    >
                      View Details
                      <svg className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>

                    {/* ··· overflow menu */}
                    <div className="relative" ref={isMenuOpen ? menuRef : undefined}>
                      <button
                        aria-label="More options"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(isMenuOpen ? null : property.id);
                        }}
                        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 bottom-8 w-36 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
                          <Link
                            href={`/dashboard/properties/${property.id}/edit`}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                            onClick={() => setMenuOpenId(null)}
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </Link>
                          <button
                            onClick={() => handleDelete(property.id, property.name || property.address)}
                            disabled={isDeleting}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {isDeleting ? 'Deleting…' : 'Delete'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Inline Add Property card */}
            {canAddMore && (
              <Link
                href="/dashboard/properties/new"
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white p-6 text-center hover:border-blue-400 hover:bg-blue-50 transition-all duration-150 group min-h-[180px]"
              >
                <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center mb-3 transition-colors">
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-500 group-hover:text-blue-700 transition-colors">
                  Add a property
                </span>
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
