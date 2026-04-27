// apps/frontend/src/lib/incidents/stalenessConfig.ts

export type IncidentTypeCategory = 
  | 'WEATHER'           // Short-lived: storms, floods
  | 'SEASONAL'          // Medium-lived: winterization, summer prep
  | 'MAINTENANCE'       // Medium-lived: routine repairs
  | 'STRUCTURAL'        // Long-lived: foundation, roof issues
  | 'FINANCIAL'         // Long-lived: tax, insurance
  | 'COMPLIANCE'        // Long-lived: permits, violations
  | 'DEFAULT';          // Fallback

export interface StalenessThreshold {
  category: IncidentTypeCategory;
  warningDays: number;    // Show warning banner
  staleDays: number;      // Consider stale
  autoResolveDays: number; // Auto-resolve if no action
  description: string;
}

export const STALENESS_THRESHOLDS: Record<IncidentTypeCategory, StalenessThreshold> = {
  WEATHER: {
    category: 'WEATHER',
    warningDays: 3,
    staleDays: 7,
    autoResolveDays: 14,
    description: 'Weather events are time-sensitive and typically resolve quickly'
  },
  SEASONAL: {
    category: 'SEASONAL',
    warningDays: 14,
    staleDays: 30,
    autoResolveDays: 60,
    description: 'Seasonal tasks have moderate urgency within their season'
  },
  MAINTENANCE: {
    category: 'MAINTENANCE',
    warningDays: 21,
    staleDays: 45,
    autoResolveDays: 90,
    description: 'Maintenance issues should be addressed within weeks'
  },
  STRUCTURAL: {
    category: 'STRUCTURAL',
    warningDays: 30,
    staleDays: 60,
    autoResolveDays: 180,
    description: 'Structural issues are long-term concerns requiring careful planning'
  },
  FINANCIAL: {
    category: 'FINANCIAL',
    warningDays: 30,
    staleDays: 60,
    autoResolveDays: 120,
    description: 'Financial matters have specific deadlines but longer planning windows'
  },
  COMPLIANCE: {
    category: 'COMPLIANCE',
    warningDays: 30,
    staleDays: 60,
    autoResolveDays: 120,
    description: 'Compliance issues have regulatory deadlines'
  },
  DEFAULT: {
    category: 'DEFAULT',
    warningDays: 14,
    staleDays: 30,
    autoResolveDays: 90,
    description: 'Default threshold for uncategorized incidents'
  }
};

/**
 * Map incident typeKey or category to a staleness category
 */
export function categorizeIncident(incident: { typeKey: string; category?: string | null }): IncidentTypeCategory {
  const key = (incident.category || incident.typeKey).toLowerCase();
  
  // Weather patterns
  if (key.includes('weather') || key.includes('storm') || key.includes('flood') || 
      key.includes('hurricane') || key.includes('tornado') || key.includes('wind') ||
      key.includes('hail') || key.includes('lightning')) {
    return 'WEATHER';
  }
  
  // Seasonal patterns
  if (key.includes('seasonal') || key.includes('winter') || key.includes('summer') ||
      key.includes('hvac_seasonal') || key.includes('gutter_cleaning') ||
      key.includes('winterization') || key.includes('spring') || key.includes('fall')) {
    return 'SEASONAL';
  }
  
  // Structural patterns
  if (key.includes('structural') || key.includes('foundation') || key.includes('roof') ||
      key.includes('framing') || key.includes('load_bearing') || key.includes('beam') ||
      key.includes('column') || key.includes('wall_crack') || key.includes('settling')) {
    return 'STRUCTURAL';
  }
  
  // Financial patterns
  if (key.includes('financial') || key.includes('tax') || key.includes('insurance') ||
      key.includes('cost') || key.includes('savings') || key.includes('premium') ||
      key.includes('deductible') || key.includes('claim')) {
    return 'FINANCIAL';
  }
  
  // Compliance patterns
  if (key.includes('compliance') || key.includes('permit') || key.includes('violation') ||
      key.includes('code') || key.includes('regulation') || key.includes('inspection') ||
      key.includes('certificate') || key.includes('license')) {
    return 'COMPLIANCE';
  }
  
  // Maintenance patterns
  if (key.includes('maintenance') || key.includes('repair') || key.includes('service') ||
      key.includes('replace') || key.includes('fix') || key.includes('leak') ||
      key.includes('broken') || key.includes('malfunction')) {
    return 'MAINTENANCE';
  }
  
  return 'DEFAULT';
}

/**
 * Get staleness threshold for an incident
 */
export function getStalenessThreshold(incident: { typeKey: string; category?: string | null }): StalenessThreshold {
  const category = categorizeIncident(incident);
  return STALENESS_THRESHOLDS[category];
}

/**
 * Calculate staleness status for an incident
 */
export interface StalenessStatus {
  ageInDays: number;
  category: IncidentTypeCategory;
  threshold: StalenessThreshold;
  isWarning: boolean;
  isStale: boolean;
  shouldAutoResolve: boolean;
  daysUntilAutoResolve: number;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export function calculateStalenessStatus(
  incident: { typeKey: string; category?: string | null; createdAt: string }
): StalenessStatus {
  const threshold = getStalenessThreshold(incident);
  const ageInDays = Math.floor(
    (Date.now() - new Date(incident.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );
  
  const isWarning = ageInDays >= threshold.warningDays;
  const isStale = ageInDays >= threshold.staleDays;
  const shouldAutoResolve = ageInDays >= threshold.autoResolveDays;
  const daysUntilAutoResolve = Math.max(0, threshold.autoResolveDays - ageInDays);
  
  let message = '';
  let severity: 'info' | 'warning' | 'critical' = 'info';
  
  if (shouldAutoResolve) {
    severity = 'critical';
    message = `This ${threshold.category.toLowerCase()} incident is ${ageInDays} days old and will be auto-resolved soon.`;
  } else if (isStale) {
    severity = 'warning';
    message = `This ${threshold.category.toLowerCase()} incident is ${ageInDays} days old. It will auto-resolve in ${daysUntilAutoResolve} days if no action is taken.`;
  } else if (isWarning) {
    severity = 'warning';
    message = `This ${threshold.category.toLowerCase()} incident is ${ageInDays} days old. Consider taking action soon.`;
  }
  
  return {
    ageInDays,
    category: threshold.category,
    threshold,
    isWarning,
    isStale,
    shouldAutoResolve,
    daysUntilAutoResolve,
    message,
    severity
  };
}
