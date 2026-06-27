'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ActivityFeed from '@/components/features/household/ActivityFeed';

export default function HouseholdActivityPage() {
  const { id: propertyId } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-semibold text-gray-900">Household Activity</h1>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <ActivityFeed propertyId={propertyId} />
        </div>
      </div>
    </div>
  );
}
