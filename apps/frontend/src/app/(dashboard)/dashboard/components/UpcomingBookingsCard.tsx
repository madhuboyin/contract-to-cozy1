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

interface UpcomingBookingsCardProps {
    propertyId?: string;
}

export const UpcomingBookingsCard: React.FC<UpcomingBookingsCardProps> = ({ propertyId }) => {
  const { data, isLoading, error } = useQuery({
    // FIX: Update query key to include propertyId
    queryKey: ['upcoming-bookings', propertyId],
    queryFn: () => api.listBookings({
        // FIX: Pass propertyId to the API client
        propertyId: propertyId, 
        sortBy: 'scheduledDate',
        sortOrder: 'asc',
    }),
    // FIX: Only enable query if propertyId is provided
    enabled: !!propertyId, 
  });

  const rawBookings = data?.success ? data.data.bookings : [];

  const upcomingBookings = React.useMemo(() => {
    if (isLoading || !rawBookings || !propertyId) return [];
    
    const nonUpcomingStatuses = ['COMPLETED', 'CANCELLED', 'DRAFT'];

    return rawBookings
      // START FIX: Defensive client-side filtering by propertyId
      .filter(b => b.property?.id === propertyId) 
      // END FIX
      .filter(b => b.scheduledDate) 
      .filter(b => !isPast(new Date(b.scheduledDate!))) 
      .filter(b => !nonUpcomingStatuses.includes(b.status)) 
      .sort((a, b) => new Date(a.scheduledDate || 0).getTime() - new Date(b.scheduledDate || 0).getTime());
  }, [rawBookings, isLoading, propertyId]); // Added propertyId to dependency array

  const displayBookings = upcomingBookings.slice(0, 3);
  const overflowCount = upcomingBookings.length - displayBookings.length;
  const showMore = overflowCount > 0;
  
  const isAlert = upcomingBookings.some(b => b.status === 'CONFIRMED' || b.status === 'IN_PROGRESS' || b.status === 'PENDING');

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="font-heading text-xl flex items-center gap-2"> 
            <Calendar className="h-5 w-5 text-blue-600" /> 
            Upcoming Bookings
          </CardTitle>
          <CardDescription className="font-body text-sm">
            Your scheduled services
          </CardDescription>
        </div>
        {isAlert ? (
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        ) : (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {isLoading && propertyId ? (
          <div className="space-y-3 pt-2">
            <div className="h-4 w-1/2 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-2/3 rounded bg-gray-200 animate-pulse" />
            <div className="h-4 w-1/3 rounded bg-gray-200 animate-pulse" />
          </div>
        ) : !propertyId ? (
            <p className="font-body text-sm text-gray-500 pt-2">Select a property to view bookings.</p>
        ) : displayBookings.length > 0 ? (
          <div className="space-y-3">
            {displayBookings.map((booking, index) => (
              <React.Fragment key={booking.id}>
                <Link href={`/dashboard/bookings/${booking.id}`} className="block">
                  <div className="flex justify-between items-center p-2 -m-2 rounded hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-2">
                      <Calendar className={`h-4 w-4 flex-shrink-0 ${getStatusColor(booking.status)}`} />
                      <span className="font-body text-sm font-medium text-foreground truncate">
                        {booking.service.name}
                      </span>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="font-body text-sm font-semibold text-gray-700">
                        {booking.scheduledDate ? format(new Date(booking.scheduledDate), 'MMM dd') : 'TBD'}
                      </p>
                      <p className="font-body text-xs text-gray-500">
                        {formatTime(booking.startTime)}
                      </p>
                    </div>
                  </div>
                </Link>
                {index < displayBookings.length - 1 && <Separator />}
              </React.Fragment>
            ))}
          </div>
        ) : (
          <p className="font-body text-sm text-gray-500 pt-2">No upcoming services scheduled for this property.</p>
        )}
        {(error) && (
          <p className="font-body text-sm text-red-500 pt-2">Error loading bookings.</p>
        )}
      </CardContent>
      
      <CardFooter className="border-t pt-4">
        {displayBookings.length > 0 && showMore ? (
            <Link
                href="/dashboard/bookings" 
                className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
                View {overflowCount} More Booking{overflowCount > 1 ? 's' : ''} →
            </Link>
        ) : (
             <Link 
                href="/dashboard/bookings"
                className="font-body text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
             >
                View All Bookings →
             </Link>
        )}
      </CardFooter>
    </Card>
  );
}