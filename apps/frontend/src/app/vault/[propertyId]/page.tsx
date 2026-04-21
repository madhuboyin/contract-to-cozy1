// apps/frontend/src/app/vault/[propertyId]/page.tsx
// Public route — no auth wrapper, no dashboard sidebar.

import type { Metadata } from 'next';
import { VaultView } from '@/components/vault/VaultView';

interface Props {
  params: Promise<{ propertyId: string }>;
}

export const metadata: Metadata = {
  title: "Seller's Vault — Contract to Cozy",
  description: 'Verified proof-of-care report for a Contract to Cozy managed property.',
};

export default async function VaultPage({ params }: Props) {
  const { propertyId } = await params;
  return <VaultView propertyId={propertyId} />;
}
