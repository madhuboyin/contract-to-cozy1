// apps/frontend/src/app/(dashboard)/dashboard/properties/[id]/tools/home-gazette/page.tsx
import { redirect } from 'next/navigation';

type LegacyHomeGazettePageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyHomeGazettePage({ params }: LegacyHomeGazettePageProps) {
  const { id } = await params;
  redirect(`/dashboard/properties/${encodeURIComponent(id)}/tools/home-briefing`);
}
