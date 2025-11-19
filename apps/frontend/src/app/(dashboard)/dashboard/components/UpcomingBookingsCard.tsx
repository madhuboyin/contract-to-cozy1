//apps/frontend/src/app/(dashboard)/dashboard/components/UpcomingBookingsCard.tsx

import React from 'react';
import Link from 'next/link';
import { Calendar, Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Booking } from '@/types';
import { cn } from '@/lib/utils';

interface UpcomingBookingsCardProps {
  bookings: Booking[];
  className?: string;
}

export const UpcomingBookingsCard = ({ bookings, className }: UpcomingBookingsCardProps) => {
  // Filter for upcoming only (PENDING, CONFIRMED, IN_PROGRESS)
  const upcomingBookings = bookings
    .filter(b => ['PENDING', 'CONFIRMED', 'IN_PROGRESS'].includes(b.status))
    .sort((a, b) => new Date(a.scheduledDate || '').getTime() - new Date(b.scheduledDate || '').getTime())
    .slice(0, 3);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'TBD';
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Upcoming Bookings
        </CardTitle>
        <CardDescription>Scheduled services for your home</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        {upcomingBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-sm">No upcoming bookings</p>
            <Button variant="link" asChild className="mt-2">
              <Link href="/dashboard/providers">Find a Pro</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {upcomingBookings.map((booking) => (
              <div key={booking.id} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
                <div className="space-y-1">
                  <p className="font-medium text-sm">{booking.service.name}</p>
                  <div className="flex items-center text-xs text-muted-foreground">
                    <span className={cn(
                      "inline-block w-2 h-2 rounded-full mr-2",
                      booking.status === 'CONFIRMED' ? "bg-green-500" : "bg-yellow-500"
                    )} />
                    {formatDate(booking.scheduledDate)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {booking.provider.businessName || `${booking.provider.firstName} ${booking.provider.lastName}`}
                  </p>
                </div>
                <Button variant="ghost" size="icon" asChild className="-mt-1">
                  <Link href={`/dashboard/bookings/${booking.id}`}>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};