import { ShieldCheck, Hammer, BarChart2, BookOpen, Cpu, Sparkles } from 'lucide-react';
import type { NavJob } from './jobsNavigation';

/**
 * Dedicated admin console nav. Renders in place of PRIMARY_JOBS for the
 * ADMIN role (see getNavSectionsForRole in jobsNavigation.ts) — never
 * appended alongside the homeowner nav. Keys are `admin-*`-prefixed so
 * they can never collide with PRIMARY_JOBS' 'fix'/'home-lab' keys, which
 * the nav components special-case outside their generic render loop.
 */
export const ADMIN_NAV: NavJob[] = [
  {
    key: 'admin-provider-compliance',
    name: 'Provider Compliance',
    href: '/dashboard/admin/provider-compliance',
    icon: ShieldCheck,
    description: 'Review provider credentials and compliance',
    engines: [],
    globalHref: true,
  },
  {
    key: 'admin-diy-templates',
    name: 'DIY Templates',
    href: '/dashboard/admin/diy/templates',
    icon: Hammer,
    description: 'Manage DIY project templates',
    engines: [],
    globalHref: true,
  },
  {
    key: 'admin-analytics',
    name: 'Analytics',
    href: '/dashboard/analytics-admin',
    icon: BarChart2,
    description: 'Product analytics dashboard',
    engines: [],
    globalHref: true,
  },
  {
    key: 'admin-knowledge',
    name: 'Knowledge Admin',
    href: '/dashboard/knowledge-admin',
    icon: BookOpen,
    description: 'Manage Knowledge Hub articles',
    engines: [],
    globalHref: true,
  },
  {
    key: 'admin-worker-jobs',
    name: 'Worker Jobs',
    href: '/dashboard/worker-jobs',
    icon: Cpu,
    description: 'Background job registry',
    engines: [],
    globalHref: true,
  },
  {
    key: 'admin-personalization',
    name: 'Personalization',
    href: '/dashboard/admin/personalization',
    icon: Sparkles,
    description: 'Review and activate personalization catalog versions',
    engines: [],
    globalHref: true,
  },
];
