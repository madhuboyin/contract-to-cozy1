// apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingBookingsCard.tsx
'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/client';
import { Booking } from '@/types';
import { Separator } from '@/components/ui/separator';
import { format, isPast } from 'date-fns';
import Link from 'next/link';
import { Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
const getStatusColor = (status: Booking['status']): string => {
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
        // FIX 1: Removed restrictive 'status' filter from API call 
        // to ensure backend returns results.
        sortBy: 'scheduledDate',
        sortOrder: 'asc',
    }),
  });

  const rawBookings = data?.success ? data.data.bookings : [];

  // Filter out past bookings and sort by scheduled date
  const upcomingBookings = React.useMemo(() => {
    if (isLoading || !rawBookings) return [];
    
    // Define statuses that should NOT be considered upcoming
    const nonUpcomingStatuses = ['COMPLETED', 'CANCELLED', 'DRAFT'];

    return rawBookings
      .filter(b => b.scheduledDate) // Must have a date
      .filter(b => !isPast(new Date(b.scheduledDate!))) // Must be in the future (or today)
      .filter(b => !nonUpcomingStatuses.includes(b.status)) // Must have an active status
      .sort((a, b) => new Date(a.scheduledDate || 0).getTime() - new Date(b.scheduledDate || 0).getTime());
  }, [rawBookings, isLoading]);

  const displayBookings = upcomingBookings.slice(0, 3);
  const overflowCount = upcomingBookings.length - displayBookings.length;
  const showMore = overflowCount > 0;
  
  // Determine if any booking is confirmed/pending/about to start (Alert Triangle)
  const isAlert = upcomingBookings.some(b => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'PENDING');

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Upcoming Bookings
        </CardTitle>
        {isAlert ? (
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        ) : (
          <Calendar className="h-4 w-4 text-blue-500" />
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading ? (
          <div className="space-y-3 pt-2">
            <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
          </div>
        ) : displayBookings.length > 0 ? (
          <div className="space-y-3">
            {displayBookings.map((booking, index) => (
              <React.Fragment key={booking.id}>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center space-x-2">
                    <Calendar className={`h-4 w-4 flex-shrink-0 ${getStatusColor(booking.status)}`} />
                    <Link
                      href={`/dashboard/bookings/${booking.id}`}
                      className="font-medium text-foreground hover:opacity-80 truncate"
                    >
                      {booking.service.name}
                    </Link>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="font-semibold text-gray-700">
                      {booking.scheduledDate ? format(new Date(booking.scheduledDate), 'MMM dd') : 'TBD'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatTime(booking.startTime)}
                    </p>
                  </div>
                </div>
                {index < displayBookings.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 pt-2">No upcoming services scheduled.</p>
        )}
        {(error) && (
          <p className="text-sm text-red-500 pt-2">Error loading bookings.</p>
        )}
      </CardContent>
      
      <CardFooter className="border-t pt-4">
        {displayBookings.length > 0 && showMore ? (
            <Link
                href="/dashboard/bookings" 
                className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
                View {overflowCount} More Booking{overflowCount > 1 ? 's' : ''} &rarr;
            </Link>
        ) : (
             <Button variant="ghost" className="w-full h-8 text-xs font-semibold text-blue-600 hover:text-blue-700" asChild>
                <Link href="/dashboard/bookings">View All Bookings →</Link>
            </Button>
        )}
      </CardFooter>
    </Card>
  );
}