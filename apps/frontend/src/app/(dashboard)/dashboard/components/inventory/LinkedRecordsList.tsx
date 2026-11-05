'use client';

import React from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { InventoryLinkedRecord } from '@/types';

type LinkedRecordsListProps = {
  propertyId: string;
  records: InventoryLinkedRecord[] | undefined;
};

function kindLabel(recordType: string): string {
  const spaced = recordType.replace(/_/g, ' ').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Home Records linked to this item from the Home Records page. They are read-only here: they are managed (linked, unlinked, archived) in Home Records,
 * so this list names them and points there instead of offering a second place to change them. Renders nothing when there are none.
 */
export default function LinkedRecordsList({ propertyId, records }: LinkedRecordsListProps) {
  if (!records || records.length === 0) return null;
  return (
    <div className="mt-4 space-y-2" data-testid="linked-records">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold text-gray-800">Also filed in Home Records</h4>
        <Link href={`/dashboard/properties/${propertyId}/tools/home-records`} className="text-xs font-medium text-brand-primary hover:underline">
          Open Home Records
        </Link>
      </div>
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
        {records.map((record) => (
          <li key={record.linkId} className="flex items-center gap-3 px-3 py-2">
            <FileText className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-gray-800">{record.title}</div>
              <div className="text-xs text-gray-500">
                {kindLabel(record.recordType)}
                {record.lifecycleStatus === 'ARCHIVED' ? ' · Archived' : ''}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
