import fetch from 'node-fetch';
import { z } from 'zod';
import type {
  PropertyAddressIdentity,
  RentCastFetchOutcome,
  RentCastPropertyRecord,
} from './contracts';

export const RENTCAST_PROPERTIES_URL = 'https://api.rentcast.io/v1/properties';
export const DEFAULT_RENTCAST_TIMEOUT_MS = 5_000;
export const DEFAULT_RENTCAST_MAX_RESPONSE_BYTES = 1_000_000;

const optionalText = z.string().trim().min(1).max(500).nullish().catch(undefined);
const optionalNumber = z.number().finite().nullish().catch(undefined);
const recordSchema = z.object({
  id: z.string().trim().min(1).max(500),
  formattedAddress: z.string().trim().min(1).max(1_000),
  addressLine1: z.string().trim().min(1).max(500),
  addressLine2: optionalText,
  city: z.string().trim().min(1).max(200),
  state: z.string().trim().length(2),
  stateFips: optionalText,
  zipCode: z.string().trim().regex(/^\d{5}$/),
  county: optionalText,
  countyFips: optionalText,
  latitude: optionalNumber,
  longitude: optionalNumber,
  propertyType: optionalText,
  bedrooms: optionalNumber,
  bathrooms: optionalNumber,
  squareFootage: optionalNumber,
  lotSize: optionalNumber,
  yearBuilt: optionalNumber,
  assessorID: optionalText,
});
const responseSchema = z.array(recordSchema).max(100);

interface HeadersLike {
  get(name: string): string | null;
}

interface ResponseLike {
  ok: boolean;
  status: number;
  headers?: HeadersLike;
  body?: AsyncIterable<Uint8Array | string> | null;
  text(): Promise<string>;
}

export type RentCastFetchLike = (
  url: string,
  init: {
    method: 'GET';
    headers: Record<string, string>;
    signal: AbortSignal;
    redirect: 'error';
  },
) => Promise<ResponseLike>;

export interface RentCastClientOptions {
  fetchImpl?: RentCastFetchLike;
  apiKey?: string | (() => string | undefined);
  timeoutMs?: number;
  maxResponseBytes?: number;
  now?: () => Date;
}

function defaultFetch(url: string, init: Parameters<RentCastFetchLike>[1]) {
  return fetch(url, init) as unknown as Promise<ResponseLike>;
}

function apiKeyReader(configured?: string | (() => string | undefined)) {
  if (typeof configured === 'function') return configured;
  if (typeof configured === 'string') return () => configured;
  return () => process.env.RENTCAST_API_KEY;
}

function validRequestAddress(address: PropertyAddressIdentity): boolean {
  return Boolean(
    address.address.trim()
      && address.city.trim()
      && /^[A-Za-z]{2}$/.test(address.state.trim())
      && /^\d{5}$/.test(address.zipCode.trim()),
  );
}

export function buildRentCastRequestAddress(address: PropertyAddressIdentity): string {
  return [
    address.address.trim(),
    address.unit?.trim(),
    address.city.trim(),
    address.state.trim().toUpperCase(),
    address.zipCode.trim(),
  ].filter(Boolean).join(', ');
}

async function boundedResponseText(
  response: ResponseLike,
  maxBytes: number,
): Promise<string | null> {
  const declaredLength = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) return null;

  if (response.body?.[Symbol.asyncIterator]) {
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) return null;
      chunks.push(buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  const text = await response.text();
  return Buffer.byteLength(text, 'utf8') <= maxBytes ? text : null;
}

function classifyHttpFailure(status: number): RentCastFetchOutcome {
  if (status === 400) return { kind: 'TERMINAL', code: 'INVALID_REQUEST' };
  if (status === 401) return { kind: 'TERMINAL', code: 'UNAUTHORIZED' };
  if (status === 403) return { kind: 'TERMINAL', code: 'FORBIDDEN' };
  if (status === 429) return { kind: 'RETRYABLE', code: 'RATE_LIMIT' };
  if (status === 504) return { kind: 'RETRYABLE', code: 'PROVIDER_504' };
  if (status >= 500) return { kind: 'RETRYABLE', code: 'PROVIDER_500' };
  return { kind: 'TERMINAL', code: 'INVALID_RESPONSE' };
}

export class RentCastClient {
  private readonly fetchImpl: RentCastFetchLike;
  private readonly readApiKey: () => string | undefined;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private readonly now: () => Date;

  constructor(options: RentCastClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultFetch;
    this.readApiKey = apiKeyReader(options.apiKey);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_RENTCAST_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? DEFAULT_RENTCAST_MAX_RESPONSE_BYTES;
    this.now = options.now ?? (() => new Date());
  }

  async fetchPropertyRecords(
    address: PropertyAddressIdentity,
  ): Promise<RentCastFetchOutcome> {
    const key = this.readApiKey()?.trim();
    if (!key) return { kind: 'NOT_CONFIGURED' };
    if (!validRequestAddress(address)) {
      return { kind: 'TERMINAL', code: 'INVALID_REQUEST' };
    }

    const url = new URL(RENTCAST_PROPERTIES_URL);
    url.searchParams.set('address', buildRentCastRequestAddress(address));
    url.searchParams.set('suppressLogging', 'true');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      let response: ResponseLike;
      try {
        response = await this.fetchImpl(url.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json', 'X-Api-Key': key },
          signal: controller.signal,
          redirect: 'error',
        });
      } catch {
        return controller.signal.aborted
          ? { kind: 'RETRYABLE', code: 'TIMEOUT' }
          : { kind: 'RETRYABLE', code: 'NETWORK' };
      }

      const completedAt = this.now();
      if (response.status === 404) {
        return { kind: 'NO_RESULT', requestCompletedAt: completedAt };
      }
      if (!response.ok) return classifyHttpFailure(response.status);

      try {
        const text = await boundedResponseText(response, this.maxResponseBytes);
        if (text === null) return { kind: 'TERMINAL', code: 'INVALID_RESPONSE' };
        const parsed = responseSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return { kind: 'TERMINAL', code: 'INVALID_RESPONSE' };
        const records = parsed.data as RentCastPropertyRecord[];
        if (records.length === 0) {
          return { kind: 'NO_RESULT', requestCompletedAt: completedAt };
        }
        return { kind: 'SUCCESS', records, requestCompletedAt: completedAt };
      } catch {
        return controller.signal.aborted
          ? { kind: 'RETRYABLE', code: 'TIMEOUT' }
          : { kind: 'TERMINAL', code: 'INVALID_RESPONSE' };
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
