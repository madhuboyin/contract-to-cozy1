// apps/frontend/src/components/rooms/MasterBedroomInsightsCard.tsx
'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function MasterBedroomInsightsCard({ profile }: { profile: any }) {
  return (
    <Card className="rounded-2xl border border-black/10 bg-white">
      <CardContent className="p-5 space-y-2">
        <div className="text-sm font-semibold">Master Bedroom</div>
        <div className="text-xs opacity-70">Comfort + sleep environment snapshot.</div>

        <div className="mt-3 space-y-1 text-sm">
          {profile?.bedSize && <div>• Bed: {profile.bedSize}</div>}
          {profile?.mattressType && <div>• Mattress: {profile.mattressType}</div>}
          {profile?.noiseLevel && <div>• Noise: {profile.noiseLevel}</div>}
          {profile?.storage && <div>• Storage: {profile.storage}</div>}
        </div>
      </CardContent>
    </Card>
  );
}