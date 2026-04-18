'use client';

import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api/client';
import RelatedTools from '@/components/tools/RelatedTools';
import type { Property } from '@/types';
import type { PageContextId } from '@/features/tools/contextToolMappings';
import { getToolDefinition, type ToolId } from '@/features/tools/toolRegistry';

type HomeToolHeaderProps = {
  toolId: ToolId;
  propertyId?: string | null;
  monitoringAddress?: string | null;
  context?: PageContextId | null;
  currentToolId?: ToolId | null;
  title?: string;
  description?: string;
  className?: string;
};

function formatPropertyAddress(property: Property | null | undefined): string {
  if (!property) return '';
  const locality = [property.city, property.state].filter(Boolean).join(', ');
  return [property.address, locality].filter(Boolean).join(' · ');
}

export default function HomeToolHeader({
  toolId,
  propertyId,
  monitoringAddress,
  context,
  currentToolId,
  title,
  description,
  className,
}: HomeToolHeaderProps) {
  const definition = getToolDefinition(toolId);
  const Icon = definition.icon;

  const propertyQuery = useQuery({
    queryKey: ['home-tool-header-property', propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const response = await api.getProperty(propertyId);
      if (!response.success) return null;
      return response.data;
    },
    enabled: Boolean(propertyId && !monitoringAddress),
    staleTime: 5 * 60 * 1000,
  });

  const resolvedMonitoringAddress =
    monitoringAddress?.trim() ||
    formatPropertyAddress(propertyQuery.data) ||
    (propertyId ? 'Current address' : 'Select an address');

  return (
    <section className={cn('hidden space-y-5 lg:block', className)}>
      <div className="rounded-[20px] border border-[hsl(var(--mobile-border-subtle))] bg-[linear-gradient(180deg,#f8fbfb,#f3f7f7)] px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.05)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--mobile-border-subtle))] bg-[#eff6f5] text-[hsl(var(--mobile-brand-strong))]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="mb-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Home Tool
            </p>
            <h2 className="mb-0 mt-0.5 text-base font-semibold leading-snug tracking-tight text-slate-900">
              {title ?? definition.label}
            </h2>
            <p className="mb-0 mt-1 text-xs leading-relaxed text-slate-500">
              {description ?? definition.description}
            </p>
            <p className="mb-0 mt-2 text-xs font-medium text-[hsl(var(--mobile-brand-strong))]">
              {resolvedMonitoringAddress}
            </p>
          </div>
        </div>
      </div>

      <RelatedTools
        context={context ?? toolId}
        currentToolId={currentToolId ?? toolId}
        propertyId={propertyId}
        minViewport="lg"
      />
    </section>
  );
}
