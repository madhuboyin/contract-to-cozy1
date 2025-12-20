// apps/frontend/src/app/(dashboard)/dashboard/components/ProactiveMaintenanceBanner.tsx

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ProactiveMaintenanceBannerProps {
  propertyName: string;
  healthScore: number;
  actionCount: number;
  propertyId: string;
}

export function ProactiveMaintenanceBanner({ 
  propertyName, 
  healthScore, 
  actionCount,
  propertyId 
}: ProactiveMaintenanceBannerProps) {
  
  // Don't show if no actions or no propertyId
  if (actionCount === 0 || !propertyId) return null;

  return (
    <div className="h-[80px] bg-gradient-to-r from-orange-50 to-yellow-50 border-2 border-orange-200 border-l-4 border-l-orange-500 rounded-xl p-4 flex flex-col justify-center gap-2">
      
      {/* Line 1: Title + Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0" />
          <span className="text-[15px] font-semibold text-gray-900">
            Maintenance Needed: Health Score {healthScore}/100
          </span>
        </div>
        <Badge className="bg-orange-600 text-white text-xs font-bold tracking-wide uppercase flex-shrink-0">
          {actionCount} PENDING
        </Badge>
      </div>

      {/* Line 2: Description + Button */}
      <div className="flex items-center justify-between ml-7">
        <span className="text-[13px] text-gray-600">
          {actionCount} {actionCount === 1 ? 'action' : 'actions'} required for {propertyName}
        </span>
        <Link href={`/dashboard/properties/${propertyId}?tab=maintenance`}>
          <Button 
            variant="outline" 
            size="sm"
            className="h-8 text-[13px] font-semibold text-orange-700 border-orange-300 hover:bg-orange-50 hover:border-orange-400 flex-shrink-0"
          >
            View Plan →
          </Button>
        </Link>
      </div>
    </div>
  );
}