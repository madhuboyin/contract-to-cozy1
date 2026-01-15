// apps/frontend/src/components/rooms/GuestBedroomInsightsCard.tsx
'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function GuestBedroomInsightsCard({ profile }: { profile: any }) {
  return (
    <Card className="rounded-2xl border border-black/10 bg-white">
      <CardContent className="p-5 space-y-2">
        <div className="text-sm font-semibold">Guest Bedroom</div>
        <div className="text-xs opacity-70">Hospitality readiness snapshot.</div>

        <div className="mt-3 space-y-1 text-sm">
          {profile?.bedSize && <div>• Bed: {profile.bedSize}</div>}
          {profile?.blackout && <div>• Blackout curtains: {profile.blackout}</div>}
          {profile?.charging && <div>• Charging: {profile.charging}</div>}
          {profile?.linens && <div>• Linens: {profile.linens}</div>}
        </div>
      </CardContent>
    </Card>
  );
}