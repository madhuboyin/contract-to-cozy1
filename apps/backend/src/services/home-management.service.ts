// apps/backend/src/services/home-management.service.ts

import { PrismaClient, Prisma, Document, DocumentType, HomeAsset } from '@prisma/client'; // ADDED HomeAsset
import { 
  CreateWarrantyDTO, UpdateWarrantyDTO, Warranty, 
  CreateInsurancePolicyDTO, UpdateInsurancePolicyDTO, InsurancePolicy,
  CreateExpenseDTO, UpdateExpenseDTO, Expense 
} from '../types'; 

import { prisma } from '../lib/prisma';
import JobQueueService from './JobQueue.service';
import { HomeEventsAutoGen } from './homeEvents/homeEvents.autogen';
import { markCoverageAnalysisStale, markItemCoverageAnalysesStale } from './coverageAnalysis.service';
import { markRiskPremiumOptimizerStale } from './riskPremiumOptimizer.service';
import { markDoNothingRunsStale } from './doNothingSimulator.service';

// Helper interface for safe Decimal conversion (the object must have a toNumber method)
interface DecimalLike {
  toNumber: () => number;
}

// Helper type to check for Decimal fields which need conversion
type PrismaOutputWithDecimals<T> = T & { 
  amount?: DecimalLike;
  cost?: DecimalLike | null;
  premiumAmount?: DecimalLike;
};

/**
 * Safely converts a Decimal-like object to a number.
 * Returns null if the value is null/undefined or if conversion method is missing.
 */
const safeToNumber = (value: DecimalLike | null | undefined): number | null => {
    // This explicit check prevents the runtime crash when the object is not a valid Decimal instance
    if (value && typeof value.toNumber === 'function') {
        return value.toNumber();
    }
    return null;
};


// --- MAPPING HELPERS (CRITICAL DEBUG AND FIX) ---

/**
 * Helper function to map raw expense to expected Expense interface (explicitly)
 */
const mapRawExpenseToExpense = (rawExpense: any): Expense => {
    const expenseWithNumber = rawExpense as PrismaOutputWithDecimals<typeof rawExpense>;
    let amount = 0;
    
    try {
        // High-granularity check for 'amount'
        amount = safeToNumber(expenseWithNumber.amount) ?? 0;
        if (amount === null) throw new Error("Conversion resulted in null.");
    } catch (e) {
        console.error(`FATAL MAPPING ERROR (Expense ID ${rawExpense.id}): Failed to convert 'amount'. Raw value was:`, expenseWithNumber.amount);
        throw new Error(`Expense conversion failed for ID ${rawExpense.id} on 'amount' field.`);
    }

    // Explicitly list ALL fields
    return {
        id: rawExpense.id,
        homeownerProfileId: rawExpense.homeownerProfileId,
        propertyId: rawExpense.propertyId,
        bookingId: rawExpense.bookingId,
        description: rawExpense.description,
        category: rawExpense.category,
        amount: amount, // CONVERTED
        transactionDate: rawExpense.transactionDate,
        createdAt: rawExpense.createdAt,
        updatedAt: rawExpense.updatedAt,
    } as Expense;
};

/**
 * Helper function to map raw warranty to expected Warranty interface (explicitly)
 */
const mapRawWarrantyToWarranty = (rawWarranty: any): Warranty => {
    const warrantyWithNumber = rawWarranty as PrismaOutputWithDecimals<typeof rawWarranty>;
    let cost: number | null = null;

    try {
        // High-granularity check for 'cost'
        cost = safeToNumber(warrantyWithNumber.cost);
    } catch (e) {
        console.error(`FATAL MAPPING ERROR (Warranty ID ${rawWarranty.id}): Failed to convert 'cost'. Raw value was:`, warrantyWithNumber.cost);
        throw new Error(`Warranty conversion failed for ID ${rawWarranty.id} on 'cost' field.`);
    }

    // Explicitly list ALL fields
    return {
        id: rawWarranty.id,
        homeownerProfileId: rawWarranty.homeownerProfileId,
        propertyId: rawWarranty.propertyId,
        homeAssetId: rawWarranty.homeAssetId, // ADDED for asset linking
        category: rawWarranty.category,       // ADDED for specific categorization
        providerName: rawWarranty.providerName,
        policyNumber: rawWarranty.policyNumber,
        coverageDetails: rawWarranty.coverageDetails,
        cost: cost, // CONVERTED (nullable)
        startDate: rawWarranty.startDate,
        expiryDate: rawWarranty.expiryDate,
        createdAt: rawWarranty.createdAt,
        updatedAt: rawWarranty.updatedAt,
        documents: rawWarranty.documents || [],
    } as Warranty;
};

/**
 * Helper function to map raw policy to expected InsurancePolicy interface (explicitly)
 */
const mapRawPolicyToInsurancePolicy = (rawPolicy: any): InsurancePolicy => {
    const policyWithNumber = rawPolicy as PrismaOutputWithDecimals<typeof rawPolicy>;
    let premiumAmount = 0;

    try {
        // High-granularity check for 'premiumAmount'
        premiumAmount = safeToNumber(policyWithNumber.premiumAmount) ?? 0;
        if (premiumAmount === null) throw new Error("Conversion resulted in null.");
    } catch (e) {
        console.error(`FATAL MAPPING ERROR (Policy ID ${rawPolicy.id}): Failed to convert 'premiumAmount'. Raw value was:`, policyWithNumber.premiumAmount);
        throw new Error(`Policy conversion failed for ID ${rawPolicy.id} on 'premiumAmount' field.`);
    }


    // Explicitly list ALL fields
    return {
        id: rawPolicy.id,
        homeownerProfileId: rawPolicy.homeownerProfileId,
        propertyId: rawPolicy.propertyId,
        carrierName: rawPolicy.carrierName,
        policyNumber: rawPolicy.policyNumber,
        coverageType: rawPolicy.coverageType,
        premiumAmount: premiumAmount, // CONVERTED
        startDate: rawPolicy.startDate,
        expiryDate: rawPolicy.expiryDate,
        createdAt: rawPolicy.createdAt,
        updatedAt: rawPolicy.updatedAt,
        documents: rawPolicy.documents || [],
    } as InsurancePolicy;
};

// --- EXPENSE SERVICE LOGIC (USING MAPPED HELPERS) ---

export async function createExpense(
  homeownerProfileId: string, 
  data: CreateExpenseDTO
): Promise<Expense> {
  console.log('DEBUG (POST /expenses): Input Data Received:', data);

  try {
    const rawExpense = await prisma.expense.create({
      data: {
        homeownerProfile: { connect: { id: homeownerProfileId } },
        property: data.propertyId && data.propertyId !== "" ? { connect: { id: data.propertyId } } : undefined,
        booking: data.bookingId && data.bookingId !== "" ? { connect: { id: data.bookingId } } : undefined,
        description: data.description,
        category: data.category,
        amount: data.amount,
        transactionDate: new Date(data.transactionDate),
      } as Prisma.ExpenseCreateInput,
    });
    // AUTO-GEN HomeEvent (only if propertyId exists)
    if (data.propertyId && data.propertyId !== "") {
      try {
        await HomeEventsAutoGen.onExpenseCreated({
          propertyId: data.propertyId,
          expenseId: rawExpense.id,
          userId: null, // home-management module is homeowner-profile scoped; ok to keep null

          category: rawExpense.category ?? data.category ?? null,
          description: rawExpense.description ?? data.description ?? null,

          transactionDate: rawExpense.transactionDate,
          amount: typeof data.amount === 'number' ? data.amount : Number(rawExpense.amount as any),
          currency: null, // if you add currency to Expense later, wire it here
        });
      } catch (e) {
        // Never break expense creation if timeline autogen fails
        console.error('[HOME_EVENTS_AUTOGEN] Failed onExpenseCreated:', e);
      }
    }

    return mapRawExpenseToExpense(rawExpense);
  } catch (error) {
    console.error('FATAL ERROR (POST /expenses): Prisma operation failed.', error); 
    throw error;
  }
}

export async function listExpenses(
  homeownerProfileId: string, 
  propertyId?: string
): Promise<Expense[]> {
  const where: Prisma.ExpenseWhereInput = {
    homeownerProfileId,
    ...(propertyId && { propertyId }),
  };
  
  const rawExpenses = await prisma.expense.findMany({
    where,
    orderBy: { transactionDate: 'desc' },
  });

  return rawExpenses.map(mapRawExpenseToExpense);
}

export async function updateExpense(
  expenseId: string, 
  homeownerProfileId: string, 
  data: UpdateExpenseDTO
): Promise<Expense> {
  const rawUpdatedExpense = await prisma.expense.update({
    where: { id: expenseId, homeownerProfileId },
    data: {
      ...data,
      ...(data.transactionDate && { transactionDate: new Date(data.transactionDate) }),
    } as Prisma.ExpenseUpdateInput,
  });
  // Keep HomeEvent in sync (optional, safe)
  if (rawUpdatedExpense.propertyId) {
    try {
      await HomeEventsAutoGen.onExpenseUpdated({
        propertyId: rawUpdatedExpense.propertyId,
        expenseId: rawUpdatedExpense.id,
        userId: null,

        category: rawUpdatedExpense.category ?? null,
        description: rawUpdatedExpense.description ?? null,

        transactionDate: rawUpdatedExpense.transactionDate,
        amount: typeof data.amount === 'number'
          ? data.amount
          : (rawUpdatedExpense.amount as any)?.toNumber?.() ?? Number(rawUpdatedExpense.amount as any),
        currency: null,
      });
    } catch (e) {
      console.error('[HOME_EVENTS_AUTOGEN] Failed onExpenseUpdated:', e);
    }
  }

  return mapRawExpenseToExpense(rawUpdatedExpense);
}

export async function deleteExpense(
  expenseId: string, 
  homeownerProfileId: string
): Promise<Expense> {
  const rawDeletedExpense = await prisma.expense.delete({
    where: { id: expenseId, homeownerProfileId },
  });
  
  return mapRawExpenseToExpense(rawDeletedExpense);
}

// --- WARRANTY SERVICE LOGIC (USING MAPPED HELPERS) ---

export async function createWarranty(
  homeownerProfileId: string, 
  data: CreateWarrantyDTO
): Promise<Warranty> {
  try {
    // Support both old homeAssetId and new inventoryItemId for backward compatibility
    const inventoryItemId = data.inventoryItemId || data.homeAssetId;
    
    const rawWarranty = await prisma.warranty.create({
      data: {
        homeownerProfile: { connect: { id: homeownerProfileId } },
        property: data.propertyId && data.propertyId !== "" ? { connect: { id: data.propertyId } } : undefined,
        category: data.category, 
        // NEW: Use inventoryItem relation instead of homeAsset
        inventoryItem: inventoryItemId && inventoryItemId !== "" 
          ? { connect: { id: inventoryItemId } } 
          : undefined,
        // DEPRECATED: Keep homeAsset null for new records
        // homeAsset: undefined,
        providerName: data.providerName,
        policyNumber: data.policyNumber,
        coverageDetails: data.coverageDetails,
        cost: data.cost,
        startDate: new Date(data.startDate),
        expiryDate: new Date(data.expiryDate),
      } as Prisma.WarrantyCreateInput,
      include: { documents: true }
    });

    if (rawWarranty.propertyId) {
      await markCoverageAnalysisStale(rawWarranty.propertyId);
      await markItemCoverageAnalysesStale(rawWarranty.propertyId);
      await markRiskPremiumOptimizerStale(rawWarranty.propertyId);
      await markDoNothingRunsStale(rawWarranty.propertyId);
    }

    return mapRawWarrantyToWarranty(rawWarranty);
  } catch (error) {
    console.error('Error creating warranty:', error);
    throw error;
  }
}

export async function listWarranties(homeownerProfileId: string): Promise<Warranty[]> {
  const rawWarranties = await prisma.warranty.findMany({
    where: { homeownerProfileId },
    orderBy: { expiryDate: 'asc' },
    include: {
      documents: true
    }
  });

  return rawWarranties.map(mapRawWarrantyToWarranty);
}
export async function updateWarranty(
  warrantyId: string, 
  homeownerProfileId: string, 
  data: UpdateWarrantyDTO
): Promise<Warranty> {
  const rawUpdatedWarranty = await prisma.warranty.update({
    where: { id: warrantyId, homeownerProfileId },
    data: {
      ...data,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.expiryDate && { expiryDate: new Date(data.expiryDate) }),
      // Handle inventoryItemId update (supports both old and new field names)
      ...((data.inventoryItemId || data.homeAssetId) && {
        inventoryItem: { connect: { id: data.inventoryItemId || data.homeAssetId } }
      }),
      // Remove homeAssetId from spread to prevent it being set directly
      homeAssetId: undefined,
    } as Prisma.WarrantyUpdateInput,
    include: { documents: true }
  });

  // 🔑 ADD THIS SECTION - Trigger risk report regeneration
  if (rawUpdatedWarranty.propertyId) {
    try {
      console.log(`[WARRANTY-SERVICE] Triggering risk update for property ${rawUpdatedWarranty.propertyId}`);
      await JobQueueService.enqueuePropertyIntelligenceJobs(rawUpdatedWarranty.propertyId);
    } catch (error) {
      console.error(`[WARRANTY-SERVICE] Failed to enqueue risk update job:`, error);
    }
    await markCoverageAnalysisStale(rawUpdatedWarranty.propertyId);
    await markItemCoverageAnalysesStale(rawUpdatedWarranty.propertyId);
    await markRiskPremiumOptimizerStale(rawUpdatedWarranty.propertyId);
    await markDoNothingRunsStale(rawUpdatedWarranty.propertyId);
  }
  // 🔑 END NEW SECTION

  return mapRawWarrantyToWarranty(rawUpdatedWarranty);
}

export async function deleteWarranty(
  warrantyId: string, 
  homeownerProfileId: string
): Promise<Warranty> {
  // 🔑 ADD THIS - Get warranty before deletion to access propertyId
  const warrantyToDelete = await prisma.warranty.findUnique({
    where: { id: warrantyId, homeownerProfileId },
  });

  if (!warrantyToDelete) {
    throw new Error('Warranty not found');
  }

  const propertyId = warrantyToDelete.propertyId;
  // 🔑 END NEW SECTION

  const rawDeletedWarranty = await prisma.warranty.delete({
    where: { id: warrantyId, homeownerProfileId },
  });

  // 🔑 ADD THIS SECTION - Trigger risk report regeneration after deletion
  if (propertyId) {
    try {
      console.log(`[WARRANTY-SERVICE] Triggering risk update for property ${propertyId} after deletion`);
      await JobQueueService.enqueuePropertyIntelligenceJobs(propertyId);
    } catch (error) {
      console.error(`[WARRANTY-SERVICE] Failed to enqueue risk update job:`, error);
    }
    await markCoverageAnalysisStale(propertyId);
    await markItemCoverageAnalysesStale(propertyId);
    await markRiskPremiumOptimizerStale(propertyId);
    await markDoNothingRunsStale(propertyId);
  }
  // 🔑 END NEW SECTION

  return mapRawWarrantyToWarranty(rawDeletedWarranty);
}

/**
 * Lists all HomeAssets linked to a specific Property ID.
 * This function enforces the business rule to only allow users to select 
 * assets that are verifiably linked to the current property.
 */
/**
 * Helper to infer asset type from InventoryItem
 */
function inferAssetTypeFromInventoryItem(item: any): string {
  // 1. Check sourceHash (canonical appliances from Property page)
  if (item.sourceHash?.startsWith('property_appliance::')) {
    return item.sourceHash.replace('property_appliance::', '');
  }
  
  // 2. Check tags for APPLIANCE_TYPE
  const typeTag = (item.tags || []).find((t: string) => t.startsWith('APPLIANCE_TYPE:'));
  if (typeTag) {
    return typeTag.replace('APPLIANCE_TYPE:', '');
  }
  
  // 3. Infer from name
  const name = (item.name || '').toLowerCase();
  if (name.includes('dishwasher')) return 'DISHWASHER';
  if (name.includes('refrigerator') || name.includes('fridge')) return 'REFRIGERATOR';
  if (name.includes('oven') || name.includes('range') || name.includes('stove')) return 'OVEN_RANGE';
  if (name.includes('washer') || name.includes('dryer')) return 'WASHER_DRYER';
  if (name.includes('microwave')) return 'MICROWAVE_HOOD';
  if (name.includes('water softener')) return 'WATER_SOFTENER';
  if (name.includes('disposal')) return 'GARBAGE_DISPOSAL';
  if (name.includes('furnace') || name.includes('hvac')) return 'HVAC_FURNACE';
  if (name.includes('water heater')) return 'WATER_HEATER';
  
  return 'OTHER';
}

/**
 * Lists all appliance InventoryItems linked to a specific Property ID.
 * MIGRATED: Now uses InventoryItem instead of deprecated HomeAsset table.
 * Returns HomeAsset-compatible shape for backward compatibility with frontend.
 */
export async function listLinkedHomeAssets(
  homeownerProfileId: string,
  propertyId: string
): Promise<HomeAsset[]> { 
  // 1. Verify the property belongs to the homeowner (critical security check)
  const property = await prisma.property.findFirst({
      where: { id: propertyId, homeownerProfileId },
  });

  if (!property) {
      throw new Error("Property not found or does not belong to homeowner.");
  }

  // 2. Fetch APPLIANCE category InventoryItems instead of HomeAssets
  const inventoryItems = await prisma.inventoryItem.findMany({
      where: { 
        propertyId,
        category: 'APPLIANCE',
      },
      orderBy: { name: 'asc' }
  });

  // 3. Transform to HomeAsset-compatible shape for backward compatibility
  return inventoryItems.map(item => ({
    id: item.id,
    propertyId: item.propertyId,
    assetType: inferAssetTypeFromInventoryItem(item),
    installationYear: item.installedOn ? new Date(item.installedOn).getUTCFullYear() : null,
    modelNumber: item.modelNumber || item.model || null,
    serialNumber: item.serialNumber || item.serialNo || null,
    lastServiced: item.lastServicedOn,
    efficiencyRating: null,
    manufacturer: item.manufacturer || null,
    brand: item.brand || null,
    manufacturerNorm: null,
    modelNumberNorm: null,
  })) as HomeAsset[];
}

// --- INSURANCE POLICY SERVICE LOGIC (USING MAPPED HELPERS) ---

export async function createInsurancePolicy(
  homeownerProfileId: string, 
  data: CreateInsurancePolicyDTO
): Promise<InsurancePolicy> {
  try {
    const rawPolicy = await prisma.insurancePolicy.create({
      data: {
        homeownerProfile: { connect: { id: homeownerProfileId } },
        property: data.propertyId && data.propertyId !== "" ? { connect: { id: data.propertyId } } : undefined,
        
        carrierName: data.carrierName,
        policyNumber: data.policyNumber,
        coverageType: data.coverageType,
        premiumAmount: data.premiumAmount,
        startDate: new Date(data.startDate),
        expiryDate: new Date(data.expiryDate),
      } as Prisma.InsurancePolicyCreateInput,
    });
    
    if (rawPolicy.propertyId) {
      await markCoverageAnalysisStale(rawPolicy.propertyId);
      await markItemCoverageAnalysesStale(rawPolicy.propertyId);
      await markRiskPremiumOptimizerStale(rawPolicy.propertyId);
      await markDoNothingRunsStale(rawPolicy.propertyId);
    }

    return mapRawPolicyToInsurancePolicy(rawPolicy);
  } catch (error) {
    console.error('FATAL ERROR (POST /insurance-policies): Prisma operation failed.', error); 
    throw error;
  }
}

export async function listInsurancePolicies(homeownerProfileId: string): Promise<InsurancePolicy[]> {
  const rawPolicies = await prisma.insurancePolicy.findMany({
    where: { homeownerProfileId },
    orderBy: { expiryDate: 'asc' },
    include: {
      documents: true
    }
  });

  return rawPolicies.map(mapRawPolicyToInsurancePolicy);
}

export async function updateInsurancePolicy(
  policyId: string, 
  homeownerProfileId: string, 
  data: UpdateInsurancePolicyDTO
): Promise<InsurancePolicy> {
  const rawUpdatedPolicy = await prisma.insurancePolicy.update({
    where: { id: policyId, homeownerProfileId },
    data: {
      ...data,
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.expiryDate && { expiryDate: new Date(data.expiryDate) }),
    } as Prisma.InsurancePolicyUpdateInput,
    include: { documents: true }
  });
  
  if (rawUpdatedPolicy.propertyId) {
    await markCoverageAnalysisStale(rawUpdatedPolicy.propertyId);
    await markItemCoverageAnalysesStale(rawUpdatedPolicy.propertyId);
    await markRiskPremiumOptimizerStale(rawUpdatedPolicy.propertyId);
    await markDoNothingRunsStale(rawUpdatedPolicy.propertyId);
  }

  return mapRawPolicyToInsurancePolicy(rawUpdatedPolicy);
}

export async function deleteInsurancePolicy(
  policyId: string, 
  homeownerProfileId: string
): Promise<InsurancePolicy> {
  const policyToDelete = await prisma.insurancePolicy.findUnique({
    where: { id: policyId, homeownerProfileId },
    select: { propertyId: true },
  });

  const rawDeletedPolicy = await prisma.insurancePolicy.delete({
    where: { id: policyId, homeownerProfileId },
  });

  if (policyToDelete?.propertyId) {
    await markCoverageAnalysisStale(policyToDelete.propertyId);
    await markItemCoverageAnalysesStale(policyToDelete.propertyId);
    await markRiskPremiumOptimizerStale(policyToDelete.propertyId);
    await markDoNothingRunsStale(policyToDelete.propertyId);
  }
  
  return mapRawPolicyToInsurancePolicy(rawDeletedPolicy);
}


// ============================================================================
// DOCUMENT SERVICE LOGIC (MOCK UPLOAD AND LISTING)
// ============================================================================

const MOCK_STORAGE_URL = 'https://mock-storage.com/docs/';

interface CreateDocumentDTO {
  type: string;
  name: string;
  description?: string;
  propertyId?: string;
  warrantyId?: string;
  policyId?: string;
}

/**
 * Handles the upload and database record creation for a new document.
 */
export async function createDocument(
  homeownerProfileId: string, 
  data: CreateDocumentDTO,
  file: Express.Multer.File, // Assuming file is provided by multer middleware
): Promise<Document> {
  
  // 1. MOCK FILE UPLOAD
  const fileExtension = file.originalname.split('.').pop();
  const fileUrl = MOCK_STORAGE_URL + `${Date.now()}-${file.fieldname}.${fileExtension}`;
  
  // 2. INPUT VALIDATION (Simplified check)
  if (data.propertyId) {
    const property = await prisma.property.findFirst({
      where: { id: data.propertyId, homeownerProfileId },
    });
    if (!property) {
      throw new Error("Property not found or does not belong to homeowner.");
    }
  }

  // 3. CREATE DATABASE RECORD
  const rawDocument = await prisma.document.create({
    data: {
      uploadedBy: homeownerProfileId,
      type: data.type as DocumentType, 
      name: data.name,
      fileUrl: fileUrl,
      fileSize: file.size,
      mimeType: file.mimetype,
      description: data.description,

      // Relations
      property: data.propertyId ? { connect: { id: data.propertyId } } : undefined,
      warranty: data.warrantyId ? { connect: { id: data.warrantyId } } : undefined,
      insurancePolicy: data.policyId ? { connect: { id: data.policyId } } : undefined,
    } as Prisma.DocumentCreateInput,
  });
  // AUTO-GEN Timeline moment for property-linked docs (safe, non-blocking)
  if (rawDocument.propertyId) {
    try {
      await HomeEventsAutoGen.onDocumentUploaded({
        propertyId: rawDocument.propertyId,
        documentId: rawDocument.id,
        homeownerProfileId,

        name: rawDocument.name,
        docType: String(rawDocument.type),
        mimeType: rawDocument.mimeType ?? null,
        description: rawDocument.description ?? null,

        createdAt: rawDocument.createdAt,

        warrantyId: (rawDocument as any).warrantyId ?? data.warrantyId ?? null,
        policyId: (rawDocument as any).insurancePolicyId ?? data.policyId ?? null,
      });
    } catch (e) {
      console.error('[HOME_EVENTS_AUTOGEN] Failed onDocumentUploaded (home-management):', e);
    }
  }

  return rawDocument as Document;
}

/**
 * Lists all documents uploaded by the homeowner.
 */
export async function listDocuments(homeownerProfileId: string): Promise<Document[]> {
    const documents = await prisma.document.findMany({
        where: { uploadedBy: homeownerProfileId },
        orderBy: { createdAt: 'desc' },
    });
    
    return documents as Document[];
}
