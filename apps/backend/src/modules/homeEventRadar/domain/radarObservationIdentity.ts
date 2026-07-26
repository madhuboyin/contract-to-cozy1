import { createHash } from 'node:crypto';
import type { CanonicalRadarObservation } from '../contracts';

export function normalizeRadarJsonValue(value: unknown, seen = new Set<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Radar payload numbers must be finite');
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeRadarJsonValue(item, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) throw new TypeError('Radar payload must not contain circular references');
    seen.add(value);
    const normalized: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new TypeError(`Radar payload field "${key}" cannot be undefined`);
      normalized[key] = normalizeRadarJsonValue(item, seen);
    }
    seen.delete(value);
    return normalized;
  }
  throw new TypeError(`Radar payload contains unsupported ${typeof value} value`);
}

export function stableRadarJson(value: unknown): string {
  return JSON.stringify(normalizeRadarJsonValue(value));
}

export function radarValueFingerprint(value: unknown): string {
  return createHash('sha256').update(stableRadarJson(value)).digest('hex');
}

export function radarObservationFingerprint(observation: CanonicalRadarObservation): string {
  return radarValueFingerprint(observation);
}

export function radarRevisionIdentity(
  observation: CanonicalRadarObservation,
  payloadFingerprint = radarObservationFingerprint(observation),
): string {
  return observation.providerRevision
    ? `provider:${observation.providerRevision}`
    : `fingerprint:${payloadFingerprint}`;
}

export function radarMatchJobId(
  sourceDefinitionId: string,
  providerEventId: string,
  revisionIdentity: string,
): string {
  return `radar-match-${createHash('sha256')
    .update(`${sourceDefinitionId}\n${providerEventId}\n${revisionIdentity}`)
    .digest('hex')}`;
}
