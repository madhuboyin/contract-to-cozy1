// apps/backend/src/services/property.service.ts

import { Property, PropertyType, OwnershipType, HeatingType, CoolingType, WaterHeaterType, RoofType, Prisma, ChecklistItem, Warranty } from '@prisma/client';
import { calculateHealthScore, HealthScoreResult } from '../utils/propertyScore.util'; 
import JobQueueService from './JobQueue.service';
import type { HomeAssetDTO } from './propertyApplianceInventory.service';
import {
  syncPropertyApplianceInventoryItems,
  listPropertyAppliancesAsHomeAssets,
} from './propertyApplianceInventory.service';

import { prisma } from '../lib/prisma';

interface HomeAssetInput {
  id?: string; // Optional: Used for client-side tracking, ignored by service but kept for consistency
  type: string; // The canonical appliance type (e.g., 'DISHWASHER')
  installYear: number; // The installation year
}

// === FIX: UPDATE INTERFACES TO USE 'FIELD?: TYPE | null' ===
// This resolves the compilation error by explicitly allowing null for optional DB fields.
interface CreatePropertyData {
  name?: string | null; // Allow null for optional string
  address: string;
  city: string;
  state: string;
  zipCode: string;
  isPrimary?: boolean;

  // Layer 1 - Basic/Migrated Fields
  propertyType?: PropertyType | null;
  propertySize?: number | null; // FIX
  yearBuilt?: number | null;     // FIX
  
  // Layer 2 - Advanced Fields (Migrated and New)
  bedrooms?: number | null;
  bathrooms?: number | null;
  ownershipType?: OwnershipType | null;
  occupantsCount?: number | null;
  heatingType?: HeatingType | null;
  coolingType?: CoolingType | null;
  waterHeaterType?: WaterHeaterType | null;
  roofType?: RoofType | null;
  hvacInstallYear?: number | null;
  waterHeaterInstallYear?: number | null;
  roofReplacementYear?: number | null;
  foundationType?: string | null;
  sidingType?: string | null;
  electricalPanelAge?: number | null;
  lotSize?: number | null; // FIX
  hasIrrigation?: boolean;
  hasDrainageIssues?: boolean;
  hasSmokeDetectors?: boolean;
  hasCoDetectors?: boolean;
  hasSecuritySystem?: boolean;
  hasFireExtinguisher?: boolean;
  hasSumpPumpBackup?: boolean | null;
  primaryHeatingFuel?: string | null;
  hasSecondaryHeat?: boolean | null;
  isResilienceVerified?: boolean;
  isUtilityVerified?: boolean;
  
  homeAssets?: HomeAssetInput[];
}

interface UpdatePropertyData extends Partial<CreatePropertyData> {

}

interface InventoryItemForAI {
  name: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  roomName?: string | null;
  purchaseCostCents?: number | null;      // FIXED: correct field name
  replacementCostCents?: number | null;   // FIXED: correct field name
}

interface ExpenseForAI {
  description: string;
  category: string;
  amount: number;
  transactionDate: Date;
}

interface DocumentForAI {
  name: string;
  type: string;
  createdAt: Date;
}

interface SeasonalTaskForAI {
  title: string;
  season: string;
  priority: string;
  status: string;
}

interface BookingForAI {
  serviceName?: string;
  category: string;
  status: string;
  scheduledDate?: Date | null;
}

interface ClaimForAI {
  title: string;
  type: string;
  status: string;
  providerName?: string | null;
  incidentAt?: Date | null;
  estimatedLossAmount?: number | null;
  settlementAmount?: number | null;
  checklistCompletionPct?: number | null;
}

interface IncidentForAI {
  title: string;
  category?: string | null;
  status: string;
  severity?: string | null;
  sourceType: string;
  summary?: string | null;
  openedAt: Date;
}

interface RecallMatchForAI {
  status: string;
  confidencePct: number;                  // FIXED: correct field name
  itemName?: string | null;
  recallTitle?: string | null;
  recallSeverity?: string | null;         // FIXED: from recall relation
  hazard?: string | null;
  remedy?: string | null;
}

// === INJECT MISSING INTERFACE DEFINITIONS ===
// FIX 1: Add 'warranties: Warranty[]' to include the relation for scoring
export interface PropertyWithAssets extends Property {
  homeAssets: HomeAssetDTO[];
  warranties: Warranty[];
}

export interface ScoredProperty extends PropertyWithAssets {
    healthScore: HealthScoreResult;
}

// [NEW INTERFACE] Defines the minimal subset of Risk Report data needed for AI context.
interface RiskAssessmentReportForAI {
  riskScore: number;
  financialExposureTotal: Prisma.Decimal;
  details: Prisma.InputJsonValue;
  lastCalculatedAt: Date;
}

// Type for renewals (combines warranties and insurance policies)
export interface Renewal {
  id: string;
  expiryDate: Date;
  type: string;
}

export interface PropertyAIGuidance {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: PropertyType | null;
  yearBuilt: number | null;
  heatingType: HeatingType | null;
  coolingType: CoolingType | null;
  roofType: RoofType | null;
  hvacInstallYear: number | null;
  riskReport: RiskAssessmentReportForAI | null;
  maintenanceTasks: ChecklistItem[];
  renewals: Renewal[];
  // Comprehensive property context
  inventoryRooms: { name: string; type: string; itemCount: number }[];
  inventoryItems: InventoryItemForAI[];
  homeAssets: { assetType: string; installationYear?: number | null }[];
  documents: DocumentForAI[];
  expenses: ExpenseForAI[];
  expenseSummary: { totalAmount: number; categoryBreakdown: Record<string, number> };
  seasonalTasks: SeasonalTaskForAI[];
  bookings: BookingForAI[];
  // Claims, Incidents, Recalls
  claims: ClaimForAI[];
  incidents: IncidentForAI[];
  recallMatches: RecallMatchForAI[];
}

export type PropertyNudge =
  | {
      type: 'RESILIENCE_CHECK';
      source: 'PROPERTY';
      title: string;
      description: string;
      question: string;
      field: 'hasSumpPumpBackup';
      options: Array<{ label: string; value: boolean | null }>;
    }
  | {
      type: 'UTILITY_SETUP';
      source: 'PROPERTY';
      title: string;
      description: string;
      question: string;
      field: 'primaryHeatingFuel';
      options: Array<{ label: string; value: string }>;
    };

async function hydrateHomeAssetsFromInventory<T extends { id: string }>(
  property: T
): Promise<T & { homeAssets: HomeAssetDTO[] }> {
  const homeAssets = await listPropertyAppliancesAsHomeAssets(property.id);
  return { ...(property as any), homeAssets };
}


// --- SCORE ATTACHMENT ---

/**
 * Helper function to calculate and attach the score to a property object.
 * UPDATED: Now fetches full booking objects to support insightFactor-based suppression
 */
async function attachHealthScore(property: PropertyWithAssets): Promise<ScoredProperty> {
    const documentCount = await prisma.document.count({
        where: { propertyId: property.id }
    });

    // UPDATED: Fetch full booking objects instead of just categories
    // We need insightFactor field for precise suppression logic
    const activeBookings = await prisma.booking.findMany({
        where: {
            propertyId: property.id,
            // We check for PENDING (scheduled but not done), CONFIRMED, or IN_PROGRESS.
            // COMPLETED/CANCELLED do not count as "active resolution in progress".
            status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] } 
        },
        // Select all fields needed for insightFactor-based suppression
        select: {
            id: true,
            category: true,
            status: true,
            insightFactor: true,    // NEW: Needed for precise suppression
            insightContext: true,   // NEW: Optional context
            propertyId: true,       // Needed for matching
        }
    });

    // Cast to Booking type for compatibility with calculateHealthScore
    const bookingsForScore = activeBookings as any[];

    let healthScore: HealthScoreResult;
    try {
        // UPDATED CALL: Pass full booking objects instead of just category strings
        healthScore = calculateHealthScore(property, documentCount, bookingsForScore);
    } catch (error) {
        console.error(`CRITICAL: Health score calculation failed for Property ID ${property.id}. Returning default score.`, error);
        // Fallback to a zero score and default insights to prevent server crash
        healthScore = { 
            totalScore: 0, 
            baseScore: 0, 
            unlockedScore: 0, 
            maxPotentialScore: 100,
            maxBaseScore: 55,
            maxExtraScore: 45,
            insights: [{ factor: "Calculation Error", status: "CRASHED", score: 0 }],
            ctaNeeded: true
        };
    }

    return {
        ...property,
        healthScore,
    } as ScoredProperty;
}

/**
 * Get homeowner profile ID for a user
 */
async function getHomeownerProfileId(userId: string): Promise<string> {
  const profile = await prisma.homeownerProfile.findFirst({
    where: { userId },
  });

  if (!profile) {
    throw new Error('Homeowner profile not found');
  }

  return profile.id;
}

// --- CRUD OPERATIONS ---

/**
 * Get all properties for a user
 */
export async function getUserProperties(userId: string): Promise<ScoredProperty[]> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const properties = await prisma.property.findMany({
    where: { homeownerProfileId },
    orderBy: [
      { isPrimary: 'desc' },
      { createdAt: 'desc' },
    ],
    include: {
      homeownerProfile: true,
      //homeAssets: true, 
      // FIX 3: Include warranties in the fetch query
      warranties: true, 
    }
  });
  
  // MAP REQUIRED: Calculate and attach score for all properties
  const hydrated = await Promise.all(properties.map(hydrateHomeAssetsFromInventory));
  const scoredProperties = await Promise.all(hydrated.map(attachHealthScore));

  return scoredProperties;
}

/**
 * Create a new property
 */
export async function createProperty(userId: string, data: CreatePropertyData): Promise<ScoredProperty> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // If this is set as primary, unset other primary properties
  if (data.isPrimary) {
    await prisma.property.updateMany({
      where: { 
        homeownerProfileId,
        isPrimary: true,
      },
      data: { isPrimary: false },
    });
  }

  const property = await prisma.property.create({
    data: {
      homeownerProfileId,
      name: data.name || null,
      address: data.address,
      city: data.city,
      state: data.state.toUpperCase(),
      zipCode: data.zipCode,
      isPrimary: data.isPrimary || false,
      
      // PHASE 2 ADDITIONS - FIX: Ensure all optional fields are explicitly null if undefined/missing
      propertyType: data.propertyType || null,
      propertySize: data.propertySize || null,
      yearBuilt: data.yearBuilt || null,
      bedrooms: data.bedrooms || null,
      bathrooms: data.bathrooms || null,
      ownershipType: data.ownershipType || null,
      occupantsCount: data.occupantsCount || null,
      heatingType: data.heatingType || null,
      coolingType: data.coolingType || null,
      waterHeaterType: data.waterHeaterType || null,
      roofType: data.roofType || null,
      hvacInstallYear: data.hvacInstallYear || null,
      waterHeaterInstallYear: data.waterHeaterInstallYear || null,
      roofReplacementYear: data.roofReplacementYear || null,
      foundationType: data.foundationType || null,
      sidingType: data.sidingType || null,
      electricalPanelAge: data.electricalPanelAge || null,
      lotSize: data.lotSize || null,
      hasIrrigation: data.hasIrrigation,
      hasDrainageIssues: data.hasDrainageIssues,
      hasSmokeDetectors: data.hasSmokeDetectors,
      hasCoDetectors: data.hasCoDetectors,
      hasSecuritySystem: data.hasSecuritySystem,
      hasFireExtinguisher: data.hasFireExtinguisher,
      hasSumpPumpBackup: data.hasSumpPumpBackup ?? null,
      primaryHeatingFuel: data.primaryHeatingFuel?.trim() || null,
      hasSecondaryHeat: data.hasSecondaryHeat ?? null,
      isResilienceVerified: data.isResilienceVerified ?? false,
      isUtilityVerified: data.isUtilityVerified ?? false,
      // END PHASE 2 ADDITIONS
    },
  });

  // NEW STEP: Handle assets AFTER property creation
  if (data.homeAssets !== undefined) {
    await syncPropertyApplianceInventoryItems(property.id, data.homeAssets || []);
  }
  

  // PHASE 2 ADDITION: FIX: Use the comprehensive job enqueuer
  // This triggers both Risk and FES calculations
  await JobQueueService.enqueuePropertyIntelligenceJobs(property.id);

  // FETCH FULL PROPERTY: Must include homeAssets and warranties for scoring/return
  const fullProperty = await prisma.property.findUnique({
      where: { id: property.id },
      include: { 
          //homeAssets: true, 
          // FIX 4: Include warranties
          warranties: true,
      }
  });

  // ATTACH SCORE: Calculate and attach score before returning
  // Ensure fullProperty is not null (shouldn't be right after creation)
  const hydrated = await hydrateHomeAssetsFromInventory(fullProperty as any);
  return attachHealthScore(hydrated as PropertyWithAssets);
}

/**
 * Get a property by ID (verify ownership)
 */
export async function getPropertyById(propertyId: string, userId: string): Promise<ScoredProperty | null> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
    include: {
      //homeAssets: true, 
      // FIX 5: Include warranties in the fetch query
      warranties: true, 
    }
  });

  if (!property) return null;

  // ATTACH SCORE: Calculate and attach score before returning
  const hydrated = await hydrateHomeAssetsFromInventory(property as any);
return attachHealthScore(hydrated as PropertyWithAssets);
}

export async function getNextPropertyNudge(propertyId: string): Promise<PropertyNudge | null> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      hasSumpPumpBackup: true,
      primaryHeatingFuel: true,
      isResilienceVerified: true,
      isUtilityVerified: true,
    },
  });

  if (!property) return null;

  const isResilienceMissing =
    property.hasSumpPumpBackup === null && !property.isResilienceVerified;

  if (isResilienceMissing) {
    return {
      type: 'RESILIENCE_CHECK',
      source: 'PROPERTY',
      title: 'Home resilience check',
      description: 'Heavy rain predicted. Do you have a battery backup for your sump pump?',
      question: 'Heavy rain predicted. Do you have a battery backup for your sump pump?',
      field: 'hasSumpPumpBackup',
      options: [
        { label: 'Yes', value: true },
        { label: 'No', value: false },
        { label: 'Not Sure', value: null },
      ],
    };
  }

  const normalizedFuel = String(property.primaryHeatingFuel || '').trim();
  const isUtilityMissing = normalizedFuel.length === 0 && !property.isUtilityVerified;

  if (isUtilityMissing) {
    return {
      type: 'UTILITY_SETUP',
      source: 'PROPERTY',
      title: 'Utility setup',
      description: 'Set your primary heating fuel to improve risk and cost guidance.',
      question: 'What is your primary heating fuel?',
      field: 'primaryHeatingFuel',
      options: [
        { label: 'Natural Gas', value: 'NATURAL_GAS' },
        { label: 'Electric', value: 'ELECTRIC' },
        { label: 'Propane', value: 'PROPANE' },
        { label: 'Fuel Oil', value: 'FUEL_OIL' },
        { label: 'Wood / Pellet', value: 'WOOD_PELLET' },
        { label: 'Other', value: 'OTHER' },
      ],
    };
  }

  return null;
}

/**
 * [FIXED FUNCTION] Get a subset of property data required for AI context, 
 * enforcing ownership and now including the Risk Report, Maintenance, and Renewals.
 */
export async function getPropertyContextForAI(propertyId: string, userId: string): Promise<PropertyAIGuidance | null> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      propertyType: true,
      yearBuilt: true,
      heatingType: true,
      coolingType: true,
      roofType: true,
      hvacInstallYear: true,
      riskReport: {
        select: {
          riskScore: true,
          financialExposureTotal: true,
          details: true,
          lastCalculatedAt: true,
        }
      },
      checklistItems: true,
      // FIXED: Added warranties
      warranties: {
        select: {
          id: true,
          expiryDate: true,
          providerName: true,
        }
      },
      insurancePolicies: {
        select: {
          id: true,
          expiryDate: true,
          carrierName: true,
          coverageType: true,
        }
      },
      documents: {
        select: {
          name: true,
          type: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      },
      seasonalChecklists: {
        where: {
          year: new Date().getFullYear(),
        },
        select: {
          season: true,
          items: {
            select: {
              title: true,
              priority: true,
              status: true,
            }
          }
        }
      },
      bookings: {
        select: {
          category: true,
          status: true,
          scheduledDate: true,
          service: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      // Claims
      claims: {
        select: {
          title: true,
          type: true,
          status: true,
          providerName: true,
          incidentAt: true,
          estimatedLossAmount: true,
          settlementAmount: true,
          checklistCompletionPct: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
      // Incidents
      incidents: {
        select: {
          title: true,
          category: true,
          status: true,
          severity: true,
          sourceType: true,
          summary: true,
          openedAt: true,
        },
        orderBy: { openedAt: 'desc' },
        take: 30,
      },
      // FIXED: Recall Matches - corrected field names
      recallMatches: {
        select: {
          status: true,
          confidencePct: true,              // FIXED: not severity
          inventoryItem: {
            select: { name: true }
          },
          homeAsset: {
            select: { assetType: true }
          },
          recall: {
            select: {
              title: true,
              severity: true,               // FIXED: severity is on RecallRecord
              hazard: true,
              remedy: true,
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      },
    }
  });

  if (!property) {
    return null;
  }

  // Fetch inventory rooms with item counts
  const inventoryRooms = await prisma.inventoryRoom.findMany({
    where: { propertyId },
    select: {
      name: true,
      type: true,
      _count: { select: { items: true } }
    }
  });

  // FIXED: Fetch inventory items with correct field names
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { propertyId },
    select: {
      name: true,
      brand: true,
      model: true,
      category: true,
      purchaseCostCents: true,           // FIXED: correct field name
      replacementCostCents: true,        // FIXED: correct field name
      room: { select: { name: true } }
    },
    take: 200,
  });

  // Fetch home assets
  const homeAssets = await listPropertyAppliancesAsHomeAssets(propertyId);

  // Fetch expenses (last 12 months)
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
  
  const expenses = await prisma.expense.findMany({
    where: {
      propertyId,
      transactionDate: { gte: twelveMonthsAgo }
    },
    select: {
      description: true,
      category: true,
      amount: true,
      transactionDate: true,
    },
    orderBy: { transactionDate: 'desc' },
    take: 50,
  });

  // Calculate expense summary
  const expenseSummary = expenses.reduce((acc, exp) => {
    acc.totalAmount += Number(exp.amount) || 0;
    acc.categoryBreakdown[exp.category] = (acc.categoryBreakdown[exp.category] || 0) + (Number(exp.amount) || 0);
    return acc;
  }, { totalAmount: 0, categoryBreakdown: {} as Record<string, number> });

  // Transform renewals
  const renewals: Renewal[] = [
    ...property.warranties.map(w => ({
      id: w.id,
      expiryDate: w.expiryDate,
      type: `Warranty: ${w.providerName}`,
    })),
    ...property.insurancePolicies.map(p => ({
      id: p.id,
      expiryDate: p.expiryDate,
      type: `Insurance: ${p.carrierName}${p.coverageType ? ` (${p.coverageType})` : ''}`,
    })),
  ];

  // Transform seasonal tasks
  const seasonalTasks: SeasonalTaskForAI[] = property.seasonalChecklists.flatMap(checklist =>
    checklist.items.map(item => ({
      title: item.title,
      season: checklist.season,
      priority: item.priority,
      status: item.status,
    }))
  );

  return {
    id: property.id,
    address: property.address,
    city: property.city,
    state: property.state,
    zipCode: property.zipCode,
    propertyType: property.propertyType,
    yearBuilt: property.yearBuilt,
    heatingType: property.heatingType,
    coolingType: property.coolingType,
    roofType: property.roofType,
    hvacInstallYear: property.hvacInstallYear,
    // Normalize risk report shape for AI (ensure `details` is a non-null InputJsonValue)
    riskReport: property.riskReport
      ? {
          riskScore: property.riskReport.riskScore,
          financialExposureTotal: property.riskReport.financialExposureTotal,
          details: (property.riskReport.details ?? {}) as Prisma.InputJsonValue,
          lastCalculatedAt: property.riskReport.lastCalculatedAt,
        }
      : null,
    maintenanceTasks: property.checklistItems,
    renewals,
    inventoryRooms: inventoryRooms.map(r => ({
      name: r.name,
      type: r.type || 'OTHER',
      itemCount: r._count.items,
    })),
    // FIXED: Use correct field names for inventory items
    inventoryItems: inventoryItems.map(i => ({
      name: i.name,
      brand: i.brand,
      model: i.model,
      category: i.category,
      roomName: i.room?.name || null,
      purchaseCostCents: i.purchaseCostCents,
      replacementCostCents: i.replacementCostCents,
    })),
    homeAssets: homeAssets.map(a => ({
      assetType: a.assetType,
      installationYear: a.installationYear,
    })),
    documents: property.documents.map(d => ({
      name: d.name,
      type: d.type,
      createdAt: d.createdAt,
    })),
    expenses: expenses.map(e => ({
      description: e.description,
      category: e.category,
      amount: Number(e.amount),
      transactionDate: e.transactionDate,
    })),
    expenseSummary,
    seasonalTasks,
    bookings: property.bookings.map(b => ({
      serviceName: b.service?.name,
      category: b.category,
      status: b.status,
      scheduledDate: b.scheduledDate,
    })),
    // Claims
    claims: property.claims.map(c => ({
      title: c.title,
      type: c.type,
      status: c.status,
      providerName: c.providerName,
      incidentAt: c.incidentAt,
      estimatedLossAmount: c.estimatedLossAmount ? Number(c.estimatedLossAmount) : null,
      settlementAmount: c.settlementAmount ? Number(c.settlementAmount) : null,
      checklistCompletionPct: c.checklistCompletionPct,
    })),
    // Incidents
    incidents: property.incidents.map(i => ({
      title: i.title,
      category: i.category,
      status: i.status,
      severity: i.severity,
      sourceType: i.sourceType,
      summary: i.summary,
      openedAt: i.openedAt,
    })),
    // FIXED: Recall Matches with correct field mapping
    recallMatches: property.recallMatches.map(r => ({
      status: r.status,
      confidencePct: r.confidencePct,
      itemName: r.inventoryItem?.name || r.homeAsset?.assetType || null,
      recallTitle: r.recall?.title || null,
      recallSeverity: r.recall?.severity || null,
      hazard: r.recall?.hazard || null,
      remedy: r.recall?.remedy || null,
    })),
  };
}
/**
 * Update a property
 */
export async function updateProperty(
  propertyId: string,
  userId: string,
  data: UpdatePropertyData
): Promise<ScoredProperty> {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // Verify ownership
  const existingProperty = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
  });

  if (!existingProperty) {
    throw new Error('Property not found');
  }

  // If setting as primary, unset other primary properties
  if (data.isPrimary && !existingProperty.isPrimary) {
    await prisma.property.updateMany({
      where: {
        homeownerProfileId,
        isPrimary: true,
        id: { not: propertyId },
      },
      data: { isPrimary: false },
    });
  }

  // NEW STEP: Sync assets if they are present in the update payload.
  // The 'undefined' check ensures we only sync if the frontend explicitly sends the field (which it does)
  if (data.homeAssets !== undefined) {
    await syncPropertyApplianceInventoryItems(propertyId, data.homeAssets || []);
  }
  

  // Use a proper type for updatePayload for better type checking
  const updatePayload: Partial<Omit<CreatePropertyData, 'address' | 'city' | 'state' | 'zipCode' | 'homeAssets'>> & {
    name?: string | null;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    isPrimary?: boolean;
  } = {};


  if (data.name !== undefined) updatePayload.name = data.name;
  if (data.address !== undefined) updatePayload.address = data.address;
  if (data.city !== undefined) updatePayload.city = data.city;
  if (data.state !== undefined) updatePayload.state = data.state.toUpperCase();
  if (data.zipCode !== undefined) updatePayload.zipCode = data.zipCode;
  if (data.isPrimary !== undefined) updatePayload.isPrimary = data.isPrimary;
  
  // PHASE 2 ADDITIONS - Dynamically set new fields for update
  // FIX: Ensure optional fields are explicitly handled to prevent undefined data corruption
  if (data.propertyType !== undefined) updatePayload.propertyType = data.propertyType || null;
  if (data.propertySize !== undefined) updatePayload.propertySize = data.propertySize || null;
  if (data.yearBuilt !== undefined) updatePayload.yearBuilt = data.yearBuilt || null;
  if (data.bedrooms !== undefined) updatePayload.bedrooms = data.bedrooms || null;
  if (data.bathrooms !== undefined) updatePayload.bathrooms = data.bathrooms || null;
  if (data.ownershipType !== undefined) updatePayload.ownershipType = data.ownershipType || null;
  if (data.occupantsCount !== undefined) updatePayload.occupantsCount = data.occupantsCount || null;
  if (data.heatingType !== undefined) updatePayload.heatingType = data.heatingType || null;
  if (data.coolingType !== undefined) updatePayload.coolingType = data.coolingType || null;
  if (data.waterHeaterType !== undefined) updatePayload.waterHeaterType = data.waterHeaterType || null;
  if (data.roofType !== undefined) updatePayload.roofType = data.roofType || null;
  if (data.hvacInstallYear !== undefined) updatePayload.hvacInstallYear = data.hvacInstallYear || null;
  if (data.waterHeaterInstallYear !== undefined) updatePayload.waterHeaterInstallYear = data.waterHeaterInstallYear || null;
  if (data.roofReplacementYear !== undefined) updatePayload.roofReplacementYear = data.roofReplacementYear || null;
  if (data.foundationType !== undefined) updatePayload.foundationType = data.foundationType || null;
  if (data.sidingType !== undefined) updatePayload.sidingType = data.sidingType || null;
  if (data.electricalPanelAge !== undefined) updatePayload.electricalPanelAge = data.electricalPanelAge || null;
  if (data.lotSize !== undefined) updatePayload.lotSize = data.lotSize || null;
  
  if (data.hasIrrigation !== undefined) updatePayload.hasIrrigation = data.hasIrrigation;
  if (data.hasDrainageIssues !== undefined) updatePayload.hasDrainageIssues = data.hasDrainageIssues;
  if (data.hasSmokeDetectors !== undefined) updatePayload.hasSmokeDetectors = data.hasSmokeDetectors;
  if (data.hasCoDetectors !== undefined) updatePayload.hasCoDetectors = data.hasCoDetectors;
  if (data.hasSecuritySystem !== undefined) updatePayload.hasSecuritySystem = data.hasSecuritySystem;
  if (data.hasFireExtinguisher !== undefined) updatePayload.hasFireExtinguisher = data.hasFireExtinguisher;
  if (data.hasSumpPumpBackup !== undefined) {
    updatePayload.hasSumpPumpBackup = data.hasSumpPumpBackup;
    if (data.isResilienceVerified === undefined) {
      updatePayload.isResilienceVerified = data.hasSumpPumpBackup !== null;
    }
  }
  if (data.primaryHeatingFuel !== undefined) {
    const normalizedFuel = data.primaryHeatingFuel?.trim() || null;
    updatePayload.primaryHeatingFuel = normalizedFuel;
    if (data.isUtilityVerified === undefined) {
      updatePayload.isUtilityVerified = normalizedFuel !== null;
    }
  }
  if (data.hasSecondaryHeat !== undefined) updatePayload.hasSecondaryHeat = data.hasSecondaryHeat;
  if (data.isResilienceVerified !== undefined) updatePayload.isResilienceVerified = data.isResilienceVerified;
  if (data.isUtilityVerified !== undefined) updatePayload.isUtilityVerified = data.isUtilityVerified;

  const property = await prisma.property.update({
    where: { id: propertyId },
    data: updatePayload,
  });

  // PHASE 2 ADDITION: FIX: Use the comprehensive job enqueuer
  if (Object.keys(updatePayload).length > 0) {
      await JobQueueService.enqueuePropertyIntelligenceJobs(propertyId);
  }

  // FETCH FULL PROPERTY: Must include homeAssets and warranties for return/scoring
  const updatedProperty = await prisma.property.findUnique({
      where: { id: propertyId },
      include: { 
          //homeAssets: true,
          // FIX 6: Include warranties
          warranties: true,
      }
  });

  // ATTACH SCORE: Calculate and attach score before returning
  const hydrated = await hydrateHomeAssetsFromInventory(updatedProperty as any);
  return attachHealthScore(hydrated as PropertyWithAssets);

}

/**
 * Delete a property
 */
export async function deleteProperty(propertyId: string, userId: string) {
  const homeownerProfileId = await getHomeownerProfileId(userId);

  // Verify ownership
  const property = await prisma.property.findFirst({
    where: {
      id: propertyId,
      homeownerProfileId,
    },
  });

  if (!property) {
    throw new Error('Property not found');
  }

  // Check if property has active bookings
  const activeBookings = await prisma.booking.count({
    where: {
      propertyId,
      status: {
        in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'],
      },
    },
  });

  if (activeBookings > 0) {
    throw new Error('Cannot delete property with active bookings');
  }

  await prisma.property.delete({
    where: { id: propertyId },
  });
}
