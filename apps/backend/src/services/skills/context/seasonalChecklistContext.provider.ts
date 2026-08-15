import { createHash } from 'node:crypto';
import { prisma } from '../../../lib/prisma';
import type { SkillContextProviderDefinition } from './skillContext.contract';
import { SEASONAL_CHECKLIST_CONTEXT_PROVIDER } from '../maintenance/skill.manifest';

export interface SeasonalChecklistContextItem {
  id: string;
  taskKey: string;
  title: string;
  description: string | null;
  priority: 'CRITICAL' | 'RECOMMENDED' | 'OPTIONAL';
  status: 'RECOMMENDED' | 'ADDED' | 'COMPLETED' | 'DISMISSED' | 'SNOOZED';
  recommendedDate: Date | null;
  snoozedUntil: Date | null;
  updatedAt: Date;
  maintenanceTask: { id: string; status: string } | null;
}

export interface SeasonalChecklistContextChecklist {
  id: string;
  season: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER';
  year: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';
  seasonStartDate: Date;
  seasonEndDate: Date;
  updatedAt: Date;
  items: SeasonalChecklistContextItem[];
}

export interface SeasonalChecklistContext {
  checklists: SeasonalChecklistContextChecklist[];
}

const MAX_ITEMS_PER_CHECKLIST = 25;

const seasonalChecklistContextProviderDefinition: SkillContextProviderDefinition<SeasonalChecklistContext> = {
  ...SEASONAL_CHECKLIST_CONTEXT_PROVIDER,
  canonicalOwner: 'SeasonalChecklistService',
  description: 'Recent seasonal checklists and their canonical item state, including linked Maintenance tasks.',
  minimumRole: 'VIEWER',
  sensitivity: 'STANDARD',
  defaultTimeoutMs: 2_000,
  maxSerializedBytes: 128_000,
  supportedOperations: ['MAINTENANCE_STATUS'],
  async load({ propertyId }) {
    const source = await prisma.seasonalChecklist.findMany({
      where: { propertyId },
      orderBy: [{ year: 'desc' }, { seasonStartDate: 'desc' }],
      take: 8,
      select: {
        id: true,
        season: true,
        year: true,
        status: true,
        seasonStartDate: true,
        seasonEndDate: true,
        updatedAt: true,
        items: {
          orderBy: [{ recommendedDate: 'asc' }, { title: 'asc' }],
          take: MAX_ITEMS_PER_CHECKLIST,
          select: {
            id: true,
            taskKey: true,
            title: true,
            description: true,
            priority: true,
            status: true,
            recommendedDate: true,
            snoozedUntil: true,
            updatedAt: true,
            maintenanceTask: { select: { id: true, status: true } },
          },
        },
      },
    });

    // Keep an independent bound per season instead of letting a generated
    // future checklist consume the entire budget and hide the active season.
    // Eight checklists cover the latest two complete seasonal years.
    const checklists: SeasonalChecklistContextChecklist[] = source.map((checklist) => {
      const items = checklist.items.map((item) => ({
        ...item,
        description: item.description?.slice(0, 400) ?? null,
      }));
      return { ...checklist, items };
    }).filter((checklist) => checklist.items.length > 0);
    const items = checklists.flatMap((checklist) => checklist.items);
    const sourceVersion = createHash('sha256').update(JSON.stringify(checklists.map((checklist) => ({
      id: checklist.id,
      status: checklist.status,
      updatedAt: checklist.updatedAt,
      items: checklist.items.map((item) => ({ id: item.id, status: item.status, maintenanceStatus: item.maintenanceTask?.status, updatedAt: item.updatedAt })),
    })))).digest('hex');
    const observedAt = [
      ...checklists.map((checklist) => checklist.updatedAt),
      ...items.map((item) => item.updatedAt),
    ].reduce<Date | null>((latest, value) => !latest || value > latest ? value : latest, null);

    return {
      status: 'AVAILABLE',
      data: { checklists },
      observedAt: observedAt?.toISOString() ?? null,
      sourceVersion,
      entityCount: checklists.length,
      factCount: items.length,
    };
  },
};

export const seasonalChecklistContextProvider = Object.freeze(seasonalChecklistContextProviderDefinition);
