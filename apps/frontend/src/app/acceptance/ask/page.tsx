import { notFound } from 'next/navigation';
import { AskWorkspace } from '@/components/ask/AskWorkspace';
import { PropertyProvider } from '@/lib/property/PropertyContext';

export const dynamic = 'force-dynamic';

export default function AskAcceptancePage() {
  if (process.env.ASK_ACCEPTANCE_FIXTURE !== '1') notFound();
  return <PropertyProvider><main className="min-h-screen bg-slate-100 p-4"><AskWorkspace /></main></PropertyProvider>;
}
