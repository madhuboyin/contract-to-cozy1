// apps/frontend/src/components/rooms/KidsBedroomInsightsCard.tsx
'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default function KidsBedroomInsightsCard({ profile }: { profile: any }) {
  const anchored = profile?.anchorFurniture === 'YES';
  const windowSafe = profile?.windowSafety === 'YES';

  return (
    <Card className="rounded-2xl border border-black/10 bg-white">
      <CardContent className="p-5 space-y-2">
        <div className="text-sm font-semibold">Kids Bedroom</div>
        <div className="text-xs opacity-70">Safety + organization snapshot.</div>

        <div className="mt-3 space-y-1 text-sm">
          {profile?.ageRange && <div>• Age range: {profile.ageRange}</div>}
          {profile?.toyStorage && <div>• Toy storage: {profile.toyStorage}</div>}
          <div>• Furniture anchored: {anchored ? 'Yes' : 'No / Unknown'}</div>
          <div>• Window safety: {windowSafe ? 'Yes' : 'No / Unknown'}</div>
        </div>
      </CardContent>
    </Card>
  );
}