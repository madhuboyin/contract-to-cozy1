// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/seller-prep/page.tsx
'use client';

import SellerPrepOverview from '@/components/seller-prep/SellerPrepOverview';

export default function SellerPrepPage({
  params,
}: {
  params: { id: string };
}) {
  return <SellerPrepOverview propertyId={params.id} />;
}
