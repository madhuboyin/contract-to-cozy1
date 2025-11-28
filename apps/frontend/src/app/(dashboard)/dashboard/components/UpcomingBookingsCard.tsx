// apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingBookingsCard.tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { Separator } from '@/components/ui/separator';
import { format, isPast } from 'date-fns';
import Link from 'next/link';
import { Calendar, AlertTriangle, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getStatusColor } from '@/lib/utils/status-colors'; // Assuming this utility exists

/**
 * Helper to format time for display (e.g., 9:00 AM)
 */
const formatTime = (time: string | null) => {
    if (!time) return 'TBD';
    try {
        // Assume time is in HH:mm:ss format
        const [hours, minutes] = time.split(':');
        const date = new Date();
        date.setHours(parseInt(hours, 10), parseInt(minutes, 10));
        return format(date, 'h:mm a');
    } catch {
        return 'TBD';
    }
}

/**
 * Helper to get the correct icon color based on booking status
 */
const getIconColor = (status: Booking['status']): string => {
    switch (status) {
        case 'PENDING':
            return 'text-yellow-500';
        case 'CONFIRMED':
            return 'text-blue-500';
        case 'IN_PROGRESS':
            return 'text-green-500';
        default:
            return 'text-gray-500';
    }
}

export const UpcomingBookingsCard = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['upcoming-bookings'],
    queryFn: () => api.listBookings({
        sortBy: 'scheduledDate',
        sortOrder: 'asc',
    }),
  });

  const rawBookings = data?.success ? data.data.bookings : [];

  const upcomingBookings = React.useMemo(() => {
    if (isLoading || !rawBookings) return [];
    
    const nonUpcomingStatuses = ['COMPLETED', 'CANCELLED', 'DRAFT'];

    return rawBookings
      .filter(b => b.scheduledDate) 
      .filter(b => !isPast(new Date(b.scheduledDate!))) 
      .filter(b => !nonUpcomingStatuses.includes(b.status)) 
      .sort((a, b) => new Date(a.scheduledDate || 0).getTime() - new Date(b.scheduledDate || 0).getTime());
  }, [rawBookings, isLoading]);

  const displayBookings = upcomingBookings.slice(0, 3);
  const overflowCount = upcomingBookings.length - displayBookings.length;
  const showMore = overflowCount > 0;
  
  const isAlert = upcomingBookings.some(b => b.status === 'PENDING' || b.status === 'CONFIRMED');

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-3 pb-2">
        <div className="space-y-0.5">
          {/* FIX: Reduced text size from text-xl to text-lg and icon size */}
          <CardTitle className="font-heading text-lg flex items-center gap-1.5"> 
            <Calendar className="h-4 w-4 text-blue-600" /> 
            Upcoming Services
          </CardTitle>
          <CardDescription className="font-body text-xs">
            Your next scheduled appointments
          </CardDescription>
        </div>
        <div className="flex-shrink-0">
          {isAlert ? (
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          ) : (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
        </div>
      </CardHeader>
      
      {/* FIX: Reduced padding from flex-1 to optimize space, kept height constraint */}
      <CardContent className="flex-1 pt-0">
        {isLoading ? (
          <div className="space-y-2 pt-2">
            <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
          </div>
        ) : displayBookings.length > 0 ? (
          // FIX: Reduced spacing from space-y-3 to space-y-2
          <div className="space-y-2">
            {displayBookings.map((booking, index) => (
              <React.Fragment key={booking.id}>
                <Link href={`/dashboard/bookings/${booking.id}`} className="block">
                  {/* FIX: Reduced item padding from p-2 to p-1 */}
                  <div className="flex justify-between items-center p-1 -m-1 rounded hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-2">
                      <Calendar className={`h-3 w-3 flex-shrink-0 ${getIconColor(booking.status)}`} />
                      <span className="font-body text-sm font-medium text-foreground truncate">
                        {booking.service.name}
                      </span>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {/* Reduced text size for date and time */}
                      <p className="font-body text-xs font-semibold text-gray-700">
                        {booking.scheduledDate ? format(new Date(booking.scheduledDate), 'MMM dd') : 'TBD'}
                      </p>
                      <p className="font-body text-xs text-gray-500">
                        {formatTime(booking.startTime)}
                      </p>
                    </div>
                  </div>
                </Link>
                {index < displayBookings.length - 1 && <Separator className="my-1" />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="font-body text-sm text-gray-500 pt-2">No upcoming services scheduled.</p>
        )}
        {(error) && (
          <p className="font-body text-sm text-red-500 pt-2">Error loading bookings.</p>
        )}
      </CardContent>
      
      {/* FIX: Reduced padding from pt-4 to pt-3 to reduce footer height */}
      <CardFooter className="border-t pt-3">
        {displayBookings.length > 0 && showMore ? (
            <Link
                href="/dashboard/bookings" 
                className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
            >
                View {overflowCount} More Booking{overflowCount > 1 ? 's' : ''} <ArrowRight className="h-4 w-4 ml-1" />
            </Link>
        ) : (
             <Link 
                href="/dashboard/bookings"
                className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors flex items-center"
             >
                View All Bookings <ArrowRight className="h-4 w-4 ml-1" />
             </Link>
        )}
      </CardFooter>
    </Card>
  );
}