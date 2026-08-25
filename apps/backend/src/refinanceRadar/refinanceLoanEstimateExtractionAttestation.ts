import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { ExtractionEnvelope } from '../services/intelligence/extractionEnvelope.contract';

const ATTESTATION_TTL_MS = 24 * 60 * 60 * 1000;

type AttestationPayload = {
  propertyId: string;
  envelopeHash: string;
  issuedAt: string;
  expiresAt: string;
};

function secret(): string {
  const value = process.env.LOAN_ESTIMATE_ATTESTATION_SECRET ?? process.env.JWT_SECRET;
  if (!value) throw new Error('LOAN_ESTIMATE_ATTESTATION_SECRET or JWT_SECRET is required');
  return value;
}

function envelopeHash(envelope: ExtractionEnvelope): string {
  return createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
}

export function createLoanEstimateExtractionAttestation(
  propertyId: string,
  envelope: ExtractionEnvelope,
  now = new Date(),
): string {
  const payload: AttestationPayload = {
    propertyId,
    envelopeHash: envelopeHash(envelope),
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ATTESTATION_TTL_MS).toISOString(),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

export function verifyLoanEstimateExtractionAttestation(
  propertyId: string,
  envelope: ExtractionEnvelope,
  token: string,
  now = new Date(),
): void {
  const [encoded, suppliedSignature, extra] = token.split('.');
  if (!encoded || !suppliedSignature || extra) throw new Error('Invalid Loan Estimate extraction attestation');
  const expectedSignature = createHmac('sha256', secret()).update(encoded).digest('base64url');
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid Loan Estimate extraction attestation');
  }
  const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as AttestationPayload;
  if (payload.propertyId !== propertyId || payload.envelopeHash !== envelopeHash(envelope)) {
    throw new Error('Loan Estimate extraction attestation does not match this property or envelope');
  }
  const expiry = new Date(payload.expiresAt).getTime();
  if (!Number.isFinite(expiry) || expiry < now.getTime()) throw new Error('Loan Estimate extraction attestation expired');
}
