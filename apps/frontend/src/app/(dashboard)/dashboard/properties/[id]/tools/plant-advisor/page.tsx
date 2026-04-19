'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Plant Advisor is paused (Kill/Pause bucket). Redirect to property inventory.
export default function PlantAdvisorPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params.id) {
      router.replace(`/dashboard/properties/${params.id}/inventory`);
    }
  }, [params.id, router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-2">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-500">Opening tool...</p>
      </div>
    </div>
  );
}
