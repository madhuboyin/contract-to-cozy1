// apps/backend/src/services/incidentLogger.service.ts
//
// Centralized safety/privacy incident logger for Phase 4 runbook infrastructure.
// All methods are fire-and-forget — errors are swallowed and logged to logger.error only.
//
// Builds on the same prisma.incident model used by emergencyTroubleshooter.service.ts

import { prisma } from '../lib/prisma';
import { IncidentSeverity, IncidentSourceType, IncidentStatus } from '@prisma/client';
import { logger } from '../lib/logger';

// ============================================================================
// EVENT INTERFACES
// ============================================================================

export interface SafetyIncidentEvent {
  propertyId: string;
  userId?: string | null;
  toolKey: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  classification: string;
  summary: string;
  details?: Record<string, unknown>;
}

export interface PrivacyIncidentEvent {
  propertyId: string;
  userId?: string | null;
  resourceType: string;
  resourceId?: string | null;
  attemptedAction: string;
  details?: Record<string, unknown>;
}

export interface ToolErrorEvent {
  toolKey: string;
  errorCode: string;
  errorMessage: string;
  propertyId?: string | null;
  userId?: string | null;
  details?: Record<string, unknown>;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Maps a 4-tier severity string to the 3-value Prisma IncidentSeverity enum.
 * LOW/MEDIUM → WARNING, HIGH → CRITICAL (but status=EVALUATED), CRITICAL → CRITICAL
 */
function mapSeverity(severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): IncidentSeverity {
  switch (severity) {
    case 'LOW':
      return IncidentSeverity.INFO;
    case 'MEDIUM':
      return IncidentSeverity.WARNING;
    case 'HIGH':
    case 'CRITICAL':
      return IncidentSeverity.CRITICAL;
  }
}

/**
 * Determines incident status based on severity.
 * CRITICAL and HIGH are ACTIVE (require attention), others are EVALUATED.
 */
function statusFromSeverity(severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): IncidentStatus {
  if (severity === 'CRITICAL' || severity === 'HIGH') return IncidentStatus.ACTIVE;
  return IncidentStatus.EVALUATED;
}

/**
 * Detects likely 5xx error codes to escalate to WARNING severity.
 */
function is5xxError(errorCode: string): boolean {
  return /^5\d{2}$/.test(errorCode) || errorCode.startsWith('5');
}

// ============================================================================
// INCIDENT LOGGER OBJECT
// ============================================================================

export const incidentLogger = {
  /**
   * Log a safety incident (e.g., dangerous tool output, emergency classification).
   * Fire-and-forget — never throws.
   *
   * Fingerprint window: 1 hour (deduplicated by propertyId + toolKey + hour bucket).
   */
  logSafety(event: SafetyIncidentEvent): void {
    const hourBucket = (Date.now() / 3_600_000) | 0;
    const fingerprint = `safety:${event.propertyId}:${event.toolKey}:${hourBucket}`;

    prisma.incident
      .create({
        data: {
          propertyId: event.propertyId,
          userId: event.userId ?? null,
          sourceType: IncidentSourceType.SYSTEM,
          typeKey: `SAFETY_${event.toolKey.toUpperCase()}`,
          category: 'SAFETY',
          title: `Safety incident: ${event.classification}`.slice(0, 140),
          summary: event.summary.slice(0, 280),
          details: (event.details ?? {}) as any,
          severity: mapSeverity(event.severity),
          status: statusFromSeverity(event.severity),
          fingerprint,
        },
      })
      .catch((err: unknown) => {
        logger.error('[IncidentLogger] Failed to log safety incident:', err);
      });
  },

  /**
   * Log a privacy access attempt (e.g., cross-user resource access, unauthorized read).
   * Fire-and-forget — never throws.
   */
  logPrivacy(event: PrivacyIncidentEvent): void {
    const fingerprint = `privacy:${event.resourceType}:${event.resourceId ?? 'unknown'}:${event.userId ?? 'anon'}`;

    prisma.incident
      .create({
        data: {
          propertyId: event.propertyId,
          userId: event.userId ?? null,
          sourceType: IncidentSourceType.SYSTEM,
          typeKey: 'PRIVACY_ACCESS_ATTEMPT',
          category: 'PRIVACY',
          title: `Privacy: ${event.attemptedAction} on ${event.resourceType}`.slice(0, 140),
          summary: `Attempted action: ${event.attemptedAction} on ${event.resourceType} ${event.resourceId ?? ''}`.slice(0, 280),
          details: (event.details ?? {}) as any,
          severity: IncidentSeverity.WARNING,
          status: IncidentStatus.ACTIVE,
          fingerprint,
        },
      })
      .catch((err: unknown) => {
        logger.error('[IncidentLogger] Failed to log privacy incident:', err);
      });
  },

  /**
   * Log a tool error incident (e.g., unexpected exception, integration failure).
   * Fire-and-forget — never throws.
   *
   * Severity is INFO by default, escalated to WARNING for 5xx errors.
   */
  logToolError(event: ToolErrorEvent): void {
    const severity = is5xxError(event.errorCode) ? IncidentSeverity.WARNING : IncidentSeverity.INFO;
    const fingerprint = `tool_error:${event.toolKey}:${event.errorCode}:${(Date.now() / 3_600_000) | 0}`;

    prisma.incident
      .create({
        data: {
          propertyId: event.propertyId ?? '',
          userId: event.userId ?? null,
          sourceType: IncidentSourceType.SYSTEM,
          typeKey: `TOOL_ERROR_${event.toolKey.toUpperCase()}`,
          category: 'SYSTEM',
          title: `Tool error [${event.errorCode}]: ${event.toolKey}`.slice(0, 140),
          summary: event.errorMessage.slice(0, 280),
          details: (event.details ?? {}) as any,
          severity,
          status: IncidentStatus.EVALUATED,
          fingerprint,
        },
      })
      .catch((err: unknown) => {
        logger.error('[IncidentLogger] Failed to log tool error incident:', err);
      });
  },
};
