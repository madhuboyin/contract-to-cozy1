// apps/frontend/src/types/index.ts
/**
 * Checklist Item Status - Synced with Backend Enum
 */
export type ChecklistItemStatus = 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';

/**
 * User Roles
 */
export type UserRole = 'HOMEOWNER' | 'PROVIDER' | 'ADMIN';

/**
 * User Status
 */
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

/**
 * Booking Status
 */
export type BookingStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

/**
 * Service Category - Synced with Backend Enum
 */
export type ServiceCategory = 
  | 'INSPECTION'
  | 'HANDYMAN'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'HVAC'
  | 'LANDSCAPING'
  | 'CLEANING'
  | 'MOVING'
  | 'PEST_CONTROL'
  | 'LOCKSMITH'
  | 'INSURANCE'
  | 'ATTORNEY'
  | 'FINANCE'
  | 'WARRANTY'
  | 'ADMIN';

  export type WarrantyCategory = 
  | 'APPLIANCE'
  | 'HVAC'
  | 'ROOFING'
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'STRUCTURAL'
  | 'HOME_WARRANTY_PLAN'
  | 'OTHER';

  export type LocalUpdateCategory =
  | 'INTERNET'
  | 'INSURANCE'
  | 'MAINTENANCE'
  | 'ENERGY';  
/**
 * Recurrence Frequency Enum
 */
export enum RecurrenceFrequency {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMI_ANNUALLY = 'SEMI_ANNUALLY',
  ANNUALLY = 'ANNUALLY',
}

/**
 * Homeowner Segment
 */
export type HomeownerSegment = 'HOME_BUYER' | 'EXISTING_OWNER';

// ============================================================================
// NEW PROPERTY ENUMS (FIX: ADDED RUNTIME CONSTANTS)
// ============================================================================

export const PropertyTypes = {
  SINGLE_FAMILY: 'SINGLE_FAMILY',
  TOWNHOME: 'TOWNHOME',
  CONDO: 'CONDO',
  APARTMENT: 'APARTMENT',
  MULTI_UNIT: 'MULTI_UNIT',
  INVESTMENT_PROPERTY: 'INVESTMENT_PROPERTY',
} as const;
export type PropertyType = keyof typeof PropertyTypes;

export const OwnershipTypes = {
  OWNER_OCCUPIED: 'OWNER_OCCUPIED',
  RENTED_OUT: 'RENTED_OUT',
} as const;
export type OwnershipType = keyof typeof OwnershipTypes;

export const HeatingTypes = {
  HVAC: 'HVAC',
  FURNACE: 'FURNACE',
  HEAT_PUMP: 'HEAT_PUMP',
  RADIATORS: 'RADIATORS',
  UNKNOWN: 'UNKNOWN',
} as const;
export type HeatingType = keyof typeof HeatingTypes;

export const CoolingTypes = {
  CENTRAL_AC: 'CENTRAL_AC',
  WINDOW_AC: 'WINDOW_AC',
  UNKNOWN: 'UNKNOWN',
} as const;
export type CoolingType = keyof typeof CoolingTypes;

export const WaterHeaterTypes = {
  TANK: 'TANK',
  TANKLESS: 'TANKLESS',
  HEAT_PUMP: 'HEAT_PUMP',
  SOLAR: 'SOLAR',
  UNKNOWN: 'UNKNOWN',
} as const;
export type WaterHeaterType = keyof typeof WaterHeaterTypes;

export const RoofTypes = {
  SHINGLE: 'SHINGLE',
  TILE: 'TILE',
  FLAT: 'FLAT',
  METAL: 'METAL',
  UNKNOWN: 'UNKNOWN',
} as const;
export type RoofType = keyof typeof RoofTypes;

// ============================================================================
// NEW RISK ASSESSMENT TYPES (PHASE 3)
// ============================================================================

export type RiskCategory = 'STRUCTURE' | 'SYSTEMS' | 'SAFETY' | 'FINANCIAL_GAP';

/**
 * Result structure for a single asset calculation (from backend riskCalculator.util.ts)
 */
export interface AssetRiskDetail {
    assetName: string;
    systemType: string;
    category: RiskCategory;
    age: number;
    expectedLife: number;
    replacementCost: number;
    probability: number;       
    coverageFactor: number;    
    outOfPocketCost: number;   
    riskDollar: number;        
    riskLevel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH';
    actionCta?: string;
}

/**
 * Full Risk Assessment Report (Matches Prisma model output for frontend use)
 */
export interface RiskAssessmentReport {
    id: string;
    propertyId: string;
    riskScore: number; // 0.0 to 100.0
    financialExposureTotal: number; // Total Risk Dollar Exposure (Converted from Decimal)
    details: AssetRiskDetail[]; // Parsed from JSON
    lastCalculatedAt: string; // ISO Date string
    createdAt: string;
    updatedAt: string;
}

// [NEW TYPE] Lightweight Risk Summary for Dashboard (Epic A)
export type RiskSummaryStatus = 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';

export interface PrimaryRiskSummary {
  propertyId: string;
  propertyName: string | null;
  riskScore: number;
  financialExposureTotal: number; // Converted from Decimal on backend
  // FIX: Added | null to support the fallback summary state in the dashboard component
  lastCalculatedAt: Date | string | null; 
  status: RiskSummaryStatus;
  message?: string; // For NO_PROPERTY status
}


// ============================================================================
// NEW FINANCIAL EFFICIENCY TYPES (PHASE 2 - FES)
// ============================================================================

/**
 * Status for the Financial Efficiency calculation job.
 */
export type FinancialSummaryStatus = 'CALCULATED' | 'QUEUED' | 'MISSING_DATA' | 'NO_PROPERTY';

/**
 * Full Financial Efficiency Report (Matches Prisma model output)
 */
export interface FinancialEfficiencyReport {
  id: string;
  propertyId: string;
  // The final calculated FES score
  financialEfficiencyScore: number; // 0.0 to 100.0+
  
  // Component Breakdown (Actual Costs converted from Decimal on the backend)
  actualInsuranceCost: number;
  actualUtilityCost: number;
  actualWarrantyCost: number;
  marketAverageTotal: number; // Total market average for comparison
  
  // Timestamps
  lastCalculatedAt: string; // ISO Date string
  createdAt: string;
  updatedAt: string;
}

/**
 * Lightweight Financial Efficiency Summary for Dashboard Card.
 */
export interface FinancialReportSummary {
  propertyId: string;
  financialEfficiencyScore: number;
  // Total actual annual cost (AC_Total) for display on the card
  financialExposureTotal: number; 
  status: FinancialSummaryStatus;
  lastCalculatedAt: Date | string | null;
  message?: string;
}

// ============================================================================
// COMMUNITY EVENTS TYPES (PHASE 6)
// ============================================================================

/**
 * Community Event Category
 */
export type CommunityEventCategory =
  | 'FARMERS_MARKET'
  | 'FESTIVAL'
  | 'HOA_MEETING'
  | 'TRASH_PICKUP'
  | 'RECYCLING'
  | 'STREET_PARKING'
  | 'SNOW_EMERGENCY'
  | 'COMMUNITY_ALERT'
  | 'SERVICE_PROVIDER'
  | 'OTHER';

/**
 * Source of the community event
 */
export type CommunityEventSource =
  | 'CITY'
  | 'HOA'
  | 'COUNTY'
  | 'THIRD_PARTY'
  | 'INTERNAL';


// ============================================================================
// NEW DOCUMENT UPLOAD TYPES (ADDED)
// ============================================================================

/**
 * Document Type Enum (Synced with Backend Enum)
 */
export type DocumentType = 
  | 'INSPECTION_REPORT'
  | 'ESTIMATE'
  | 'INVOICE'
  | 'CONTRACT'
  | 'PERMIT'
  | 'PHOTO'
  | 'VIDEO'
  | 'INSURANCE_CERTIFICATE'
  | 'LICENSE'
  | 'OTHER';

/**
 * Document Upload Request DTO
 * Note: The file itself is sent as 'file' in a separate multipart/form-data field.
 */
export interface DocumentUploadInput {
  type: DocumentType;
  name: string;
  description?: string;
  // Exactly one of the following is typically required
  propertyId?: string;
  warrantyId?: string;
  policyId?: string;
}

// ============================================================================
// NEW HOMEOWNER MANAGEMENT TYPES
// ============================================================================

/**
 * Expense Category Enum
 */
export type ExpenseCategory = 
  | 'REPAIR_SERVICE'
  | 'PROPERTY_TAX'
  | 'HOA_FEE'
  | 'UTILITY'
  | 'APPLIANCE'
  | 'MATERIALS'
  | 'OTHER';

/**
 * Core Document Type (Extended to include new relations)
 */
export interface Document {
  id: string;
  name: string;
  fileUrl: string;
  type: DocumentType; // Updated type to use the new DocumentType enum
  description: string | null;
  fileSize: number;
  mimeType: string;
  propertyId: string | null;
  warrantyId: string | null;
  policyId: string | null;
  createdAt: string;
}

/**
 * Expense Interface
 */
export interface Expense {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  bookingId: string | null;
  description: string;
  category: ExpenseCategory;
  amount: number;
  transactionDate: string; // ISO Date string
  createdAt: string;
  updatedAt: string;
}

/**
 * Warranty Interface
 */
export interface Warranty {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  homeAssetId: string | null;
  providerName: string;
  policyNumber: string | null;
  coverageDetails: string | null;
  cost: number | null;
  startDate: string; // ISO Date string
  expiryDate: string; // ISO Date string
  documents: Document[]; // Array of associated documents
  createdAt: string;
  updatedAt: string;
}

/**
 * Insurance Policy Interface
 */
export interface InsurancePolicy {
  id: string;
  homeownerProfileId: string;
  propertyId: string | null;
  carrierName: string;
  policyNumber: string;
  coverageType: string | null;
  premiumAmount: number;
  startDate: string; // ISO Date string
  expiryDate: string; // ISO Date string
  documents: Document[]; // Array of associated documents
  createdAt: string;
  updatedAt: string;
}

// --- CHECKLIST TYPES (FIX: ADDED MISSING TYPES) ---
/**
 * Checklist Item Interface
 */
export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  status: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED'; // Assuming enum values
  serviceCategory: ServiceCategory | null;
  isRecurring: boolean;
  frequency: RecurrenceFrequency | null;
  nextDueDate: string | null;
  lastCompletedDate: string | null;
  checklistId: string;
  propertyId: string | null; // FIX: Added propertyId to the ChecklistItem
  createdAt: string; 
  updatedAt: string;
}

/**
 * Checklist Interface
 */
export interface Checklist {
  id: string;
  homeownerProfileId: string;
  createdAt: string;
  updatedAt: string;
}

// NEW DTO for updating a ChecklistItem
export interface UpdateChecklistItemInput {
  title?: string;
  description?: string | null;
  status?: 'PENDING' | 'COMPLETED' | 'NOT_NEEDED';
  serviceCategory?: ServiceCategory | null;
  isRecurring?: boolean;
  frequency?: RecurrenceFrequency | null;
  nextDueDate?: string | null; // ISO Date string
  lastCompletedDate?: string | null; // ISO Date string
}
// --- END CHECKLIST TYPES ---

// ============================================================================
// CORE APPLICATION TYPES (Existing)
// ============================================================================

/**
 * Homeowner Profile (NEWLY ADDED)
 */
export interface HomeownerProfile {
  id: string;
  userId: string;
  segment: HomeownerSegment; // 'HOME_BUYER' | 'EXISTING_OWNER'

  // Purchase Information 
  closingDate: string | null; // ISO Date string
  purchasePrice: number | null; // Converted from Decimal (12, 2)

  // Preferences
  preferredContactMethod: string | null;
  notificationPreferences: any; // JSON

  // Budget tracking
  totalBudget: number | null; // Converted from Decimal (12, 2)
  spentAmount: number; // Converted from Decimal (12, 2)

  createdAt: string;
  updatedAt: string;
}


/**
 * User
 */
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  emailVerified: boolean;
  status: UserStatus;
  // FIX: Add missing creation date property to resolve the build error in profile/page.tsx
  createdAt: string; 
  segment?: HomeownerSegment; 
  homeownerProfile?: { 
    // Now just link to the main type since it's defined separately
    id: string;
    segment: HomeownerSegment;
  } | null;
}

/**
 * Auth Response
 */
// FIX: Add success property to LoginResponse
export interface LoginResponse {
  success: true; 
  accessToken: string;
  refreshToken: string;
  user: User;
}

// FIX: Add success property to RegisterResponse
export interface RegisterResponse {
  success: true;
  message: string;
  user: User;
  emailVerificationToken?: string;
}

/**
 * Provider - UPDATED to match backend response
 */
export interface Provider {
  id: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
  };
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  businessName: string;
  averageRating: number;
  totalReviews: number;
  totalCompletedJobs: number;
  serviceRadius: number;
  serviceCategories: ServiceCategory[];
}

/**
 * Service - Updated to match database schema
 */
export interface Service {
  id: string;
  name: string;
  category: ServiceCategory;
  inspectionType?: string | null;
  handymanType?: string | null;
  basePrice: string;
  priceUnit: string;
  description: string;
  minimumCharge?: string | null;
  estimatedDuration: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Add these interfaces to your apps/frontend/src/types/index.ts (or the file aliased as "../types")

/**
 * Interface representing the detailed breakdown of the Property Health Score,
 * matching the object returned by the calculateHealthScore utility on the backend.
 */
export interface HealthScoreResult {
  totalScore: number;
  baseScore: number;
  unlockedScore: number;
  maxPotentialScore: number;
  maxBaseScore: number;
  maxExtraScore: number;
  insights: { factor: string; status: string; score: number }[];
  ctaNeeded: boolean;
}

/**
 * HomeAsset interface matching the Prisma schema
 */
export interface HomeAsset {
  id: string;
  propertyId: string;
  assetType: string;
  installationYear: number | null;
  modelNumber: string | null;
  serialNumber: string | null;
  lastServiced: string | null;
  efficiencyRating: string | null;
  warranties?: Warranty[];
}

/**
 * The standard Property interface, updated to include all new optional fields 
 * from the extended database schema (Phase 1).
 */
export interface Property {
  id: string;
  homeownerProfileId: string;
  name: string | null;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary: boolean;
  
  // New Basic/Migrated Fields
  propertyType: PropertyType | null; // Use new type
  propertySize: number | null;
  yearBuilt: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  
  // New Advanced Fields
  ownershipType: OwnershipType | null; // Use new type
  occupantsCount: number | null;
  heatingType: HeatingType | null; // Use new type
  coolingType: CoolingType | null; // Use new type
  waterHeaterType: WaterHeaterType | null; // Use new type
  roofType: RoofType | null; // Use new type
  hvacInstallYear: number | null;
  waterHeaterInstallYear: number | null;
  roofReplacementYear: number | null;
  foundationType: string | null;
  sidingType: string | null;
  electricalPanelAge: number | null;
  lotSize: number | null;
  hasIrrigation: boolean | null;
  hasDrainageIssues: boolean | null;
  hasSmokeDetectors: boolean | null;
  hasCoDetectors: boolean | null;
  hasSecuritySystem: boolean | null;
  hasFireExtinguisher: boolean | null;
  applianceAges: any;
  
  // Home Assets relation
  homeAssets?: HomeAsset[];
  
  createdAt: string;
  updatedAt: string;
  // ... include any other existing fields ...
}

/**
 * The final type returned by the API for property fetches/updates,
 * which includes the calculated health score.
 */
export interface ScoredProperty extends Property {
    healthScore: HealthScoreResult;
}

/**
 * Booking Timeline Entry
 */
export interface BookingTimelineEntry {
  id: string;
  status: BookingStatus;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/**
 * Booking
 */
export interface Booking {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  category: ServiceCategory;
  homeowner: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  provider: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    businessName: string;
  };
  service: {
    id: string;
    name: string;
    category: ServiceCategory;
    basePrice: string;
    priceUnit: string;
  };
  property: {
    id: string;
    name: string | null;
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  actualStartTime: string | null;
  actualEndTime: string | null;
  estimatedPrice: string;
  finalPrice: string | null;
  depositAmount: string | null;
  description: string;
  specialRequests: string | null;
  internalNotes: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  timeline: BookingTimelineEntry[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Community Event
 * Represents a single local event or alert associated with a property location
 */
export interface CommunityEvent {
  id: string;

  // Location context
  city: string;
  state: string;
  zipCode?: string | null;

  // Classification
  category: CommunityEventCategory;
  source: CommunityEventSource;

  // Display
  title: string;
  description?: string | null;

  // Timing
  startTime: string; // ISO date string
  endTime?: string | null;

  // Metadata
  externalUrl?: string | null;
  isAllDay?: boolean;
  isActive: boolean;

  // Audit
  createdAt: string;
  updatedAt: string;
}


// --- ADD CHAT TYPES ---
export type ChatMessageRole = 'user' | 'model';

export interface ChatMessage {
  role: ChatMessageRole;
  text: string;
}

/**
 * API Response Types
 */
export interface APIError {
  success: false;
  message: string;
  error?: {
    message: string;
    code?: string;
    details?: any;
  };
  errors?: any[];
}

export interface APISuccess<T = any> {
  success: true;
  data: T;
  message?: string;
}

export type APIResponse<T = any> = APISuccess<T> | APIError;

/**
 * Pagination
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ============================================================================
// FORM INPUTS (DTOs for Frontend)
// ============================================================================

export interface LoginInput {
  email: string;
  password: string;
}

// FIX: Update RegisterInput to include the optional segment property
export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  segment?: HomeownerSegment;
}

export interface CreateBookingInput {
  providerId: string;
  serviceId: string;
  propertyId: string;
  scheduledDate?: string;
  startTime?: string;
  endTime?: string;
  description: string;
  specialRequests?: string;
  estimatedPrice: number;
  depositAmount?: number;
  // NEW: Health Insight Tracking
  insightFactor?: string;     // e.g., "Age Factor", "Roof Age"
  insightContext?: string;    // e.g., "Property age: 35 years"
}

/**
 * Maintenance Task Template
 */
export interface MaintenanceTaskTemplate {
  id: string;
  title: string;
  description: string | null;
  serviceCategory: ServiceCategory | null;
  defaultFrequency: RecurrenceFrequency;
  sortOrder: number;
}

/**
 * Service Category Config (for UI display)
 */
export interface ServiceCategoryConfig {
  category: ServiceCategory;
  displayName: string;
  description: string;
  icon: string;
}

/**
 * Maintenance Task Configuration
 */
export interface MaintenanceTaskConfig {
  templateId: string;
  title: string;
  description: string | null;
  isRecurring: boolean;
  frequency: RecurrenceFrequency | null;
  nextDueDate: Date | null;
  serviceCategory: ServiceCategory | null;
  propertyId: string; // FIX: ADDED propertyId
}

// NEW DTOs for Home Management

export interface CreateExpenseInput {
  propertyId?: string;
  bookingId?: string;
  description: string;
  category: ExpenseCategory;
  amount: number;
  transactionDate: string; // ISO date string
}
export interface UpdateExpenseInput extends Partial<CreateExpenseInput> {}


export interface CreateWarrantyInput {
  propertyId?: string;
  homeAssetId?: string;
  category: WarrantyCategory;
  providerName: string;
  policyNumber?: string;
  coverageDetails?: string;
  cost?: number;
  startDate: string; // ISO date string
  expiryDate: string; // ISO date string
}
export interface UpdateWarrantyInput extends Partial<CreateWarrantyInput> {}


export interface CreateInsurancePolicyInput {
  propertyId?: string;
  carrierName: string;
  policyNumber: string;
  coverageType?: string;
  premiumAmount: number;
  startDate: string; // ISO date string
  expiryDate: string; // ISO date string
}
export interface UpdateInsurancePolicyInput extends Partial<CreateInsurancePolicyInput> {}

// ============================================================================
// NEW APPLIANCE ORACLE TYPES (PHASE 3)
// ============================================================================

export interface ApplianceRecommendation {
  brand: string;
  model: string;
  features: string[];
  estimatedCost: number;
  energyRating: string;
  warranty: string;
  reasoning: string;
}

export interface ApplianceFailurePrediction {
  applianceName: string;
  category: string;
  currentAge: number;
  expectedLife: number;
  remainingLife: number;
  failureRisk: number; // 0-100%
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  estimatedFailureDate: Date; // ISO Date string in transit, Date object on backend service. Use string here for API response clarity.
  replacementCost: number;
  recommendations: ApplianceRecommendation[];
  maintenanceImpact: string;
}

export interface OracleReport {
  propertyId: string;
  propertyAddress: string;
  totalAppliances: number;
  criticalCount: number;
  highRiskCount: number;
  estimatedTotalCost: number;
  predictions: ApplianceFailurePrediction[];
  generatedAt: string; // ISO Date string
}


// ============================================================================
// NEW BUDGET FORECASTER TYPES (PHASE 3)
// ============================================================================

export interface MonthlyForecast {
  month: string;
  routine: number;
  preventive: number;
  unexpected: number;
  total: number;
  tasks: string[];
}

export interface CategoryBreakdown {
  category: string;
  annualCost: number;
  percentage: number;
  items: string[];
}

export interface BudgetForecast {
  propertyId: string;
  propertyAddress: string;
  propertyAge: number;
  totalAnnualCost: number;
  monthlyAverage: number;
  confidenceLevel: number;
  monthlyForecasts: MonthlyForecast[];
  categoryBreakdowns: CategoryBreakdown[];
  recommendations: string[];
  generatedAt: string; // ISO Date string
}

// ============================================================================
// ORCHESTRATION TYPES (PHASE 7)
// Central intelligence contract between backend + frontend
// ============================================================================

/**
 * Source of an orchestrated action
 */
export type OrchestrationSource = 'RISK' | 'CHECKLIST';

/**
 * Why an action was suppressed
 */
export type SuppressionReason =
  | 'BOOKING_EXISTS'
  | 'COVERED'
  | 'CHECKLIST_TRACKED'
  | 'NOT_ACTIONABLE'
  | 'USER_MARKED_COMPLETE'
  | 'USER_UNMARKED_COMPLETE'
  | 'UNKNOWN';

/**
 * Coverage context (from warranty / insurance)
 */
export type CoverageType = 'HOME_WARRANTY' | 'INSURANCE' | 'NONE';

export interface CoverageInfoDTO {
  hasCoverage: boolean;
  type: CoverageType;
  expiresOn: string | null;
  sourceId?: string | null;
}

/**
 * Individual suppression explanation
 */
export interface SuppressionReasonEntryDTO {
  reason: SuppressionReason;
  message: string;
  relatedId?: string | null;
  relatedType?: 'BOOKING' | 'WARRANTY' | 'INSURANCE' | null;
}

/**
 * Decision trace step (Gap 5)
 */
export interface DecisionTraceStepDTO {
  rule: string; // stable rule identifier
  outcome: 'APPLIED' | 'SKIPPED';
  details?: Record<string, any> | null;
  confidenceImpact?: number; // -1.0 → +1.0
}

export interface ActionConfidenceDTO {
  score: number; // 0 → 1
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation?: string[];
};
/**
 * Orchestrated Action DTO
 * Returned by /api/orchestration/:propertyId
 */
export interface OrchestratedActionDTO {
  id: string;
  actionKey: string;
  source: OrchestrationSource;
  propertyId: string;

  title: string;
  description?: string | null;

  // Risk-specific
  systemType?: string | null;
  category?: string | null;
  riskLevel?: string | null;
  age?: number | null;
  expectedLife?: number | null;
  exposure?: number | null;
  orchestrationActionId?: string | null;

  // Checklist-specific
  checklistItemId?: string | null;
  status?: string | null;
  nextDueDate?: string | null;
  isRecurring?: boolean | null;
  serviceCategory?: ServiceCategory | null;

  coverage?: CoverageInfoDTO;

  cta?: {
    show: boolean;
    label: string | null;
    reason: 'COVERED' | 'MISSING_DATA' | 'ACTION_REQUIRED' | 'NONE';
  };

  // ✅ Non-optional suppression
  suppression: {
    suppressed: boolean;
    reasons: SuppressionReasonEntryDTO[];
    suppressionSource?: {
      type: 'CHECKLIST_ITEM';
      checklistItem: {
        id: string;
        title: string;
        frequency?: string | null;
        nextDueDate?: string | null;
        status: ChecklistItemStatus;
      };
    } | null;
  };

  decisionTrace?: {
    steps: DecisionTraceStepDTO[];
  };

  confidence?: ActionConfidenceDTO;

  priority: number;
  overdue: boolean;
  createdAt?: string | null;
}

/**
 * Orchestration Summary DTO
 */
export interface OrchestrationSummaryDTO {
  propertyId: string;
  pendingActionCount: number;

  derivedFrom: {
    riskAssessment: boolean;
    checklist: boolean;
  };

  // Actionable only
  actions: OrchestratedActionDTO[];

  // Explicitly suppressed (transparent UX)
  suppressedActions: OrchestratedActionDTO[];

  counts: {
    riskActions: number;
    checklistActions: number;
    suppressedActions: number;
  };
}

export type SuppressionSourceDTO = {
  type: 'CHECKLIST_ITEM';
  checklistItem: {
    id: string;
    title: string;
    frequency?: string | null;
    nextDueDate?: string | null; // ISO string
    status: ChecklistItemStatus;
  };
};

/**
 * Community Events API payload
 */
export interface CommunityEventsResponse {
  events: CommunityEvent[];
}

/**
 * Lightweight community event summary for dashboard cards
 */
export interface CommunityEventSummary {
  id: string;
  title: string;
  category: CommunityEventCategory;
  startTime: string;
  externalUrl?: string | null;
}

// --- LOCAL UPDATES TYPES (NEW) ---

export interface LocalUpdate {
  id: string;
  title: string;
  shortDescription: string;
  category: LocalUpdateCategory;
  sourceName: string;
  isSponsored: boolean;
  ctaText: string;
  ctaUrl?: string | null;
}
