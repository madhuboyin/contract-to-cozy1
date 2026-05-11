import { NextRequest, NextResponse } from 'next/server';

const LOOKUP_COOKIE = 'ctc_onboarding_lookup';
const MAX_AGE_SECONDS = 15 * 60;

type OnboardingLookupPayload = {
  address: string;
  city?: string;
  state?: string;
  zipCode?: string;
  yearBuilt?: number | null;
  propertySize?: number | null;
  estimatedValue?: number | null;
  propertyType?: string | null;
  lastSalePrice?: number | null;
  lastSaleDate?: string | null;
};

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeNumber(value: unknown): number | null | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizePayload(input: unknown): OnboardingLookupPayload | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  const address = normalizeString(source.address);
  if (!address) return null;

  return {
    address,
    city: normalizeString(source.city),
    state: normalizeString(source.state),
    zipCode: normalizeString(source.zipCode),
    yearBuilt: normalizeNumber(source.yearBuilt),
    propertySize: normalizeNumber(source.propertySize),
    estimatedValue: normalizeNumber(source.estimatedValue),
    propertyType: normalizeString(source.propertyType) ?? null,
    lastSalePrice: normalizeNumber(source.lastSalePrice),
    lastSaleDate: normalizeString(source.lastSaleDate) ?? null,
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
