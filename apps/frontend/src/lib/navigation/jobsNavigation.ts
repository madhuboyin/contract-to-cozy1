import {
  Home,
  Building,
  ClipboardList,
  MessageCircle,
  Settings,
} from 'lucide-react';
import { ElementType } from 'react';
import { ADMIN_NAV } from './adminNavigation';

export interface NavJob {
  key: string;
  name: string;
  href: string;
  icon: ElementType;
  description: string;
  engines: string[]; // Keys of tools/engines that belong to this job
  globalHref?: boolean; // true = href is not property-scoped; use as-is regardless of selected property
}

export const PRIMARY_JOBS: NavJob[] = [
  {
    key: 'today',
    name: 'Home',
    href: '/dashboard',
    icon: Home,
    description: 'Attention, decisions, and active work',
    engines: ['daily-snapshot', 'home-event-radar', 'home-gazette', 'status-board', 'protect', 'save'],
  },
  {
    key: 'plan-projects',
    name: 'Plan & Projects',
    href: '/dashboard/resolution-center',
    icon: ClipboardList,
    description: 'Actions, decisions, projects, and major moments',
    engines: ['actions', 'projects', 'bookings', 'claims', 'guidance', 'resolution-center', 'moving-concierge'],
    globalHref: true,
  },
  {
    key: 'home-record',
    name: 'Home Record',
    href: '/dashboard/properties',
    icon: Building,
    description: 'Systems, history, documents, and home facts',
    engines: ['properties', 'inventory', 'documents', 'rooms', 'timeline', 'vault', 'materials', 'warranties', 'insurance'],
  },
  {
    key: 'ask',
    name: 'Ask',
    href: '/dashboard/ask',
    icon: MessageCircle,
    description: 'Guidance grounded in your home',
    engines: ['ask', 'oracle', 'ai-tools'],
    globalHref: true,
  },
  {
    key: 'settings',
    name: 'Profile & Settings',
    href: '/dashboard/profile',
    icon: Settings,
    description: 'Household, preferences, and notifications',
    engines: ['profile', 'household', 'notifications', 'seasonal/settings'],
    globalHref: true,
  },
];

export interface NavSections {
  coreJobs: NavJob[];
  labJob: NavJob | undefined;
  isAdminNav: boolean;
}

/**
 * Derives the nav sections a role should see. ADMIN gets a dedicated,
 * lightweight nav (see adminNavigation.ts) instead of the homeowner
 * PRIMARY_JOBS list — the two must never be merged.
 */
export function getNavSectionsForRole(role: string | undefined): NavSections {
  if (role === 'ADMIN') {
    return { coreJobs: ADMIN_NAV, labJob: undefined, isAdminNav: true };
  }
  return {
    coreJobs: PRIMARY_JOBS,
    labJob: undefined,
    isAdminNav: false,
  };
}
