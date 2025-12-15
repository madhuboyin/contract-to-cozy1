'use client';

import { Calendar, ExternalLink, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { CommunityEvent } from '@/types';

interface CommunityEventsListProps {
  events: CommunityEvent[];
}

export const CommunityEventsList: React.FC<CommunityEventsListProps> = ({ events }) => {
  return (
    <div className="space-y-4">
      {events.map((event, idx) => (
        <Card key={event.id} className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center justify-between">
              <span>{event.title}</span>
              {event.externalUrl && (
                <a
                  href={event.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  View <ExternalLink className="inline h-3 w-3" />
                </a>
              )}
            </CardTitle>
            <CardDescription className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {new Date(event.startTime).toLocaleString()}
              {event.endTime && ` - ${new Date(event.endTime).toLocaleString()}`}
            </CardDescription>
            {(event.city || event.state) && (
              <CardDescription className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {event.city && event.state ? `${event.city}, ${event.state}` : event.city || event.state}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="pt-2 text-sm text-gray-700">
            {event.description || 'No description available.'}
          </CardContent>
          {idx < events.length - 1 && <Separator className="mx-6" />}
        </Card>
      ))}
    </div>
  );
};

