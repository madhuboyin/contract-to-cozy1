// apps/backend/src/services/home-management.service.ts

import { PrismaClient, Prisma, Document, DocumentType } from '@prisma/client';
import { 
  CreateWarrantyDTO, UpdateWarrantyDTO, Warranty, 
  CreateInsurancePolicyDTO, UpdateInsurancePolicyDTO, InsurancePolicy,
  CreateExpenseDTO, UpdateExpenseDTO, Expense 
} from '../types'; 

const prisma = new PrismaClient();

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

// --- EXPENSE SERVICE LOGIC ---

/**
 * Creates a new expense record for a homeowner.
 */
export async function createExpense(
  homeownerProfileId: string, 
  data: CreateExpenseDTO
): Promise<Expense> {
  try {
    const rawExpense = await prisma.expense.create({
      data: {
        homeownerProfile: {
          connect: { id: homeownerProfileId },
        },
        property: data.propertyId ? { connect: { id: data.propertyId } } : undefined,
        booking: data.bookingId ? { connect: { id: data.bookingId } } : undefined,
        
        description: data.description,
        category: data.category,
        amount: data.amount,
        transactionDate: new Date(data.transactionDate),
      } as Prisma.ExpenseCreateInput,
    });
    
    // FIX: Safely convert Decimal to number before casting.
    const expenseWithNumber = rawExpense as PrismaOutputWithDecimals<typeof rawExpense>;

    return {
      ...rawExpense,
      amount: expenseWithNumber.amount!.toNumber(),
    } as Expense;

  } catch (error) {
    console.error('ERROR: createExpense failed', error);
    throw error;
  }
}

/**
 * Lists all expenses for a homeowner, optionally filtered by property.
 */
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

  // FIX: Safely convert Decimal to number for all listed expenses
  return rawExpenses.map(rawExpense => {
    const expenseWithNumber = rawExpense as PrismaOutputWithDecimals<typeof rawExpenses[0]>;

    // We rely on the raw object having the Decimal instance with .toNumber()
    if (!expenseWithNumber.amount || typeof expenseWithNumber.amount.toNumber !== 'function') {
        // If the database has corrupted data or the mapping failed, throw a clear error
        throw new Error(`Expense ID ${rawExpense.id} is missing a valid 'amount' field for conversion.`);
    }

    return {
      ...rawExpense,
      amount: expenseWithNumber.amount.toNumber(),
    } as Expense;
  }) as Expense[];
}

/**
 * Updates an existing expense record.
 */
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
  
  const expenseWithNumber = rawUpdatedExpense as PrismaOutputWithDecimals<typeof rawUpdatedExpense>;
  
  // FIX: Safely convert Decimal to number before casting
  return {
    ...rawUpdatedExpense,
    amount: expenseWithNumber.amount!.toNumber(),
  } as Expense;
}

/**
 * Deletes an expense record.
 */
export async function deleteExpense(
  expenseId: string, 
  homeownerProfileId: string
): Promise<Expense> {
  const rawDeletedExpense = await prisma.expense.delete({
    where: { id: expenseId, homeownerProfileId },
  });
  
  const expenseWithNumber = rawDeletedExpense as PrismaOutputWithDecimals<typeof rawDeletedExpense>;

  // FIX: Safely convert Decimal to number before casting
  return {
    ...rawDeletedExpense,
    amount: expenseWithNumber.amount!.toNumber(),
  } as Expense;
}

// --- WARRANTY SERVICE LOGIC ---

/**
 * Creates a new warranty record.
 */
export async function createWarranty(
  homeownerProfileId: string, 
  data: CreateWarrantyDTO
): Promise<Warranty> {
  const rawWarranty = await prisma.warranty.create({
    data: {
      homeownerProfile: {
        connect: { id: homeownerProfileId },
      },
      property: data.propertyId ? { connect: { id: data.propertyId } } : undefined,
      
      providerName: data.providerName,
      policyNumber: data.policyNumber,
      coverageDetails: data.coverageDetails,
      cost: data.cost,
      startDate: new Date(data.startDate),
      expiryDate: new Date(data.expiryDate),
    } as Prisma.WarrantyCreateInput,
  });
  
  const warrantyWithNumber = rawWarranty as PrismaOutputWithDecimals<typeof rawWarranty>;

  // FIX: Convert Decimal to number before casting (cost is optional)
  return {
    ...rawWarranty,
    cost: rawWarranty.cost ? warrantyWithNumber.cost!.toNumber() : null,
  } as Warranty;
}

/**
 * Lists all warranties for a homeowner.
 */
export async function listWarranties(homeownerProfileId: string): Promise<Warranty[]> {
  const rawWarranties = await prisma.warranty.findMany({
    where: { homeownerProfileId },
    orderBy: { expiryDate: 'asc' },
    include: {
      documents: true
    }
  });

  // FIX: Convert Decimal to number for all listed warranties
  return rawWarranties.map(rawWarranty => {
    const warrantyWithNumber = rawWarranty as PrismaOutputWithDecimals<typeof rawWarranties[0]>;

    const convertedCost = rawWarranty.cost
        ? warrantyWithNumber.cost!.toNumber() // Use non-null assertion since rawWarranty.cost is checked
        : null;

    return {
      ...rawWarranty,
      cost: convertedCost,
    } as Warranty;
  }) as Warranty[];
}

/**
 * Updates an existing warranty record.
 */
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
    } as Prisma.WarrantyUpdateInput,
    include: { documents: true }
  });
  
  const warrantyWithNumber = rawUpdatedWarranty as PrismaOutputWithDecimals<typeof rawUpdatedWarranty>;

  // FIX: Convert Decimal to number before casting
  return {
    ...rawUpdatedWarranty,
    cost: rawUpdatedWarranty.cost ? warrantyWithNumber.cost!.toNumber() : null,
  } as Warranty;
}

/**
 * Deletes a warranty record.
 */
export async function deleteWarranty(
  warrantyId: string, 
  homeownerProfileId: string
): Promise<Warranty> {
  const rawDeletedWarranty = await prisma.warranty.delete({
    where: { id: warrantyId, homeownerProfileId },
  });
  
  const warrantyWithNumber = rawDeletedWarranty as PrismaOutputWithDecimals<typeof rawDeletedWarranty>;

  // FIX: Convert Decimal to number before casting
  return {
    ...rawDeletedWarranty,
    cost: rawDeletedWarranty.cost ? warrantyWithNumber.cost!.toNumber() : null,
  } as Warranty;
}

// --- INSURANCE POLICY SERVICE LOGIC ---

/**
 * Creates a new insurance policy record.
 */
export async function createInsurancePolicy(
  homeownerProfileId: string, 
  data: CreateInsurancePolicyDTO
): Promise<InsurancePolicy> {
  const rawPolicy = await prisma.insurancePolicy.create({
    data: {
      homeownerProfile: {
        connect: { id: homeownerProfileId },
      },
      property: data.propertyId ? { connect: { id: data.propertyId } } : undefined,
      
      carrierName: data.carrierName,
      policyNumber: data.policyNumber,
      coverageType: data.coverageType,
      premiumAmount: data.premiumAmount,
      startDate: new Date(data.startDate),
      expiryDate: new Date(data.expiryDate),
    } as Prisma.InsurancePolicyCreateInput,
  });
  
  const policyWithNumber = rawPolicy as PrismaOutputWithDecimals<typeof rawPolicy>;

  // FIX: Convert Decimal to number before casting
  return {
    ...rawPolicy,
    premiumAmount: policyWithNumber.premiumAmount!.toNumber(),
  } as InsurancePolicy;
}

/**
 * Lists all insurance policies for a homeowner.
 */
export async function listInsurancePolicies(homeownerProfileId: string): Promise<InsurancePolicy[]> {
  const rawPolicies = await prisma.insurancePolicy.findMany({
    where: { homeownerProfileId },
    orderBy: { expiryDate: 'asc' },
    include: {
      documents: true
    }
  });

  // FIX: Convert Decimal to number for all listed policies
  return rawPolicies.map(rawPolicy => {
    const policyWithNumber = rawPolicy as PrismaOutputWithDecimals<typeof rawPolicies[0]>;

    // We rely on the raw object having the Decimal instance with .toNumber()
    if (!policyWithNumber.premiumAmount || typeof policyWithNumber.premiumAmount.toNumber !== 'function') {
        throw new Error(`Policy ID ${rawPolicy.id} is missing a valid 'premiumAmount' field for conversion.`);
    }

    return {
      ...rawPolicy,
      premiumAmount: policyWithNumber.premiumAmount.toNumber(),
    } as InsurancePolicy;
  }) as InsurancePolicy[];
}

/**
 * Updates an existing insurance policy record.
 */
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
  
  const policyWithNumber = rawUpdatedPolicy as PrismaOutputWithDecimals<typeof rawUpdatedPolicy>;

  // FIX: Convert Decimal to number before casting
  return {
    ...rawUpdatedPolicy,
    premiumAmount: policyWithNumber.premiumAmount!.toNumber(),
  } as InsurancePolicy;
}

/**
 * Deletes an insurance policy record.
 */
export async function deleteInsurancePolicy(
  policyId: string, 
  homeownerProfileId: string
): Promise<InsurancePolicy> {
  const rawDeletedPolicy = await prisma.insurancePolicy.delete({
    where: { id: policyId, homeownerProfileId },
  });
  
  const policyWithNumber = rawDeletedPolicy as PrismaOutputWithDecimals<typeof rawDeletedPolicy>;

  // FIX: Convert Decimal to number before casting
  return {
    ...rawDeletedPolicy,
    premiumAmount: policyWithNumber.premiumAmount!.toNumber(),
  } as InsurancePolicy;
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
 * It mocks the file storage interaction and saves the record to the DB.
 */
export async function createDocument(
  homeownerProfileId: string, 
  data: CreateDocumentDTO,
  file: Express.Multer.File, // Assuming file is provided by multer middleware
): Promise<Document> {
  
  // 1. MOCK FILE UPLOAD
  // Generate a mock unique URL and size based on the uploaded file info
  const fileExtension = file.originalname.split('.').pop();
  const fileUrl = MOCK_STORAGE_URL + `${Date.now()}-${file.fieldname}.${fileExtension}`;
  
  // 2. INPUT VALIDATION (Simplified check)
  // Ensure the homeowner owns the property if a propertyId is provided
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
    // Strategy: Fetch all Documents where the uploadedBy ID matches the homeowner's ID.
    const documents = await prisma.document.findMany({
        where: { uploadedBy: homeownerProfileId },
        orderBy: { createdAt: 'desc' },
    });
    
    return documents as Document[];
}