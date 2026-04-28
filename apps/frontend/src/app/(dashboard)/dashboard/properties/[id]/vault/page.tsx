// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/vault/page.tsx
// Vault management page - redirects to inventory with appropriate tab

import { redirect } from 'next/navigation';

interface VaultPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function normalizeInventoryTab(tab: string | undefined): 'items' | 'coverage' {
  if (tab === 'coverage') return 'coverage';
  return 'items';
}

export default async function PropertyVaultPage({ params, searchParams }: VaultPageProps) {
  const { id } = await params;
  const search = await searchParams;

  const tab = normalizeInventoryTab(typeof search.tab === 'string' ? search.tab : undefined);

  const queryParams = new URLSearchParams();
  queryParams.set('tab', tab);

  for (const [key, value] of Object.entries(search)) {
    if (key !== 'tab' && typeof value === 'string') {
      queryParams.set(key, value);
    }
  }

  redirect(`/dashboard/properties/${id}/inventory?${queryParams.toString()}`);
}
