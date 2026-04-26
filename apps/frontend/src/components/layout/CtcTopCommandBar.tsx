// apps/frontend/src/components/layout/CtcTopCommandBar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { CtcCommandSearch } from './CtcCommandSearch';
import { CtcPropertySelector } from './CtcPropertySelector';
import { Property } from '@/types';

interface CtcTopCommandBarProps {
  className?: string;
}

function usePropertyData() {
  const { selectedPropertyId } = usePropertyContext();

  // Fetch all properties
  const { data: propertiesResponse } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.getProperties();
      return response.success ? response.data : null;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch selected property details
  const { data: property } = useQuery({
    queryKey: ['property', selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return null;
      const response = await api.getProperty(selectedPropertyId);
      return response.success ? response.data : null;
    },
    enabled: !!selectedPropertyId,
    staleTime: 5 * 60 * 1000,
  });

  const properties = propertiesResponse?.properties || [];
  const address = property?.address || 'Main Home';

  return {
    propertyId: selectedPropertyId,
    propertyAddress: address,
    properties,
  };
}

function NotificationsButton() {
  const router = useRouter();
  const { unreadCount } = useNotifications();

  const handleClick = () => {
    router.push('/dashboard/notifications');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "relative flex items-center justify-center h-12 w-12 rounded-lg",
        "border border-slate-200 bg-slate-50/50 hover:bg-slate-50",
        "transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
      )}
    >
      <Bell className="h-5 w-5 text-slate-600" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}

export function CtcTopCommandBar({ className }: CtcTopCommandBarProps) {
  const router = useRouter();
  const { setSelectedPropertyId } = usePropertyContext();
  const { propertyId, propertyAddress, properties } = usePropertyData();

  const handlePropertySelect = (newPropertyId: string) => {
    setSelectedPropertyId(newPropertyId);
    // Navigate to the property's dashboard
    router.push(`/dashboard/properties/${newPropertyId}`);
  };

  const handleAddProperty = () => {
    router.push('/dashboard/properties/new');
  };

  return (
    <>
      {/* Desktop Command Bar */}
      <div
        className={cn(
          "hidden lg:block fixed top-0 left-0 right-0 z-50 w-full",
          "border-b border-slate-200/70 bg-white/82 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-xl",
          className
        )}
      >
        <div className="mx-auto max-w-[1920px] px-6">
          <div className="flex items-center justify-between h-[72px] gap-6">
            {/* Left: Logo */}
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2.5 shrink-0 group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white transition-transform group-hover:scale-105">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </div>
              <span className="text-[15px] font-semibold tracking-normal text-slate-950">
                ContractToCozy
              </span>
            </Link>

            {/* Center-Left: Command Search (bigger) */}
            <CtcCommandSearch className="flex-1 max-w-[600px]" />

            {/* Center: Property Selector (bigger) */}
            <CtcPropertySelector 
              propertyAddress={propertyAddress}
              properties={properties}
              selectedPropertyId={propertyId}
              onPropertySelect={handlePropertySelect}
              onAddProperty={handleAddProperty}
            />

            {/* Right: Notifications */}
            <div className="flex items-center gap-2 shrink-0">
              <NotificationsButton />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Command Bar */}
      <div
        className={cn(
          "lg:hidden sticky top-0 z-40 w-full",
          "border-b border-slate-200 bg-white/95 backdrop-blur-sm",
          "shadow-[0_1px_3px_rgba(0,0,0,0.04)]",
          className
        )}
      >
        <div className="px-4">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo */}
            <Link 
              href="/dashboard" 
              className="flex items-center gap-2 shrink-0"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-white">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
              </div>
              <span className="text-sm font-semibold text-slate-900 tracking-tight">
                ContractToCozy
              </span>
            </Link>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <NotificationsButton />
            </div>
          </div>

          {/* Mobile Property Selector - Horizontal Scroll */}
          <div className="pb-3 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-2 min-w-max">
              <CtcPropertySelector 
                propertyAddress={propertyAddress}
                properties={properties}
                selectedPropertyId={propertyId}
                onPropertySelect={handlePropertySelect}
                onAddProperty={handleAddProperty}
                className="shrink-0"
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
