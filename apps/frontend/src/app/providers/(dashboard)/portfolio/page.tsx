// apps/frontend/src/app/providers/(dashboard)/portfolio/page.tsx

'use client';

import { useState } from 'react';
import {
  BottomSafeAreaReserve,
  MobileCard,
  MobileKpiStrip,
  MobileKpiTile,
  StatusChip,
} from '@/components/mobile/dashboard/MobilePrimitives';
import ProviderShellTemplate from '@/components/providers/ProviderShellTemplate';

interface PortfolioItem {
  id: string;
  title: string;
  description: string;
  serviceCategory: string;
  imageUrl: string;
  completedDate: string;
}

export default function ProviderPortfolioPage() {
  const [portfolioItems] = useState<PortfolioItem[]>([
    {
      id: '1',
      title: 'Complete Home Inspection',
      description: 'Comprehensive 3-hour inspection of a 3-bedroom colonial home',
      serviceCategory: 'Home Inspection',
      imageUrl: 'https://via.placeholder.com/400x300?text=Home+Inspection',
      completedDate: '2025-10-15',
    },
    {
      id: '2',
      title: 'Kitchen Repairs',
      description: 'Fixed cabinet doors, replaced faucet, and repaired tile backsplash',
      serviceCategory: 'Minor Repairs',
      imageUrl: 'https://via.placeholder.com/400x300?text=Kitchen+Repairs',
      completedDate: '2025-10-20',
    },
  ]);

  return (
    <ProviderShellTemplate
      title="Portfolio"
      subtitle="Showcase recent work so homeowners can trust quality before booking."
      eyebrow="Provider Portfolio"
      introAction={
        <button className="inline-flex min-h-[40px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90">
          + Add photos
        </button>
      }
      primaryAction={{
        title: portfolioItems.length > 0 ? 'Keep your best projects visible and current.' : 'Publish your first portfolio project.',
        description:
          'Recent visuals and concise descriptions make provider quality easier to evaluate and improve booking confidence.',
        primaryAction: (
          <button className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90">
            {portfolioItems.length > 0 ? 'Add portfolio photos' : 'Upload first project'}
          </button>
        ),
        impactLabel: portfolioItems.length > 0 ? 'Trust multiplier' : 'Critical social proof',
        confidenceLabel: `${portfolioItems.length} project${portfolioItems.length === 1 ? '' : 's'} published`,
      }}
      trust={{
        confidenceLabel: 'Portfolio trust increases with recent projects, clear captions, and category coverage.',
        freshnessLabel: portfolioItems.length > 0 ? 'Portfolio is active this quarter' : 'No recent portfolio activity',
        sourceLabel: 'Uploaded provider project media and service category tagging.',
        rationale: 'Visual proof helps homeowners quickly validate workmanship and reduce booking uncertainty.',
      }}
      summary={
        <MobileKpiStrip className="sm:grid-cols-3">
          <MobileKpiTile label="Photos" value={portfolioItems.length} hint="Visible projects" />
          <MobileKpiTile label="Views" value="1,234" hint="Profile traffic" />
          <MobileKpiTile label="Featured" value="3" hint="Highlighted work" tone="positive" />
        </MobileKpiStrip>
      }
    >
      {portfolioItems.length > 0 ? (
        <div className="space-y-3">
          {portfolioItems.map((item) => (
            <MobileCard key={item.id} variant="compact" className="overflow-hidden p-0">
              <div className="relative aspect-video bg-slate-100">
                <img src={item.imageUrl} alt={item.title} className="h-full w-full object-cover" />
                <div className="absolute left-3 top-3">
                  <StatusChip tone="info">{item.serviceCategory}</StatusChip>
                </div>
              </div>
              <div className="space-y-2 p-3.5">
                <p className="mb-0 text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mb-0 text-xs text-slate-600">{item.description}</p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500">
                    Completed {new Date(item.completedDate).toLocaleDateString()}
                  </span>
                  <button className="inline-flex min-h-[32px] items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Edit
                  </button>
                </div>
              </div>
            </MobileCard>
          ))}
        </div>
      ) : (
        <MobileCard variant="compact" className="py-10 text-center">
          <p className="mb-0 text-sm font-semibold text-slate-900">No photos yet</p>
          <p className="mb-0 mt-1 text-sm text-slate-500">Add project photos to build trust and improve booking conversion.</p>
          <button className="mt-4 inline-flex min-h-[40px] items-center rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:bg-brand-primary/90">
            Upload first photo
          </button>
        </MobileCard>
      )}

      <MobileCard variant="compact" className="space-y-1.5 bg-sky-50/70">
        <p className="mb-0 text-sm font-semibold text-sky-900">Portfolio tips</p>
        <p className="mb-0 text-xs text-sky-800">Use before/after shots and concise descriptions. Update frequently to signal active, reliable service.</p>
      </MobileCard>

      <BottomSafeAreaReserve size="chatAware" />
    </ProviderShellTemplate>
  );
}
