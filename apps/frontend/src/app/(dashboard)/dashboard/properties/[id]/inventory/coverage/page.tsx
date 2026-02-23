// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/page.tsx

import { redirect } from 'next/navigation';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/properties/${id}/inventory?tab=coverage`);
}
