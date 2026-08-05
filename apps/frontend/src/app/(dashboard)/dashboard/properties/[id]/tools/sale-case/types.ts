export type SaleCaseStatus = 'PREPARING' | 'LISTED' | 'UNDER_CONTRACT' | 'CLOSED' | 'CANCELLED';

export type SaleReadinessSourceType = 'INSPECTION_FINDING' | 'PROJECT' | 'PERMIT' | 'HOME_ACTION' | 'PROPERTY_RECORD';

export type SaleReadinessCategory =
  | 'SAFETY_STRUCTURAL'
  | 'SYSTEMS_MAINTENANCE'
  | 'PERMITS_DISCLOSURE'
  | 'DOCUMENTATION_RECORDS'
  | 'FINANCIAL_DECISION'
  | 'PRESENTATION';

export type SaleReadinessRequirementClass =
  | 'MATERIAL_BLOCKER'
  | 'VERIFICATION_NEEDED'
  | 'OPTIONAL_IMPROVEMENT'
  | 'PRESENTATION'
  | 'PROFESSIONAL_DECISION';

export type SaleReadinessItemStatus = 'OPEN' | 'RESOLVED' | 'WAIVED';

export interface PropertySaleCase {
  id: string;
  propertyId: string;
  status: SaleCaseStatus;
  targetListDate: string | null;
  targetCloseDate: string | null;
  listedAt: string | null;
  underContractAt: string | null;
  closedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleReadinessItem {
  id: string;
  saleCaseId: string;
  sourceEntityType: SaleReadinessSourceType;
  sourceEntityId: string;
  category: SaleReadinessCategory;
  requirementClass: SaleReadinessRequirementClass;
  status: SaleReadinessItemStatus;
  title: string;
  detail: string | null;
  dueAt: string | null;
  canonicalWorkItemId: string | null;
  resolvedAt: string | null;
  waivedAt: string | null;
  waivedReason: string | null;
}

export interface SaleCaseOverview {
  propertyId: string;
  saleIntentConfirmed: boolean;
  canCreate: boolean;
  saleCase: PropertySaleCase | null;
  readinessItems: SaleReadinessItem[];
}

export const REQUIREMENT_CLASS_LABELS: Record<SaleReadinessRequirementClass, string> = {
  MATERIAL_BLOCKER: 'Material blocker',
  VERIFICATION_NEEDED: 'Verification needed',
  OPTIONAL_IMPROVEMENT: 'Optional improvement',
  PRESENTATION: 'Presentation',
  PROFESSIONAL_DECISION: 'Professional decision',
};

export const CATEGORY_LABELS: Record<SaleReadinessCategory, string> = {
  SAFETY_STRUCTURAL: 'Safety & structural',
  SYSTEMS_MAINTENANCE: 'Systems & maintenance',
  PERMITS_DISCLOSURE: 'Permits & disclosure',
  DOCUMENTATION_RECORDS: 'Documentation & records',
  FINANCIAL_DECISION: 'Financial decision',
  PRESENTATION: 'Presentation',
};
