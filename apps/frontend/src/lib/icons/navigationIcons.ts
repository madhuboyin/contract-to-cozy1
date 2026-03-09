import type { CanonicalIconToken } from './featureIconMap';

type IconEntry = {
  concept: string;
  icon: CanonicalIconToken;
};

export const NAVIGATION_ICONS = {
  homeowner: {
    main: {
      dashboard: { concept: 'property', icon: 'building-2' },
      actions: { concept: 'alerts', icon: 'alert-triangle' },
      properties: { concept: 'property', icon: 'building-2' },
      rooms: { concept: 'room', icon: 'layout-grid' },
      inventory: { concept: 'inventory', icon: 'box' },
      bookings: { concept: 'calendar', icon: 'calendar' },
      providers: { concept: 'providers', icon: 'search' },
    },
    ownerGlobal: {
      warranties: { concept: 'warranty', icon: 'badge-check' },
      insurance: { concept: 'insurance', icon: 'shield' },
      expenses: { concept: 'expenses', icon: 'dollar-sign' },
      documents: { concept: 'documents', icon: 'file-text' },
      reports: { concept: 'reports', icon: 'file-check' },
    },
    protection: {
      incidents: { concept: 'incidents', icon: 'shield-alert' },
      claims: { concept: 'claims', icon: 'clipboard-check' },
      recalls: { concept: 'recalls', icon: 'siren' },
    },
    community: {
      events: { concept: 'community-events', icon: 'calendar-days' },
    },
  },
  provider: {
    dashboard: { concept: 'property', icon: 'building-2' },
    bookings: { concept: 'calendar', icon: 'calendar' },
    services: { concept: 'maintenance', icon: 'wrench' },
    calendar: { concept: 'calendar', icon: 'calendar-days' },
    portfolio: { concept: 'review', icon: 'eye' },
    profile: { concept: 'edit', icon: 'pencil' },
  },
} as const satisfies Record<string, Record<string, IconEntry | Record<string, IconEntry>>>;

export type NavigationIconGroups = typeof NAVIGATION_ICONS;

