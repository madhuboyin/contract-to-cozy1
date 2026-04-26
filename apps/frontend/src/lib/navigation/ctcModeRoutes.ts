// apps/frontend/src/lib/navigation/ctcModeRoutes.ts
/**
 * CtC Mode Routes Configuration
 * 
 * Defines the high-level intelligence modes for the command bar navigation.
 */

export type CtcMode = 'overview' | 'protect' | 'save' | 'fix';

export interface CtcModeConfig {
  key: CtcMode;
  label: string;
  matchPatterns: string[];
  getHref: (propertyId?: string) => string;
}

export const CTC_MODES: CtcModeConfig[] = [
  {
    key: 'overview',
    label: 'Overview',
    matchPatterns: [
      '/dashboard',
      '/dashboard/properties',
      '/today',
      '/status-board',
    ],
    getHref: (propertyId) => 
      propertyId ? `/dashboard/properties/${propertyId}` : '/dashboard',
  },
  {
    key: 'protect',
    label: 'Protect',
    matchPatterns: [
      '/protect',
      '/insurance',
      '/warranty',
      '/coverage',
      '/risk-assessment',
    ],
    getHref: (propertyId) => 
      propertyId ? `/dashboard/properties/${propertyId}/protect` : '/dashboard/protect',
  },
  {
    key: 'save',
    label: 'Save',
    matchPatterns: [
      '/save',
      '/financial',
      '/tools/cost',
      '/tools/break-even',
      '/tools/sell-hold-rent',
      '/tools/home-savings',
    ],
    getHref: (propertyId) => 
      propertyId ? `/dashboard/properties/${propertyId}/save` : '/dashboard/save',
  },
  {
    key: 'fix',
    label: 'Fix',
    matchPatterns: [
      '/fix',
      '/resolution-center',
      '/guidance',
      '/maintenance',
      '/incidents',
      '/inventory',
    ],
    getHref: (propertyId) => 
      propertyId ? `/dashboard/properties/${propertyId}/fix` : '/dashboard/fix',
  },
];

/**
 * Determines the active mode based on the current pathname
 */
export function getActiveModeFromPath(pathname: string): CtcMode | null {
  for (const mode of CTC_MODES) {
    if (mode.matchPatterns.some(pattern => pathname.includes(pattern))) {
      return mode.key;
    }
  }
  return null;
}

/**
 * Gets the href for a specific mode
 */
export function getModeHref(mode: CtcMode, propertyId?: string): string {
  const config = CTC_MODES.find(m => m.key === mode);
  return config?.getHref(propertyId) ?? '/dashboard';
}
