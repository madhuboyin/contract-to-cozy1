import { NextRequest, NextResponse } from 'next/server';
import type { ActivationEntryContextInput } from '@/types';

const LOOKUP_COOKIE = 'ctc_onboarding_lookup';
const MAX_AGE_SECONDS = 15 * 60;

type OnboardingLookupPayload = {
  address: string;
  addressSource?: 'LOOKUP' | 'AUTOCOMPLETE' | 'MANUAL';
  city?: string;
  state?: string;
  zipCode?: string;
  yearBuilt?: number | null;
  propertySize?: number | null;
  estimatedValue?: number | null;
  dwellingType?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  basementConfiguration?: 'NONE' | 'UNFINISHED' | 'FINISHED' | 'UNKNOWN';
  hasPoolOrSpa?: boolean | null;
  lastSalePrice?: number | null;
  lastSaleDate?: string | null;
  activationContext?: ActivationEntryContextInput;
};

const ENTRY_PATHS = new Set(['EXISTING_OWNER_TRIGGER', 'EXISTING_HOME_PURCHASE', 'NEW_HOME_SETUP', 'MAJOR_MOMENT', 'EXPLORATION']);
const OWNERSHIP_STATES = new Set(['SHOPPING', 'UNDER_CONTRACT', 'RECENT_OWNER', 'ESTABLISHED_OWNER', 'PREPARING_TRANSFER', 'UNKNOWN']);
const PROPERTY_ORIGINS = new Set(['EXISTING_HOME', 'NEW_CONSTRUCTION', 'UNKNOWN']);
const TRIGGER_TYPES = new Set([
  'REPAIR', 'REPLACEMENT', 'CONTRACTOR_QUOTE', 'MAINTENANCE_BACKLOG', 'INSURANCE_COVERAGE',
  'RENEWAL_DEADLINE', 'PROJECT', 'ANTICIPATED_COST', 'INSPECTION_FINDING', 'PUNCH_LIST_WARRANTY',
  'CLAIM_DAMAGE', 'SELLING_TRANSFER', 'OTHER', 'NONE_EXPLORING',
]);
const BUYER_PURCHASE_STAGES = new Set(['EXPLORING', 'OFFER_MADE', 'UNDER_CONTRACT']);
const BUYER_INSPECTION_STATUSES = new Set(['NOT_SCHEDULED', 'SCHEDULED', 'REPORT_AVAILABLE', 'REVIEWED']);

function normalizeOptionalIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function sanitizeActivationContext(value: unknown): ActivationEntryContextInput | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  const trigger = source.activeTrigger && typeof source.activeTrigger === 'object'
    ? source.activeTrigger as Record<string, unknown>
    : null;
  if (!ENTRY_PATHS.has(String(source.entryPath)) ||
    !OWNERSHIP_STATES.has(String(source.ownershipState)) ||
    !PROPERTY_ORIGINS.has(String(source.propertyOrigin)) ||
    !trigger || !TRIGGER_TYPES.has(String(trigger.type))) {
    return undefined;
  }
  const label = normalizeString(trigger.label);
  if (!label) return undefined;
  const buyerSource = source.buyer && typeof source.buyer === 'object'
    ? source.buyer as Record<string, unknown>
    : null;
  const buyer = buyerSource &&
    BUYER_PURCHASE_STAGES.has(String(buyerSource.purchaseStage)) &&
    BUYER_INSPECTION_STATUSES.has(String(buyerSource.inspectionStatus))
    ? {
        purchaseStage: buyerSource.purchaseStage as NonNullable<ActivationEntryContextInput['buyer']>['purchaseStage'],
        inspectionStatus: buyerSource.inspectionStatus as NonNullable<ActivationEntryContextInput['buyer']>['inspectionStatus'],
        targetCloseDate: normalizeOptionalIsoDate(buyerSource.targetCloseDate),
        moveInDate: normalizeOptionalIsoDate(buyerSource.moveInDate),
        immediateConcern: normalizeString(buyerSource.immediateConcern) ?? null,
      }
    : undefined;
  return {
    entryPath: source.entryPath as ActivationEntryContextInput['entryPath'],
    ownershipState: source.ownershipState as ActivationEntryContextInput['ownershipState'],
    propertyOrigin: source.propertyOrigin as ActivationEntryContextInput['propertyOrigin'],
    activeTrigger: {
      type: trigger.type as ActivationEntryContextInput['activeTrigger']['type'],
      label,
      detail: normalizeString(trigger.detail) ?? null,
      entityType: 'PROPERTY',
      entityId: null,
      source: 'USER_SELECTED',
    },
    buyer,
    consentContext: normalizeString(source.consentContext)
      ?? 'User submitted this trigger to receive property-specific onboarding guidance.',
    sourceMetadata: {
      onboardingSurface: 'address',
      experienceMode: buyer ? 'BUYER_CLOSING' : undefined,
    },
  };
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeNumber(value: unknown): number | null | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBoolean(value: unknown): boolean | null | undefined {
  return value === null ? null : typeof value === 'boolean' ? value : undefined;
}

function sanitizePayload(input: unknown): OnboardingLookupPayload | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  const address = normalizeString(source.address);
  if (!address) return null;
  const addressSource = source.addressSource === 'MANUAL'
    ? 'MANUAL'
    : source.addressSource === 'AUTOCOMPLETE'
      ? 'AUTOCOMPLETE'
      : 'LOOKUP';
  const city = normalizeString(source.city);
  const state = normalizeString(source.state)?.toUpperCase();
  const zipCode = normalizeString(source.zipCode);
  if (!city || !state?.match(/^[A-Z]{2}$/) || !zipCode?.match(/^\d{5}$/)) {
    return null;
  }

  return {
    address,
    addressSource,
    city,
    state,
    zipCode,
    yearBuilt: normalizeNumber(source.yearBuilt),
    propertySize: normalizeNumber(source.propertySize),
    estimatedValue: normalizeNumber(source.estimatedValue),
    dwellingType: normalizeString(source.dwellingType) ?? null,
    bedrooms: normalizeNumber(source.bedrooms),
    bathrooms: normalizeNumber(source.bathrooms),
    basementConfiguration: ['NONE', 'UNFINISHED', 'FINISHED', 'UNKNOWN'].includes(String(source.basementConfiguration))
      ? source.basementConfiguration as OnboardingLookupPayload['basementConfiguration']
      : 'UNKNOWN',
    hasPoolOrSpa: normalizeBoolean(source.hasPoolOrSpa),
    lastSalePrice: normalizeNumber(source.lastSalePrice),
    lastSaleDate: normalizeString(source.lastSaleDate) ?? null,
    activationContext: sanitizeActivationContext(source.activationContext),
  };
}

function encodePayload(payload: OnboardingLookupPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(cookieValue: string | undefined): OnboardingLookupPayload | null {
  if (!cookieValue) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookieValue, 'base64url').toString('utf8'));
    return sanitizePayload(parsed);
  } catch {
    return null;
  }
}

function buildCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  };
}

export async function POST(req: NextRequest) {
  let body: { data?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const payload = sanitizePayload(body.data);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid onboarding lookup payload' }, { status: 400 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(LOOKUP_COOKIE, encodePayload(payload), buildCookieOptions());
  return res;
}

export async function GET(req: NextRequest) {
  const payload = decodePayload(req.cookies.get(LOOKUP_COOKIE)?.value);
  if (!payload) {
    return NextResponse.json({ error: 'No onboarding lookup session found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: payload });
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(LOOKUP_COOKIE, '', {
    ...buildCookieOptions(),
    maxAge: 0,
  });
  return res;
}
