import { IncidentActionStatus, IncidentActionType, IncidentSourceType, IncidentStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { syncIncidentWorkItem } from '../incidents/incidentWorkReconciliation.service';
import type { EnvironmentInsight } from './environmentInsights.service';

export type WeatherPreparationItemStatus = 'CREATED' | 'COMPLETED' | 'CANCELED';

export interface WeatherPreparationPlan {
  id: string;
  propertyId: string;
  insightId: string;
  title: string;
  summary: string;
  timeframe: string;
  effectiveFrom: string;
  effectiveTo: string;
  source: string;
  status: string;
  progress: { completed: number; skipped: number; resolved: number; total: number };
  items: Array<{ id: string; label: string; status: WeatherPreparationItemStatus; sortOrder: number }>;
}

const planInclude = {
  actions: {
    where: { type: IncidentActionType.CHECKLIST_ITEM },
    orderBy: { createdAt: 'asc' as const },
  },
};

function detailsOf(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function toPlan(incident: any): WeatherPreparationPlan {
  const details = detailsOf(incident.details);
  const items = incident.actions
    .map((action: any) => {
      const payload = detailsOf(action.payload);
      return {
        id: action.id,
        label: String(payload.label ?? action.ctaLabel ?? 'Preparation step'),
        status: action.status as WeatherPreparationItemStatus,
        sortOrder: Number(payload.sortOrder ?? 0),
      };
    })
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);
  const completed = items.filter((item: any) => item.status === 'COMPLETED').length;
  const skipped = items.filter((item: any) => item.status === 'CANCELED').length;
  return {
    id: incident.id,
    propertyId: incident.propertyId,
    insightId: String(details.insightId ?? ''),
    title: incident.title,
    summary: incident.summary ?? '',
    timeframe: String(details.timeframe ?? ''),
    effectiveFrom: String(details.effectiveFrom ?? ''),
    effectiveTo: String(details.effectiveTo ?? ''),
    source: String(details.source ?? ''),
    status: incident.status,
    progress: { completed, skipped, resolved: completed + skipped, total: items.length },
    items,
  };
}

export async function startWeatherPreparation(
  propertyId: string,
  userId: string,
  insight: EnvironmentInsight,
): Promise<WeatherPreparationPlan> {
  const fingerprint = `weather-preparation:${propertyId}:${insight.id}`;
  let incident = await prisma.incident.findFirst({
    where: { propertyId, fingerprint },
    include: planInclude,
  });

  if (!incident) {
    incident = await prisma.incident.create({
      data: {
        propertyId,
        userId,
        sourceType: IncidentSourceType.WEATHER,
        typeKey: 'WEATHER_PREPARATION',
        category: insight.category,
        title: `${insight.title} preparation`,
        summary: `A short, property-aware checklist for ${insight.timeframe}.`,
        status: IncidentStatus.ACTIONED,
        activatedAt: new Date(),
        confidence: 100,
        fingerprint,
        recurrenceKey: insight.id,
        details: {
          insightId: insight.id,
          timeframe: insight.timeframe,
          effectiveFrom: insight.effectiveFrom,
          effectiveTo: insight.effectiveTo,
          source: insight.source,
          insightSummary: insight.summary,
          homeImplication: insight.homeImplication,
          relatedIncidentId: insight.relatedIncident?.id ?? null,
        },
        actions: {
          create: insight.recommendedActions.map((label, sortOrder) => ({
            type: IncidentActionType.CHECKLIST_ITEM,
            status: IncidentActionStatus.CREATED,
            actionKey: `${fingerprint}:${sortOrder}`,
            ctaLabel: label,
            payload: { label, sortOrder, insightId: insight.id },
          })),
        },
      },
      include: planInclude,
    });
  }

  return toPlan(incident);
}

export async function getWeatherPreparation(propertyId: string, preparationId: string) {
  const incident = await prisma.incident.findFirst({
    where: { id: preparationId, propertyId, typeKey: 'WEATHER_PREPARATION' },
    include: planInclude,
  });
  return incident ? toPlan(incident) : null;
}

export async function getWeatherPreparationByInsight(propertyId: string, insightId: string) {
  const incident = await prisma.incident.findFirst({
    where: {
      propertyId,
      fingerprint: `weather-preparation:${propertyId}:${insightId}`,
      typeKey: 'WEATHER_PREPARATION',
    },
    include: planInclude,
  });
  return incident ? toPlan(incident) : null;
}

export async function updateWeatherPreparationItem(
  propertyId: string,
  preparationId: string,
  itemId: string,
  status: WeatherPreparationItemStatus,
) {
  const incident = await prisma.incident.findFirst({
    where: { id: preparationId, propertyId, typeKey: 'WEATHER_PREPARATION' },
    include: planInclude,
  });
  if (!incident || !incident.actions.some(action => action.id === itemId)) return null;

  await prisma.incidentAction.update({ where: { id: itemId }, data: { status } });
  const refreshed = await prisma.incident.findUniqueOrThrow({ where: { id: preparationId }, include: planInclude });
  const plan = toPlan(refreshed);
  const allResolved = plan.progress.total > 0 && plan.progress.resolved === plan.progress.total;
  if ((allResolved && refreshed.status !== IncidentStatus.MITIGATED) || (!allResolved && refreshed.status === IncidentStatus.MITIGATED)) {
    const updated = await prisma.incident.update({
      where: { id: preparationId },
      data: allResolved
        ? { status: IncidentStatus.MITIGATED, mitigatedAt: new Date() }
        : { status: IncidentStatus.ACTIONED, mitigatedAt: null },
      include: planInclude,
    });
    await syncIncidentWorkItem(preparationId);
    return toPlan(updated);
  }
  return plan;
}
