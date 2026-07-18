import { InventoryItemCategory, InventoryItemCondition, Prisma, WarrantyCategory } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import type { ContextCaptureDefinition, RelationalCaptureInputSchema } from '../domain/contracts';

type RelationalAdapterKey = NonNullable<ContextCaptureDefinition['relationalAdapterKey']>;

export interface RelationalCaptureSelection {
  entityType: RelationalCaptureInputSchema['entityType'];
  entityId: string;
  created: boolean;
}

const compact = (value: string) => value.trim().replace(/\s+/g, ' ');
const normalized = (value: string) => compact(value).toLocaleLowerCase();

function requiredText(values: Record<string, unknown>, key: string): string {
  const value = values[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Relational capture is missing required field: ${key}`);
  return compact(value);
}

function optionalText(values: Record<string, unknown>, key: string): string | null {
  const value = values[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${key} must be text.`);
  return compact(value) || null;
}

function parseDateOnly(values: Record<string, unknown>, key: string): Date {
  const value = requiredText(values, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${key} is not a valid date.`);
  return date;
}

export async function resolveRelationalCaptureSchema(
  propertyId: string,
  definition: ContextCaptureDefinition,
): Promise<RelationalCaptureInputSchema> {
  if (definition.mode !== 'RELATIONAL' || definition.inputSchema.type !== 'RELATIONAL_SELECT_CREATE' || !definition.relationalAdapterKey) {
    throw new Error('Capture is not backed by a relational adapter.');
  }
  let options: RelationalCaptureInputSchema['options'];
  if (definition.relationalAdapterKey === 'INVENTORY_ITEM') {
    options = (await prisma.inventoryItem.findMany({
      where: { propertyId },
      select: { id: true, name: true, category: true, condition: true },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    })).map((item) => ({ id: item.id, label: item.name, description: `${item.category} · ${item.condition}` }));
  } else if (definition.relationalAdapterKey === 'INSURANCE_POLICY') {
    options = (await prisma.insurancePolicy.findMany({
      where: { propertyId, startDate: { lte: new Date() }, expiryDate: { gte: new Date() } },
      select: { id: true, carrierName: true, policyNumber: true, coverageType: true },
      orderBy: [{ expiryDate: 'desc' }, { createdAt: 'asc' }],
    })).map((policy) => ({
      id: policy.id,
      label: `${policy.carrierName} · ${policy.policyNumber}`,
      description: policy.coverageType ?? 'Property policy',
    }));
  } else {
    options = (await prisma.warranty.findMany({
      where: { propertyId, startDate: { lte: new Date() }, expiryDate: { gte: new Date() } },
      select: { id: true, providerName: true, policyNumber: true, category: true },
      orderBy: [{ expiryDate: 'desc' }, { createdAt: 'asc' }],
    })).map((warranty) => ({
      id: warranty.id,
      label: warranty.policyNumber ? `${warranty.providerName} · ${warranty.policyNumber}` : warranty.providerName,
      description: warranty.category,
    }));
  }
  return { ...definition.inputSchema, options };
}

async function selectExisting(
  tx: Prisma.TransactionClient,
  propertyId: string,
  adapterKey: RelationalAdapterKey,
  entityId: unknown,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Select an existing record to continue.');
  if (adapterKey === 'INVENTORY_ITEM') {
    const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
    if (!item) throw new Error('The selected inventory item does not belong to this property.');
    return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: false };
  }
  if (adapterKey === 'INSURANCE_POLICY') {
    const policy = await tx.insurancePolicy.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
    if (!policy) throw new Error('The selected insurance policy does not belong to this property.');
    return { entityType: 'INSURANCE_POLICY', entityId: policy.id, created: false };
  }
  const warranty = await tx.warranty.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
  if (!warranty) throw new Error('The selected warranty does not belong to this property.');
  return { entityType: 'WARRANTY', entityId: warranty.id, created: false };
}

async function createInventoryItem(
  tx: Prisma.TransactionClient,
  propertyId: string,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  const name = requiredText(values, 'name');
  const category = values.category;
  const condition = values.condition;
  if (typeof category !== 'string' || !Object.values(InventoryItemCategory).includes(category as InventoryItemCategory)) {
    throw new Error('Select a registered inventory category.');
  }
  if (typeof condition !== 'string' || !Object.values(InventoryItemCondition).includes(condition as InventoryItemCondition)) {
    throw new Error('Select a registered inventory condition.');
  }
  const candidates = await tx.inventoryItem.findMany({
    where: { propertyId, category: category as InventoryItemCategory },
    select: { id: true, name: true },
  });
  const duplicate = candidates.find((item) => normalized(item.name) === normalized(name));
  if (duplicate) throw new Error('A matching inventory item already exists. Select it instead of adding a duplicate.');
  const item = await tx.inventoryItem.create({
    data: {
      propertyId,
      name,
      category: category as InventoryItemCategory,
      condition: condition as InventoryItemCondition,
      sourceType: 'MANUAL',
      verificationSource: 'PROPERTY_CONTEXT_INLINE',
    },
    select: { id: true },
  });
  return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: true };
}

async function createInsurancePolicy(
  tx: Prisma.TransactionClient,
  propertyId: string,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  const carrierName = requiredText(values, 'carrierName');
  const policyNumber = requiredText(values, 'policyNumber');
  const coverageType = requiredText(values, 'coverageType');
  const premiumAmount = values.premiumAmount;
  if (typeof premiumAmount !== 'number' || !Number.isFinite(premiumAmount) || premiumAmount < 0) {
    throw new Error('Annual premium must be a non-negative number.');
  }
  const startDate = parseDateOnly(values, 'startDate');
  const expiryDate = parseDateOnly(values, 'expiryDate');
  if (expiryDate <= startDate) throw new Error('Policy expiry date must be after the start date.');
  const property = await tx.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } });
  if (!property) throw new Error('Property not found.');
  const candidates = await tx.insurancePolicy.findMany({
    where: { propertyId },
    select: { id: true, carrierName: true, policyNumber: true },
  });
  const duplicate = candidates.find((policy) =>
    normalized(policy.carrierName) === normalized(carrierName)
    && normalized(policy.policyNumber) === normalized(policyNumber));
  if (duplicate) throw new Error('A matching insurance policy already exists. Select it instead of adding a duplicate.');
  const policy = await tx.insurancePolicy.create({
    data: {
      homeownerProfileId: property.homeownerProfileId,
      propertyId,
      carrierName,
      policyNumber,
      coverageType,
      premiumAmount: new Prisma.Decimal(premiumAmount),
      startDate,
      expiryDate,
      isVerified: false,
    },
    select: { id: true },
  });
  return { entityType: 'INSURANCE_POLICY', entityId: policy.id, created: true };
}

async function createWarranty(
  tx: Prisma.TransactionClient,
  propertyId: string,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  const providerName = requiredText(values, 'providerName');
  const policyNumber = optionalText(values, 'policyNumber');
  const category = values.category;
  if (typeof category !== 'string' || !Object.values(WarrantyCategory).includes(category as WarrantyCategory)) {
    throw new Error('Select a registered warranty category.');
  }
  const startDate = parseDateOnly(values, 'startDate');
  const expiryDate = parseDateOnly(values, 'expiryDate');
  if (expiryDate <= startDate) throw new Error('Warranty expiry date must be after the start date.');
  const property = await tx.property.findUnique({ where: { id: propertyId }, select: { homeownerProfileId: true } });
  if (!property) throw new Error('Property not found.');
  const candidates = await tx.warranty.findMany({
    where: { propertyId, category: category as WarrantyCategory },
    select: { id: true, providerName: true, policyNumber: true, startDate: true, expiryDate: true },
  });
  const duplicate = candidates.find((warranty) => {
    if (normalized(warranty.providerName) !== normalized(providerName)) return false;
    if (policyNumber && warranty.policyNumber) return normalized(warranty.policyNumber) === normalized(policyNumber);
    return warranty.startDate.getTime() === startDate.getTime() && warranty.expiryDate.getTime() === expiryDate.getTime();
  });
  if (duplicate) throw new Error('A matching warranty already exists. Select it instead of adding a duplicate.');
  const warranty = await tx.warranty.create({
    data: {
      homeownerProfileId: property.homeownerProfileId,
      propertyId,
      providerName,
      policyNumber,
      category: category as WarrantyCategory,
      startDate,
      expiryDate,
    },
    select: { id: true },
  });
  return { entityType: 'WARRANTY', entityId: warranty.id, created: true };
}

export async function executeRelationalCapture(
  tx: Prisma.TransactionClient,
  propertyId: string,
  definition: ContextCaptureDefinition,
  answer: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (definition.mode !== 'RELATIONAL' || !definition.relationalAdapterKey) throw new Error('Relational capture adapter is not registered.');
  if (answer.mode === 'SELECT') return selectExisting(tx, propertyId, definition.relationalAdapterKey, answer.entityId);
  if (answer.mode !== 'CREATE' || !answer.values || typeof answer.values !== 'object' || Array.isArray(answer.values)) {
    throw new Error('Choose an existing record or add a new one.');
  }
  const values = answer.values as Record<string, unknown>;
  if (definition.relationalAdapterKey === 'INVENTORY_ITEM') return createInventoryItem(tx, propertyId, values);
  if (definition.relationalAdapterKey === 'INSURANCE_POLICY') return createInsurancePolicy(tx, propertyId, values);
  return createWarranty(tx, propertyId, values);
}
