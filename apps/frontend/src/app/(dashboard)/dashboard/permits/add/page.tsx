'use client';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api/client';
import type { CreatePermitPayload } from '@/types';
import AddPermitForm from '@/components/features/permits/AddPermitForm';

export default function AddPermitPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const propertyId = searchParams.get('propertyId') ?? '';

  async function handleSubmit(payload: CreatePermitPayload) {
    await api.createManualPermit(propertyId, payload);
    router.push(`/dashboard/permits?propertyId=${propertyId}`);
  }

  return (
    <div className="p-4 pb-10">
      <div className="mb-4 flex items-center gap-2">
        <Link href={`/dashboard/permits?propertyId=${propertyId}`} className="flex items-center gap-1 text-sm text-[hsl(var(--mobile-text-secondary))]">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
      </div>

      <h1 className="mb-6 text-xl font-bold">Add Permit</h1>

      <AddPermitForm
        onSubmit={handleSubmit}
        onCancel={() => router.push(`/dashboard/permits?propertyId=${propertyId}`)}
      />
    </div>
  );
}
