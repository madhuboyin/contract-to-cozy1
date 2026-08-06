export type SaleCaseStatus = 'PREPARING' | 'LISTED' | 'UNDER_CONTRACT' | 'CLOSED' | 'CANCELLED';

export type SaleReadinessSourceType =
  | 'INSPECTION_FINDING'
  | 'PROJECT'
  | 'PERMIT'
  | 'PERMIT_UNPERMITTED_FLAG'
  | 'HOME_ACTION'
  | 'PROPERTY_RECORD'
  | 'MATERIAL_SPEC'
  | 'TIMELINE_EVENT';

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

export type SaleTransitionRetentionDecision = 'RETAIN_PRIVATE_ONLY' | 'SHARE_SELECTED_HISTORY';

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

export interface PropertyTransition {
  id: string;
  saleCaseId: string;
  effectiveAt: string | null;
  sellerRetentionDecision: SaleTransitionRetentionDecision | null;
  sellerRetentionNotes: string | null;
  buyerPackageId: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface SaleCaseOverview {
  propertyId: string;
  saleIntentConfirmed: boolean;
  canCreate: boolean;
  canConfirmSaleIntent?: boolean;
  currentPropertyUse?: string | null;
  saleCase: PropertySaleCase | null;
  readinessItems: SaleReadinessItem[];
  transitions: PropertyTransition[];
}

export const RETENTION_DECISION_LABELS: Record<SaleTransitionRetentionDecision, string> = {
  RETAIN_PRIVATE_ONLY: 'Retain private records only',
  SHARE_SELECTED_HISTORY: 'Share selected history with buyer',
};

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
