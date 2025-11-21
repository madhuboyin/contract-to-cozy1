// apps/backend/src/services/home-management.service.ts

import { PrismaClient, Prisma } from '@prisma/client';
import { 
  CreateWarrantyDTO, UpdateWarrantyDTO, Warranty, 
  CreateInsurancePolicyDTO, UpdateInsurancePolicyDTO, InsurancePolicy,
  CreateExpenseDTO, UpdateExpenseDTO, Expense 
} from '../types'; 

const prisma = new PrismaClient();

// Helper type to access Decimal fields for conversion without deep Prisma client types
type PrismaOutputWithDecimals<T> = T & { 
  amount?: { toNumber: () => number };
  cost?: { toNumber: () => number | null };
  premiumAmount?: { toNumber: () => number };
};

// --- EXPENSE SERVICE LOGIC ---

/**
 * Creates a new expense record for a homeowner.
 */
export async function createExpense(
  homeownerProfileId: string, 
  data: CreateExpenseDTO
): Promise<Expense> {
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
  
  // FIX: Convert Decimal to number before casting
  return {
    ...rawExpense,
    amount: (rawExpense as PrismaOutputWithDecimals<typeof rawExpense>).amount!.toNumber(),
  } as Expense;
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

  // FIX: Convert Decimal to number for all listed expenses
  return rawExpenses.map(rawExpense => ({
    ...rawExpense,
    amount: (rawExpense as PrismaOutputWithDecimals<typeof rawExpense>).amount!.toNumber(),
  })) as Expense[];
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
  
  // FIX: Convert Decimal to number before casting
  return {
    ...rawUpdatedExpense,
    amount: (rawUpdatedExpense as PrismaOutputWithDecimals<typeof rawUpdatedExpense>).amount!.toNumber(),
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
  
  // FIX: Convert Decimal to number before casting
  return {
    ...rawDeletedExpense,
    amount: (rawDeletedExpense as PrismaOutputWithDecimals<typeof rawDeletedExpense>).amount!.toNumber(),
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

  // FIX: Convert Decimal to number before casting (cost is optional)
  return {
    ...rawWarranty,
    cost: rawWarranty.cost ? (rawWarranty as PrismaOutputWithDecimals<typeof rawWarranty>).cost!.toNumber() : null,
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
      documents: { select: { id: true, name: true, fileUrl: true } }
    }
  });

  // FIX: Convert Decimal to number for all listed warranties
  return rawWarranties.map(rawWarranty => ({
    ...rawWarranty,
    cost: rawWarranty.cost ? (rawWarranty as PrismaOutputWithDecimals<typeof rawWarranty>).cost!.toNumber() : null,
  })) as Warranty[];
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
    include: { documents: { select: { id: true, name: true, fileUrl: true } } }
  });

  // FIX: Convert Decimal to number before casting
  return {
    ...rawUpdatedWarranty,
    cost: rawUpdatedWarranty.cost ? (rawUpdatedWarranty as PrismaOutputWithDecimals<typeof rawUpdatedWarranty>).cost!.toNumber() : null,
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

  // FIX: Convert Decimal to number before casting
  return {
    ...rawDeletedWarranty,
    cost: rawDeletedWarranty.cost ? (rawDeletedWarranty as PrismaOutputWithDecimals<typeof rawDeletedWarranty>).cost!.toNumber() : null,
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

  // FIX: Convert Decimal to number before casting
  return {
    ...rawPolicy,
    premiumAmount: (rawPolicy as PrismaOutputWithDecimals<typeof rawPolicy>).premiumAmount!.toNumber(),
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
      documents: { select: { id: true, name: true, fileUrl: true } }
    }
  });

  // FIX: Convert Decimal to number for all listed policies
  return rawPolicies.map(rawPolicy => ({
    ...rawPolicy,
    premiumAmount: (rawPolicy as PrismaOutputWithDecimals<typeof rawPolicy>).premiumAmount!.toNumber(),
  })) as InsurancePolicy[];
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
    include: { documents: { select: { id: true, name: true, fileUrl: true } } }
  });

  // FIX: Convert Decimal to number before casting
  return {
    ...rawUpdatedPolicy,
    premiumAmount: (rawUpdatedPolicy as PrismaOutputWithDecimals<typeof rawUpdatedPolicy>).premiumAmount!.toNumber(),
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

  // FIX: Convert Decimal to number before casting
  return {
    ...rawDeletedPolicy,
    premiumAmount: (rawDeletedPolicy as PrismaOutputWithDecimals<typeof rawDeletedPolicy>).premiumAmount!.toNumber(),
  } as InsurancePolicy;
}