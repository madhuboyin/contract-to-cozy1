// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/inventory/coverage/page.tsx

import CoverageClient from './CoverageClient';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // ✅ Await before use
  return <CoverageClient propertyId={id} />;
}