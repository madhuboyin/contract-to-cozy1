// apps/frontend/src/app/(dashboard)/dashboard/components/HomeBuyerDashboard.tsx
// PHASE 5 UPDATED: Integrates new HomeBuyerTask API with existing features

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Truck, Sparkles, FileText, CheckCircle2, Clock, Circle } from 'lucide-react';
import { Booking, Property } from '@/types';
import { UpcomingBookingsCard } from './UpcomingBookingsCard';
import { HomeBuyerChecklistCard } from './HomeBuyerChecklistCard';
import { MyPropertiesCard } from './MyPropertiesCard';
import { FavoriteProvidersCard } from './FavoriteProvidersCard';
import { DashboardChecklistItem } from '../types';
import { PropertyRiskScoreCard } from './PropertyRiskScoreCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api/client';

interface HomeBuyerDashboardProps {
  bookings: Booking[];
  properties: Property[];
  checklistItems: DashboardChecklistItem[];
  userFirstName: string;
}

export const HomeBuyerDashboard = ({
  bookings,
  properties,
  checklistItems,
  userFirstName
}: HomeBuyerDashboardProps) => {
  // PHASE 5: Fetch new HomeBuyerTask statistics
  const [stats, setStats] = useState<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    notNeeded: number;
    progressPercentage: number;
  } | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.getHomeBuyerTaskStats();
        if (response.success) {
          setStats(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };

    fetchStats();
  }, []);

  const primaryPropertyId = (properties && properties.length > 0) ? properties[0].id : undefined;

  const homeBuyerItems = (checklistItems || []).filter(item =>
    !item.isRecurring
  ).sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Welcome to your new home journey, {userFirstName}! 🏠
        </h2>
        <p className="text-muted-foreground">
          Stay on track with your home buying checklist.
        </p>
      </div>

      {/* PHASE 5: NEW Progress Overview Card */}
      {stats && (
        <Card className="border-2 border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="text-xl">Closing Progress</span>
              <Badge className="bg-blue-600 text-white text-lg px-4 py-1">
                {stats.progressPercentage}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="font-medium">
                  {stats.completed} of {stats.total} tasks completed
                </span>
                <span className="text-gray-600">
                  {stats.pending} pending
                </span>
              </div>
              <Progress value={stats.progressPercentage} className="h-3" />
            </div>

            {stats.progressPercentage === 100 ? (
              <div className="bg-green-100 border border-green-300 rounded p-4 text-center">
                <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-800">
                  All tasks complete! You're ready to close! 🎉
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4 text-center text-sm">
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                  <div className="text-xs text-gray-600">Pending</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">{stats.inProgress}</div>
                  <div className="text-xs text-gray-600">In Progress</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                  <div className="text-xs text-gray-600">Completed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-400">{stats.notNeeded}</div>
                  <div className="text-xs text-gray-600">Not Needed</div>
                </div>
              </div>
            )}

            <div className="pt-2 border-t">
              <Link href="/dashboard/checklist">
                <span className="text-sm text-blue-600 hover:text-blue-700 font-medium cursor-pointer">
                  View Full Checklist →
                </span>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3-column grid for top cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <PropertyRiskScoreCard propertyId={primaryPropertyId} />
        
        <div className="md:col-span-1">
          <UpcomingBookingsCard 
            bookings={bookings}
            isPropertySelected={!!primaryPropertyId}
            selectedPropertyId={primaryPropertyId}
          />
        </div>
        
        <div className="md:col-span-1">
          <MyPropertiesCard properties={properties} />
        </div>
      </div>

      {/* Secondary Row for Features and Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Moving Concierge - Featured for Home Buyers */}
        <div className="lg:col-span-2">
          <Link href="/dashboard/moving-concierge">
            <div className="relative bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              <div className="absolute top-4 right-4">
                <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
              </div>
              
              <div className="absolute top-4 right-16">
                <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                  NEW FOR HOME BUYERS
                </span>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="p-4 bg-green-100 rounded-xl group-hover:scale-110 transition-transform">
                  <Truck className="h-10 w-10 text-green-600" />
                </div>
                
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-green-900 mb-2">
                    AI Moving Concierge
                  </h3>
                  <p className="text-green-700 mb-3">
                    Get a personalized moving timeline, task checklist, cost estimates, and AI recommendations for your move
                  </p>
                  <div className="flex gap-3 text-sm text-green-800">
                    <span>✓ Timeline Planning</span>
                    <span>✓ Task Tracking</span>
                    <span>✓ Cost Estimates</span>
                    <span>✓ Utility Setup</span>
                  </div>
                </div>
                
                <div className="text-green-600 group-hover:translate-x-2 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Inspection Report Intelligence - Featured for Home Buyers */}
        <div className="lg:col-span-2">
          <Link href={`/dashboard/inspection-report?propertyId=${primaryPropertyId}`}>
            <div className="relative bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-300 rounded-xl p-6 hover:shadow-xl transition-all cursor-pointer group overflow-hidden">
              <div className="absolute top-4 right-4">
                <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
              </div>
              
              <div className="absolute top-4 right-16">
                <span className="px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                  NEW FOR HOME BUYERS
                </span>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="p-4 bg-indigo-100 rounded-xl group-hover:scale-110 transition-transform">
                  <FileText className="h-10 w-10 text-indigo-600" />
                </div>
                
                <div className="flex-1">
                  <h3 className="text-2xl font-bold text-indigo-900 mb-2">
                    Inspection Report Intelligence
                  </h3>
                  <p className="text-indigo-700 mb-3">
                    Upload your inspection report and get AI-powered analysis with severity scoring, cost estimates, and negotiation guidance
                  </p>
                  <div className="flex gap-3 text-sm text-indigo-800">
                    <span>✓ Issue Extraction</span>
                    <span>✓ Cost Estimates</span>
                    <span>✓ Negotiation Script</span>
                    <span>✓ Maintenance Calendar</span>
                  </div>
                </div>
                
                <div className="text-indigo-600 group-hover:translate-x-2 transition-transform">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Checklist Card */}
        <div className="lg:col-span-2">
          <HomeBuyerChecklistCard items={homeBuyerItems} />
        </div>
        
        {/* Favorite Providers Card */}
        <div className="lg:col-span-2">
          <FavoriteProvidersCard />
        </div>
      </div>
    </div>
  );
};