// apps/frontend/src/components/community/CommunityTabs.tsx
'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Trash2, AlertTriangle } from 'lucide-react';

import { EventsTab } from './EventsTab';
import { TrashTab } from './TrashTab';
import { AlertsTab } from './AlertsTab';

interface Props {
  propertyId?: string;
}

export function CommunityTabs({ propertyId }: Props) {
  return (
    <Tabs defaultValue="events" className="space-y-6">
      <TabsList>
        <TabsTrigger value="events" className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Events
        </TabsTrigger>

        <TabsTrigger value="trash" className="flex items-center gap-2">
          <Trash2 className="h-4 w-4" />
          Trash & Recycling
        </TabsTrigger>

        <TabsTrigger value="alerts" className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          City Alerts
        </TabsTrigger>
      </TabsList>

      <TabsContent value="events">
        <EventsTab propertyId={propertyId} />
      </TabsContent>

      <TabsContent value="trash">
        <TrashTab propertyId={propertyId} />
      </TabsContent>

      <TabsContent value="alerts">
        <AlertsTab propertyId={propertyId} />
      </TabsContent>
    </Tabs>
  );
}
