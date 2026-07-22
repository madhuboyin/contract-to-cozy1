import {
  InventoryCoverageEvidenceStatus,
  InventoryItemCategory,
  InventoryItemCondition,
  Prisma,
  WarrantyCategory,
} from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { visibleInventoryItemWhere } from '../../../services/riskAssetApplicability';
import type {
  ContextCaptureDefinition,
  RelationalCaptureInputSchema,
  RelationalSelectCreateInputSchema,
} from '../domain/contracts';

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
  operationInput?: Record<string, unknown>,
): Promise<RelationalCaptureInputSchema> {
  if (definition.mode !== 'RELATIONAL' || !definition.relationalAdapterKey) {
    throw new Error('Capture is not backed by a relational adapter.');
  }
  if (definition.inputSchema.type === 'RELATIONAL_UPDATE') {
    const inputKey = definition.relationalEntityInputKey;
    const entityId = inputKey ? operationInput?.[inputKey] : undefined;
    if (!definition.relationalAdapterKey.startsWith('INVENTORY_ITEM_') || typeof entityId !== 'string' || !entityId.trim()) {
      throw new Error('Relational update is missing its scoped inventory item.');
    }
    const item = await prisma.inventoryItem.findFirst({
      where: { id: entityId, propertyId },
      select: {
        id: true,
        condition: true,
        installedOn: true,
        purchasedOn: true,
        replacementCostCents: true,
        coverageEvidenceStatus: true,
        insurancePolicyId: true,
        warrantyId: true,
      },
    });
    if (!item) throw new Error('The selected inventory item does not belong to this property.');
    let fields = definition.inputSchema.fields;
    let coverageChoice: string = item.insurancePolicyId
      ? `INSURANCE:${item.insurancePolicyId}`
      : item.warrantyId
        ? `WARRANTY:${item.warrantyId}`
        : item.coverageEvidenceStatus === 'NONE'
          ? 'NO_COVERAGE'
          : item.coverageEvidenceStatus === 'NOT_SURE'
            ? 'NOT_SURE'
            : '';
    if (definition.relationalAdapterKey === 'INVENTORY_ITEM_COVERAGE_EVIDENCE') {
      const today = new Date();
      const [policies, warranties] = await Promise.all([
        prisma.insurancePolicy.findMany({
          where: { propertyId, startDate: { lte: today }, expiryDate: { gte: today } },
          select: { id: true, carrierName: true, policyNumber: true },
          orderBy: [{ expiryDate: 'desc' }, { createdAt: 'asc' }],
        }),
        prisma.warranty.findMany({
          where: { propertyId, startDate: { lte: today }, expiryDate: { gte: today } },
          select: { id: true, providerName: true, policyNumber: true },
          orderBy: [{ expiryDate: 'desc' }, { createdAt: 'asc' }],
        }),
      ]);
      fields = fields.map((field) => field.key !== 'coverageChoice' || field.inputSchema.type !== 'SINGLE_SELECT'
        ? field
        : {
          ...field,
          inputSchema: {
            ...field.inputSchema,
            options: [
              ...policies.map((policy) => ({
                label: `Use insurance: ${policy.carrierName} · ${policy.policyNumber}`,
                value: `INSURANCE:${policy.id}`,
              })),
              ...warranties.map((warranty) => ({
                label: `Use warranty: ${warranty.providerName}${warranty.policyNumber ? ` · ${warranty.policyNumber}` : ''}`,
                value: `WARRANTY:${warranty.id}`,
              })),
              ...field.inputSchema.options,
            ],
          },
        });
    }
    return {
      ...definition.inputSchema,
      entityId: item.id,
      fields,
      currentValues: {
        condition: item.condition,
        installedOn: item.installedOn?.toISOString().slice(0, 10) ?? '',
        purchasedOn: item.purchasedOn?.toISOString().slice(0, 10) ?? '',
        replacementValueUsd: item.replacementCostCents ? item.replacementCostCents / 100 : undefined,
        coverageChoice,
      },
    };
  }
  if (definition.inputSchema.type !== 'RELATIONAL_SELECT_CREATE') {
    throw new Error('Relational select/create capture has an invalid input schema.');
  }
  let options: RelationalSelectCreateInputSchema['options'];
  let createFields = definition.inputSchema.createFields;
  if (definition.relationalAdapterKey === 'INVENTORY_ITEM') {
    const [items, rooms] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { propertyId, ...visibleInventoryItemWhere() },
        select: { id: true, name: true, category: true, condition: true },
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
      }),
      prisma.inventoryRoom.findMany({
        where: { propertyId },
        select: { id: true, name: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);
    options = items.map((item) => ({ id: item.id, label: item.name, description: `${item.category} · ${item.condition}` }));
    createFields = createFields.map((field) => field.key !== 'roomId' || field.inputSchema.type !== 'SINGLE_SELECT'
      ? field
      : { ...field, inputSchema: { ...field.inputSchema, options: rooms.map((room) => ({ value: room.id, label: room.name })) } });
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
  return { ...definition.inputSchema, options, createFields };
}

function parseOptionalDateOnly(values: Record<string, unknown>, key: string): Date | null {
  const value = values[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${key} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error(`${key} is not a valid date.`);
  const today = new Date();
  today.setUTCHours(23, 59, 59, 999);
  if (date > today) throw new Error(`${key} cannot be in the future.`);
  return date;
}

async function updateInventoryItemLifecycle(
  tx: Prisma.TransactionClient,
  propertyId: string,
  entityId: unknown,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Inventory item identity is required.');
  const condition = values.condition;
  if (typeof condition !== 'string' || !Object.values(InventoryItemCondition).includes(condition as InventoryItemCondition)) {
    throw new Error('Select a registered inventory condition.');
  }
  const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
  if (!item) throw new Error('The selected inventory item does not belong to this property.');
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: {
      condition: condition as InventoryItemCondition,
      installedOn: parseOptionalDateOnly(values, 'installedOn'),
      purchasedOn: parseOptionalDateOnly(values, 'purchasedOn'),
      sourceType: 'MANUAL',
      verificationSource: 'PROPERTY_CONTEXT_INLINE',
    },
  });
  return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: false };
}

async function updateInventoryItemConfirmation(
  tx: Prisma.TransactionClient,
  propertyId: string,
  entityId: unknown,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Inventory item identity is required.');
  const confirmation = requiredText(values, 'confirmation');
  if (!['CONFIRMED', 'NOT_PRESENT', 'NOT_SURE'].includes(confirmation)) throw new Error('Choose whether this system is present.');
  const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true, tags: true } });
  if (!item) throw new Error('The selected inventory item does not belong to this property.');
  if (confirmation === 'CONFIRMED') {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: { isVerified: true, verificationSource: 'USER_CONFIRMED' },
    });
  } else if (confirmation === 'NOT_PRESENT') {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        isVerified: true,
        verificationSource: 'USER_CONFIRMED_ABSENT',
        tags: { set: [...new Set([...item.tags, 'INFERRED_NOT_PRESENT'])] },
      },
    });
  }
  return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: false };
}

async function updateInventoryItemCoverageLifecycle(
  tx: Prisma.TransactionClient,
  propertyId: string,
  entityId: unknown,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Inventory item identity is required.');
  const condition = requiredText(values, 'condition');
  if (!Object.values(InventoryItemCondition).includes(condition as InventoryItemCondition) || condition === 'UNKNOWN') {
    throw new Error('Select the current condition.');
  }
  const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
  if (!item) throw new Error('The selected inventory item does not belong to this property.');
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { condition: condition as InventoryItemCondition, installedOn: parseDateOnly(values, 'installedOn') },
  });
  return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: false };
}

async function updateInventoryItemValue(
  tx: Prisma.TransactionClient,
  propertyId: string,
  entityId: unknown,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Inventory item identity is required.');
  const replacementValueUsd = values.replacementValueUsd;
  if (typeof replacementValueUsd !== 'number' || !Number.isFinite(replacementValueUsd) || replacementValueUsd <= 0) {
    throw new Error('Enter a replacement value greater than zero.');
  }
  const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
  if (!item) throw new Error('The selected inventory item does not belong to this property.');
  await tx.inventoryItem.update({
    where: { id: item.id },
    data: { replacementCostCents: Math.round(replacementValueUsd * 100) },
  });
  return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: false };
}

async function updateInventoryItemCoverageEvidence(
  tx: Prisma.TransactionClient,
  propertyId: string,
  entityId: unknown,
  values: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Inventory item identity is required.');
  const coverageChoice = requiredText(values, 'coverageChoice');
  const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId }, select: { id: true } });
  if (!item) throw new Error('The selected inventory item does not belong to this property.');

  if (coverageChoice === 'NO_COVERAGE' || coverageChoice === 'NOT_SURE') {
    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        coverageEvidenceStatus: coverageChoice === 'NO_COVERAGE'
          ? InventoryCoverageEvidenceStatus.NONE
          : InventoryCoverageEvidenceStatus.NOT_SURE,
      },
    });
  } else if (coverageChoice.startsWith('INSURANCE:')) {
    const policyId = coverageChoice.slice('INSURANCE:'.length);
    const policy = await tx.insurancePolicy.findFirst({ where: { id: policyId, propertyId }, select: { id: true } });
    if (!policy) throw new Error('The selected insurance policy does not belong to this property.');
    await tx.inventoryItem.update({ where: { id: item.id }, data: { insurancePolicyId: policy.id, coverageEvidenceStatus: 'UNKNOWN' } });
  } else if (coverageChoice.startsWith('WARRANTY:')) {
    const warrantyId = coverageChoice.slice('WARRANTY:'.length);
    const warranty = await tx.warranty.findFirst({ where: { id: warrantyId, propertyId }, select: { id: true } });
    if (!warranty) throw new Error('The selected warranty does not belong to this property.');
    await tx.inventoryItem.update({ where: { id: item.id }, data: { warrantyId: warranty.id, coverageEvidenceStatus: 'UNKNOWN' } });
  } else if (coverageChoice === 'ADD_INSURANCE') {
    const selection = await createInsurancePolicy(tx, propertyId, {
      carrierName: values.carrierName,
      policyNumber: values.insurancePolicyNumber,
      coverageType: values.insuranceCoverageType,
      premiumAmount: values.insurancePremiumUsd,
      startDate: values.insuranceStartDate,
      expiryDate: values.insuranceExpiryDate,
    });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { insurancePolicyId: selection.entityId, coverageEvidenceStatus: 'UNKNOWN' } });
  } else if (coverageChoice === 'ADD_WARRANTY') {
    const selection = await createWarranty(tx, propertyId, {
      providerName: values.warrantyProviderName,
      category: values.warrantyCategory,
      startDate: values.warrantyStartDate,
      expiryDate: values.warrantyExpiryDate,
    });
    await tx.inventoryItem.update({ where: { id: item.id }, data: { warrantyId: selection.entityId, coverageEvidenceStatus: 'UNKNOWN' } });
  } else {
    throw new Error('Choose a valid coverage option.');
  }
  return { entityType: 'INVENTORY_ITEM', entityId: item.id, created: false };
}

async function selectExisting(
  tx: Prisma.TransactionClient,
  propertyId: string,
  adapterKey: RelationalAdapterKey,
  entityId: unknown,
): Promise<RelationalCaptureSelection> {
  if (typeof entityId !== 'string' || !entityId.trim()) throw new Error('Select an existing record to continue.');
  if (adapterKey === 'INVENTORY_ITEM') {
    const item = await tx.inventoryItem.findFirst({ where: { id: entityId, propertyId, ...visibleInventoryItemWhere() }, select: { id: true } });
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
  const roomId = optionalText(values, 'roomId');
  if (typeof category !== 'string' || !Object.values(InventoryItemCategory).includes(category as InventoryItemCategory)) {
    throw new Error('Select a registered inventory category.');
  }
  if (typeof condition !== 'string' || !Object.values(InventoryItemCondition).includes(condition as InventoryItemCondition)) {
    throw new Error('Select a registered inventory condition.');
  }
  if (['APPLIANCE', 'FURNITURE', 'ELECTRONICS', 'OTHER'].includes(String(category)) && !roomId) {
    throw new Error('Choose a room for appliances and belongings. Whole-home systems do not require a room.');
  }
  if (roomId) {
    const room = await tx.inventoryRoom.findFirst({ where: { id: roomId, propertyId }, select: { id: true } });
    if (!room) throw new Error('The selected room does not belong to this property.');
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
      roomId,
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
  operationInput?: Record<string, unknown>,
): Promise<RelationalCaptureSelection> {
  if (definition.mode !== 'RELATIONAL' || !definition.relationalAdapterKey) throw new Error('Relational capture adapter is not registered.');
  if (definition.inputSchema.type === 'RELATIONAL_UPDATE') {
    const scopedEntityId = definition.relationalEntityInputKey
      ? operationInput?.[definition.relationalEntityInputKey]
      : undefined;
    if (answer.mode !== 'UPDATE' || answer.entityId !== scopedEntityId || !answer.values || typeof answer.values !== 'object' || Array.isArray(answer.values)) {
      throw new Error('Update the item selected for this operation.');
    }
    const values = answer.values as Record<string, unknown>;
    if (definition.relationalAdapterKey === 'INVENTORY_ITEM_CONFIRMATION') return updateInventoryItemConfirmation(tx, propertyId, answer.entityId, values);
    if (definition.relationalAdapterKey === 'INVENTORY_ITEM_COVERAGE_LIFECYCLE') return updateInventoryItemCoverageLifecycle(tx, propertyId, answer.entityId, values);
    if (definition.relationalAdapterKey === 'INVENTORY_ITEM_VALUE') return updateInventoryItemValue(tx, propertyId, answer.entityId, values);
    if (definition.relationalAdapterKey === 'INVENTORY_ITEM_COVERAGE_EVIDENCE') return updateInventoryItemCoverageEvidence(tx, propertyId, answer.entityId, values);
    return updateInventoryItemLifecycle(tx, propertyId, answer.entityId, values);
  }
  if (answer.mode === 'SELECT') return selectExisting(tx, propertyId, definition.relationalAdapterKey, answer.entityId);
  if (answer.mode !== 'CREATE' || !answer.values || typeof answer.values !== 'object' || Array.isArray(answer.values)) {
    throw new Error('Choose an existing record or add a new one.');
  }
  const values = answer.values as Record<string, unknown>;
  if (definition.relationalAdapterKey === 'INVENTORY_ITEM') return createInventoryItem(tx, propertyId, values);
  if (definition.relationalAdapterKey === 'INSURANCE_POLICY') return createInsurancePolicy(tx, propertyId, values);
  return createWarranty(tx, propertyId, values);
}
