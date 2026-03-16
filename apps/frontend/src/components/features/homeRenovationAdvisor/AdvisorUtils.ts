// apps/frontend/src/components/features/homeRenovationAdvisor/AdvisorUtils.ts
// Formatting helpers for the Home Renovation Risk Advisor feature.

export const RENOVATION_TYPE_LABELS: Record<string, string> = {
  ROOM_ADDITION: 'Room Addition',
  BATHROOM_ADDITION: 'Bathroom Addition',
  BATHROOM_FULL_REMODEL: 'Bathroom Full Remodel',
  GARAGE_CONVERSION: 'Garage Conversion',
  BASEMENT_FINISHING: 'Basement Finishing',
  ADU_CONSTRUCTION: 'ADU / Accessory Dwelling',
  DECK_ADDITION: 'Deck Addition',
  PATIO_MAJOR_ADDITION: 'Major Patio Addition',
  STRUCTURAL_WALL_REMOVAL: 'Structural Wall Removal',
  STRUCTURAL_WALL_ADDITION: 'Structural Wall Addition',
  ROOF_REPLACEMENT: 'Roof Replacement',
  STRUCTURAL_REPAIR_MAJOR: 'Major Structural Repair',
};

export const RENOVATION_TYPES = Object.keys(RENOVATION_TYPE_LABELS) as Array<keyof typeof RENOVATION_TYPE_LABELS>;

export function formatRenovationType(value: string): string {
  return RENOVATION_TYPE_LABELS[value] ?? value;
}

export const CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
  UNAVAILABLE: 'Confidence unavailable',
};

export function formatConfidence(level: string): string {
  return CONFIDENCE_LABELS[level] ?? level;
}

export const RISK_LABELS: Record<string, string> = {
  LOW: 'Low risk',
  MODERATE: 'Moderate risk',
  HIGH: 'High risk',
  CRITICAL: 'Critical risk',
  UNKNOWN: 'Risk unknown',
};

export function formatRiskLevel(level: string): string {
  return RISK_LABELS[level] ?? level;
}

export const PERMIT_STATUS_LABELS: Record<string, string> = {
  REQUIRED: 'Permit required',
  LIKELY_REQUIRED: 'Permit likely required',
  UNLIKELY_REQUIRED: 'Permit unlikely required',
  NOT_REQUIRED: 'No permit required',
  UNKNOWN: 'Permit status unknown',
  DATA_UNAVAILABLE: 'Permit data unavailable',
};

export function formatPermitStatus(status: string): string {
  return PERMIT_STATUS_LABELS[status] ?? status;
}

export const LICENSE_STATUS_LABELS: Record<string, string> = {
  REQUIRED: 'Licensed contractor required',
  LIKELY_REQUIRED: 'Licensed contractor likely required',
  UNLIKELY_REQUIRED: 'Licensed contractor unlikely required',
  NOT_REQUIRED: 'No license required',
  UNKNOWN: 'License requirement unknown',
  DATA_UNAVAILABLE: 'Licensing data unavailable',
};

export function formatLicenseStatus(status: string): string {
  return LICENSE_STATUS_LABELS[status] ?? status;
}

export const PERMIT_TYPE_LABELS: Record<string, string> = {
  BUILDING: 'Building permit',
  ELECTRICAL: 'Electrical permit',
  PLUMBING: 'Plumbing permit',
  MECHANICAL: 'Mechanical permit',
  STRUCTURAL: 'Structural permit',
  GRADING: 'Grading permit',
  DEMOLITION: 'Demolition permit',
  OCCUPANCY: 'Certificate of Occupancy',
  ENCROACHMENT: 'Encroachment permit',
  ZONING_VARIANCE: 'Zoning variance',
};

export function formatPermitType(type: string): string {
  return PERMIT_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export const INSPECTION_STAGE_LABELS: Record<string, string> = {
  FOUNDATION: 'Foundation inspection',
  FRAMING: 'Framing inspection',
  ROUGH_ELECTRICAL: 'Rough electrical inspection',
  ROUGH_PLUMBING: 'Rough plumbing inspection',
  INSULATION: 'Insulation inspection',
  DRYWALL: 'Drywall inspection',
  FINAL: 'Final inspection',
  FIRE: 'Fire inspection',
  ENERGY: 'Energy compliance inspection',
};

export function formatInspectionStage(type: string): string {
  return INSPECTION_STAGE_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export const LICENSE_CATEGORY_LABELS: Record<string, string> = {
  GENERAL_CONTRACTOR: 'General contractor',
  ELECTRICAL: 'Licensed electrician',
  PLUMBING: 'Licensed plumber',
  STRUCTURAL_ENGINEER: 'Structural engineer',
  ARCHITECT: 'Licensed architect',
  HVAC: 'HVAC technician',
  ROOFING: 'Roofing contractor',
  SPECIALTY: 'Specialty contractor',
};

export function formatLicenseCategory(type: string): string {
  return LICENSE_CATEGORY_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export const TAX_TRIGGER_LABELS: Record<string, string> = {
  ON_COMPLETION: 'Upon project completion',
  ON_PERMIT: 'When permit is issued',
  NEXT_ASSESSMENT_CYCLE: 'At next assessment cycle',
  ON_SALE: 'Upon sale of property',
  UNKNOWN: 'Timing unknown',
};

export function formatTaxTrigger(type: string): string {
  return TAX_TRIGGER_LABELS[type] ?? type.replace(/_/g, ' ').toLowerCase();
}

export function formatMoneyRange(min: number | null, max: number | null, suffix?: string): string {
  if (min == null && max == null) return 'N/A';
  const fmt = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  if (min == null) return `Up to ${fmt(max!)}${suffix ? ` ${suffix}` : ''}`;
  if (max == null) return `${fmt(min)}+${suffix ? ` ${suffix}` : ''}`;
  if (min === max) return `${fmt(min)}${suffix ? ` ${suffix}` : ''}`;
  return `${fmt(min)} – ${fmt(max)}${suffix ? ` ${suffix}` : ''}`;
}

export function formatDayRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'N/A';
  if (min == null) return `Up to ${max} days`;
  if (max == null) return `${min}+ days`;
  if (min === max) return `${min} days`;
  return `${min}–${max} days`;
}

export function confidenceColorClass(level: string): string {
  switch (level) {
    case 'HIGH': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'MEDIUM': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'LOW': return 'text-orange-700 bg-orange-50 border-orange-200';
    default: return 'text-[hsl(var(--mobile-text-muted))] bg-[hsl(var(--mobile-bg-muted))] border-[hsl(var(--mobile-border-subtle))]';
  }
}

export function riskColorClass(level: string): { dot: string; text: string; bg: string; border: string } {
  switch (level) {
    case 'LOW': return { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200' };
    case 'MODERATE': return { dot: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' };
    case 'HIGH': return { dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200' };
    case 'CRITICAL': return { dot: 'bg-red-500', text: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200' };
    default: return { dot: 'bg-gray-400', text: 'text-gray-600', bg: 'bg-gray-50', border: 'border-gray-200' };
  }
}

export function permitStatusColorClass(status: string): string {
  switch (status) {
    case 'REQUIRED': return 'text-orange-700 bg-orange-50 border-orange-200';
    case 'LIKELY_REQUIRED': return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'NOT_REQUIRED': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    case 'UNLIKELY_REQUIRED': return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    default: return 'text-[hsl(var(--mobile-text-muted))] bg-[hsl(var(--mobile-bg-muted))] border-[hsl(var(--mobile-border-subtle))]';
  }
}

export function warningSeverityClass(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'text-red-700 bg-red-50 border-red-200';
    case 'WARNING': return 'text-amber-700 bg-amber-50 border-amber-200';
    default: return 'text-blue-700 bg-blue-50 border-blue-200';
  }
}
