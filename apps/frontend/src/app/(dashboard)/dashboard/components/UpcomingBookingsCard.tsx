'use client';

import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Booking } from '@/types';
import { format, isPast } from 'date-fns';
import Link from 'next/link';
import { Calendar, ArrowRight } from 'lucide-react';

const getStatusBadge = (status: string) => {
  switch (status.toUpperCase()) {
    case 'CONFIRMED':
      return { variant: 'default' as const, className: 'bg-green-100 text-green-700 hover:bg-green-100' };
    case 'PENDING':
      return { variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' };
    case 'CANCELLED':
      return { variant: 'destructive' as const, className: 'bg-red-100 text-red-700 hover:bg-red-100' };
    default:
      return { variant: 'secondary' as const, className: 'bg-gray-100 text-gray-700 hover:bg-gray-100' };
  }
};

interface UpcomingBookingsCardProps {
  bookings: Booking[];
  isPropertySelected: boolean;
  selectedPropertyId?: string;
}

export const UpcomingBookingsCard: React.FC<UpcomingBookingsCardProps> = ({ 
  bookings,
  isPropertySelected,
  selectedPropertyId
}) => {
  const { displayBookings, totalUpcoming } = React.useMemo(() => {
    const upcoming = bookings
      .filter(b => b.scheduledDate && !isPast(new Date(b.scheduledDate)))
      .sort((a, b) => new Date(a.scheduledDate!).getTime() - new Date(b.scheduledDate!).getTime());
    return { displayBookings: upcoming.slice(0, 3), totalUpcoming: upcoming.length };
  }, [bookings]);

  return (
    <Card className="w-full min-h-[240px] md:min-h-[260px] flex flex-col border-2 border-gray-100 rounded-2xl shadow-sm hover:border-blue-300 hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <CardContent className="p-4 sm:p-5 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Bookings</h3>
          </div>
          <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">
            {totalUpcoming}
          </Badge>
        </div>

        {/* Items List */}
        <div className="overflow-hidden">
          {!isPropertySelected ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Calendar className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">
                Select a property to view upcoming bookings
              </p>
            </div>
          ) : displayBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Calendar className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-sm text-gray-500">No upcoming bookings found</p>
              <Link href="/dashboard/providers">
                <Button variant="link" className="mt-2 text-blue-600">
                  Browse Providers <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {displayBookings.map((booking) => {
                const badge = getStatusBadge(booking.status);
                return (
                  <Link 
                    key={booking.id} 
                    href={`/dashboard/bookings/${booking.id}`}
                    className="block"
                  >
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 hover:border-blue-300 hover:shadow-sm hover:bg-white transition-all cursor-pointer">
                      <h4 className="text-sm font-semibold text-gray-900 mb-1.5 truncate">
                        {booking.service?.name || 'Service Booking'}
                      </h4>
                      <p className="text-xs text-gray-600 mb-1.5 flex items-center gap-2 min-w-0">
                        <span className="shrink-0">{format(new Date(booking.scheduledDate!), 'MMM dd, yyyy')}</span>
                        <span className="shrink-0">•</span>
                        <span className="truncate">{booking.property?.name || 'Property'}</span>
                      </p>
                      <Badge {...badge} className={`text-xs font-medium shrink-0 ${badge.className}`}>
                        {booking.status}
                      </Badge>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* CTA Button */}
        {totalUpcoming > 0 && (
          <div className="pt-4">
            <Link href="/dashboard/bookings">
              <Button 
                variant="ghost" 
                className="w-full text-sm font-semibold text-blue-600 hover:bg-blue-50 hover:text-blue-700 rounded-md gap-2"
              >
                View All {totalUpcoming} <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
