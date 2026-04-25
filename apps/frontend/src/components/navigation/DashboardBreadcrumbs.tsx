'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { Breadcrumb } from '@/components/navigation/Breadcrumb';

type Crumb = {
  label: string;
  href?: string;
};

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Today',
  properties: 'My Home',
  providers: 'Providers',
  bookings: 'Bookings',
  profile: 'Profile',
  protect: 'Protect',
  save: 'Save',
  vault: 'Vault',
  'home-lab': 'Home Lab',
  'community-events': 'Community',
  'knowledge-admin': 'Knowledge Admin',
  inventory: 'Inventory',
  items: 'Items',
  rooms: 'Rooms',
  reports: 'Reports',
  claims: 'Claims',
  incidents: 'Incidents',
  timeline: 'Timeline',
  'status-board': 'Status Board',
  'financial-efficiency': 'Financial Efficiency',
  'risk-assessment': 'Risk Assessment',
  'home-score': 'Home Score',
  'health-score': 'Health score',
  onboarding: 'Onboarding',
  edit: 'Edit',
  tools: 'Tools',
  book: 'Book',
  warranties: 'Warranties',
  insurance: 'Insurance',
  seasonal: 'Seasonal',
  settings: 'Settings',
  maintenance: 'Maintenance',
  documents: 'Documents',
  'resolution-center': 'Fix',
};

const ID_PARENT_LABELS: Record<string, string> = {
  properties: 'Property',
  providers: 'Provider',
  bookings: 'Booking',
  claims: 'Claim',
  incidents: 'Incident',
  rooms: 'Room',
  items: 'Item',
};

function isLikelyIdSegment(segment: string): boolean {
  if (!segment) return false;
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment);
  const numericLike = /^\d+$/.test(segment);
  const longToken = /^[A-Za-z0-9_-]{16,}$/.test(segment);
  return uuidLike || numericLike || longToken;
}

function titleize(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function segmentToLabel(segment: string, parentSegment?: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  if (isLikelyIdSegment(segment)) {
    return (parentSegment && ID_PARENT_LABELS[parentSegment]) || 'Details';
  }
  return titleize(segment);
}

export default function DashboardBreadcrumbs() {
  const pathname = usePathname();

  const items = useMemo<Crumb[]>(() => {
    if (!pathname || !pathname.startsWith('/dashboard')) return [];

    const pathWithoutQuery = pathname.split('?')[0];
    const segments = pathWithoutQuery.split('/').filter(Boolean);
    if (segments.length <= 2) {
      return [];
    }

    const crumbs: Crumb[] = [{ label: 'Today', href: '/dashboard' }];
    let partial = '/dashboard';

    for (let index = 1; index < segments.length; index += 1) {
      const segment = segments[index];
      partial = `${partial}/${segment}`;
      const parentSegment = index > 1 ? segments[index - 1] : undefined;
      const label = segmentToLabel(segment, parentSegment);

      crumbs.push({
        label,
        href: index === segments.length - 1 ? undefined : partial,
      });
    }

    return crumbs;
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <div className="mb-3 md:mb-4">
      <Breadcrumb items={items} />
    </div>
  );
}
