// apps/backend/src/services/home-management.service.ts

import { PrismaClient, Prisma, Document, DocumentType, HomeAsset } from '@prisma/client'; // ADDED HomeAsset
import { 
  CreateWarrantyDTO, UpdateWarrantyDTO, Warranty, 
  CreateInsurancePolicyDTO, UpdateInsurancePolicyDTO, InsurancePolicy,
  CreateExpenseDTO, UpdateExpenseDTO, Expense 
} from '../types'; 

import { prisma } from '../lib/prisma';

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
    const rawWarranty = await prisma.warranty.create({
      data: {
        homeownerProfile: { connect: { id: homeownerProfileId } },
        property: data.propertyId && data.propertyId !== "" ? { connect: { id: data.propertyId } } : undefined,
        
        // --- ADDED NEW REQUIRED FIELDS ---
        category: data.category, 
        homeAsset: data.homeAssetId && data.homeAssetId !== "" ? { connect: { id: data.homeAssetId } } : undefined,
        // --- END ADDED FIELDS ---

        providerName: data.providerName,
        policyNumber: data.policyNumber,
        coverageDetails: data.coverageDetails,
        cost: data.cost,
        startDate: new Date(data.startDate),
        expiryDate: new Date(data.expiryDate),
      } as Prisma.WarrantyCreateInput,
    });

    return mapRawWarrantyToWarranty(rawWarranty);
  } catch (error) {
    console.error('FATAL ERROR (POST /warranties): Prisma operation failed.', error); 
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
      // Data spread includes category and homeAssetId if present in DTO
      ...(data.startDate && { startDate: new Date(data.startDate) }),
      ...(data.expiryDate && { expiryDate: new Date(data.expiryDate) }),
    } as Prisma.WarrantyUpdateInput,
    include: { documents: true }
  });

  return mapRawWarrantyToWarranty(rawUpdatedWarranty);
}

export async function deleteWarranty(
  warrantyId: string, 
  homeownerProfileId: string
): Promise<Warranty> {
  const rawDeletedWarranty = await prisma.warranty.delete({
    where: { id: warrantyId, homeownerProfileId },
  });

  return mapRawWarrantyToWarranty(rawDeletedWarranty);
}

/**
 * Lists all HomeAssets linked to a specific Property ID.
 * This function enforces the business rule to only allow users to select 
 * assets that are verifiably linked to the current property.
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
      // Throwing a dedicated error for the controller to handle as 404/403
      throw new Error("Property not found or does not belong to homeowner.");
  }

  // 2. Fetch all HomeAssets strictly filtered by that propertyId
  const rawAssets = await prisma.homeAsset.findMany({
      where: { propertyId },
      orderBy: { assetType: 'asc' } // Sort for better user experience in the dropdown
  });

  return rawAssets as HomeAsset[];
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
  
  return mapRawPolicyToInsurancePolicy(rawUpdatedPolicy);
}

export async function deleteInsurancePolicy(
  policyId: string, 
  homeownerProfileId: string
): Promise<InsurancePolicy> {
  const rawDeletedPolicy = await prisma.insurancePolicy.delete({
    where: { id: policyId, homeownerProfileId },
  });
  
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