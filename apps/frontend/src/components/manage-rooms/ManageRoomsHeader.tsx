'use client';

import { ArrowLeft, LayoutGrid } from 'lucide-react';
import { useRouter } from 'next/navigation';

type ManageRoomsHeaderProps = {
  propertyId: string;
  roomsCount: number;
  totalItems: number;
};

export function ManageRoomsHeader({ propertyId, roomsCount, totalItems }: ManageRoomsHeaderProps) {
  const router = useRouter();

  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-teal-100 bg-teal-50 p-2.5">
            <LayoutGrid className="h-5 w-5 text-teal-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Manage Rooms</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              {roomsCount === 0
                ? 'Add your first room to start tracking items.'
                : `${roomsCount} room${roomsCount === 1 ? '' : 's'} · ${totalItems} item${totalItems === 1 ? '' : 's'} tracked`}
            </p>
          </div>
        </div>

        <button
          onClick={() => router.push(`/dashboard/properties/${propertyId}/inventory`)}
          className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to inventory
        </button>
      </div>
    </div>
  );
}
