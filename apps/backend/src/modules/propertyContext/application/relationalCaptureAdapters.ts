import { InventoryItemCategory, InventoryItemCondition, Prisma } from '@prisma/client';
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
  const options = definition.relationalAdapterKey === 'INVENTORY_ITEM'
    ? (await prisma.inventoryItem.findMany({
      where: { propertyId },
      select: { id: true, name: true, category: true, condition: true },
      orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
    })).map((item) => ({ id: item.id, label: item.name, description: `${item.category} · ${item.condition}` }))
    : (await prisma.insurancePolicy.findMany({
      where: { propertyId },
      select: { id: true, carrierName: true, policyNumber: true, coverageType: true },
      orderBy: [{ expiryDate: 'desc' }, { createdAt: 'asc' }],
    })).map((policy) => ({
      id: policy.id,
      label: `${policy.carrierName} · ${policy.policyNumber}`,
      description: policy.coverageType ?? 'Property policy',
    }));
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
  const policy = await tx.insurancePolicy.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
  if (!policy) throw new Error('The selected insurance policy does not belong to this property.');
  return { entityType: 'INSURANCE_POLICY', entityId: policy.id, created: false };
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
  return definition.relationalAdapterKey === 'INVENTORY_ITEM'
    ? createInventoryItem(tx, propertyId, values)
    : createInsurancePolicy(tx, propertyId, values);
}
