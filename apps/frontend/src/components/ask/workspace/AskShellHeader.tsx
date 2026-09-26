'use client';

import { useQuery } from '@tanstack/react-query';
import { History, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { CtcPropertySelector } from '@/components/layout/CtcPropertySelector';
import { api } from '@/lib/api/client';
import { usePropertyContext } from '@/lib/property/PropertyContext';

export function AskShellHeader({ onOpenHistory }: { onOpenHistory: () => void }) {
  const router = useRouter();
  const { selectedPropertyId, setSelectedPropertyId } = usePropertyContext();
  const { data } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const response = await api.getProperties();
      return response.success ? response.data : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  const properties = data?.properties ?? [];
  const selected = properties.find((property) => property.id === selectedPropertyId);
  const address = selected?.address?.trim() || selected?.name?.trim() || 'Select a home';

  return (
    <header className="flex min-h-[72px] shrink-0 items-center border-b border-stone-200 bg-[#fcfbf8] px-4 sm:px-6" aria-label="Ask Cozy header">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-900 text-white"><Sparkles className="h-4 w-4" aria-hidden="true" /></span>
        <span className="text-base font-semibold tracking-[-0.01em] text-[#17231d]">Ask Cozy</span>
      </div>
      <CtcPropertySelector
        className="ml-4 h-11 min-w-0 bg-white sm:ml-12"
        propertyAddress={address}
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onPropertySelect={(propertyId) => {
          setSelectedPropertyId(propertyId);
          router.replace(`/dashboard/ask?propertyId=${encodeURIComponent(propertyId)}`);
        }}
        onAddProperty={() => router.push('/dashboard/properties/new')}
      />
      <button type="button" onClick={onOpenHistory} aria-label="Open conversation history" className="ml-auto grid h-11 w-11 place-items-center rounded-xl text-slate-600 hover:bg-stone-100 lg:hidden"><History className="h-5 w-5" aria-hidden="true" /></button>
    </header>
  );
}
