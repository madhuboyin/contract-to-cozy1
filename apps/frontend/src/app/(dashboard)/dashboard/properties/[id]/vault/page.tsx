// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/vault/page.tsx
// Vault management page - redirects to inventory with appropriate tab

import { redirect } from 'next/navigation';

interface VaultPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PropertyVaultPage({ params, searchParams }: VaultPageProps) {
  const { id } = await params;
  const search = await searchParams;
  
  // Get tab from query params (assets, documents, coverage)
  const tab = typeof search.tab === 'string' ? search.tab : 'assets';
  
  // Build query string with tab
  const queryParams = new URLSearchParams();
  queryParams.set('tab', tab);
  
  // Preserve other query parameters
  for (const [key, value] of Object.entries(search)) {
    if (key !== 'tab' && typeof value === 'string') {
      queryParams.set(key, value);
    }
  }
  
  // Redirect to inventory with tab parameter
  redirect(`/dashboard/properties/${id}/inventory?${queryParams.toString()}`);
}
