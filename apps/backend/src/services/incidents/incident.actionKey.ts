// backend/src/services/incidents/incident.actionKey.ts
import crypto from 'crypto';

export function buildIncidentActionKey(args: {
  propertyId: string;
  incidentType: string;
  actionType: string;
  // bucket lets you rate-limit per time window (e.g., day/week) without storing extra tables
  bucket: string;
}) {
  const raw = `${args.propertyId}:${args.incidentType}:${args.actionType}:${args.bucket}`;
  return crypto.createHash('sha1').update(raw).digest('hex');
}
