// apps/frontend/src/components/layout/CtcTopCommandBar.tsx
'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bell, AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';
import { useNotifications } from '@/lib/notifications/NotificationContext';
import { CtcCommandSearch } from './CtcCommandSearch';
import { CtcPropertySelector } from './CtcPropertySelector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const { notifications, unreadCount, markRead } = useNotifications();
  
  // Get recent unread notifications (max 3)
  const recentUnread = notifications
    .filter(n => !n.isRead)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const handleViewAll = () => {
    router.push('/dashboard/notifications');
  };

  const handleNotificationClick = async (notification: any) => {
    await markRead(notification.id);
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px]">
        <div className="px-3 py-2 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {unreadCount > 0 
              ? `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`
              : 'You\'re all caught up'}
          </p>
        </div>
        
        {recentUnread.length > 0 ? (
          <>
            <div className="max-h-[320px] overflow-y-auto">
              {recentUnread.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className="w-full flex items-start gap-3 px-3 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 text-left"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50">
                    <Bell className="h-4 w-4 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 line-clamp-1">
                      {notification.title}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {formatTimeAgo(notification.createdAt)}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <div className="h-2 w-2 rounded-full bg-teal-500 shrink-0 mt-2" />
                  )}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <div className="px-3 py-2">
              <button
                onClick={handleViewAll}
                className="w-full text-center text-sm font-medium text-teal-600 hover:text-teal-700 py-1"
              >
                View all notifications →
              </button>
            </div>
          </>
        ) : (
          <div className="px-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 mx-auto mb-2">
              <Check className="h-6 w-6 text-teal-600" />
            </div>
            <p className="text-sm font-medium text-slate-900">All caught up!</p>
            <p className="text-xs text-slate-500 mt-1">No new notifications</p>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
