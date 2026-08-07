import { prisma } from '../../lib/prisma';
import { IncidentEventType, IncidentStatus } from '@prisma/client';
import { logIncidentEvent } from './incident.events';

// WEATHER_PREPARATION incidents (weatherPreparation.service.ts's
// startWeatherPreparation) are created from a forecast-anchored, date-scoped
// EnvironmentInsight and only ever reach ACTIONED or MITIGATED — nothing
// ever revisits them once the weather window passes, so they sit under the
// Incidents page's "Active" filter forever, even fully mitigated ones.
// Resolving them (not deleting or silently hiding them) mirrors the
// existing auto-resolve precedent in incident.service.ts's upsertIncident:
// same RESOLVED status, same autoResolved-tagged IncidentEvent — the
// weather is no longer happening, so this is a real resolution, not a
// disappearance.
const RESOLVE_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

function detailsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export interface ExpireStaleWeatherPreparationsResult {
  examined: number;
  resolved: number;
}

export async function expireStaleWeatherPreparations(
  opts: { propertyId?: string; dryRun?: boolean } = {},
): Promise<ExpireStaleWeatherPreparationsResult> {
  const cutoff = Date.now() - RESOLVE_GRACE_PERIOD_MS;

  const incidents = await prisma.incident.findMany({
    where: {
      typeKey: 'WEATHER_PREPARATION',
      status: { in: [IncidentStatus.ACTIONED, IncidentStatus.MITIGATED] },
      ...(opts.propertyId ? { propertyId: opts.propertyId } : {}),
    },
    select: { id: true, propertyId: true, userId: true, details: true },
  });

  const stale = incidents.filter((incident) => {
    const effectiveTo = detailsOf(incident.details).effectiveTo;
    if (!effectiveTo) return false;
    const parsed = Date.parse(String(effectiveTo));
    return !Number.isNaN(parsed) && parsed < cutoff;
  });

  if (opts.dryRun) {
    return { examined: stale.length, resolved: 0 };
  }

  const now = new Date();
  let resolved = 0;
  for (const incident of stale) {
    await prisma.incident.update({
      where: { id: incident.id },
      data: { status: IncidentStatus.RESOLVED, resolvedAt: now },
    });
    await logIncidentEvent({
      incidentId: incident.id,
      propertyId: incident.propertyId,
      userId: incident.userId,
      type: IncidentEventType.RESOLVED,
      message: 'Auto-resolved: the weather preparation window has passed.',
      payload: { autoResolved: true, reason: 'weather_window_passed' },
    });
    resolved += 1;
  }

  return { examined: stale.length, resolved };
}
