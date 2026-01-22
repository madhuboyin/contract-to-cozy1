// apps/backend/src/services/roomInsights.service.ts
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import { RoomType } from '@prisma/client';
import { computeRoomHealthScore } from './roomHealthScore.service';


function centsToDollars(cents: number) {
  return cents / 100;
}

function keywordHas(name: string, words: string[]) {
  const t = (name || '').toLowerCase();
  return words.some((w) => t.includes(w));
}

export type RoomHealthBand = 'GOOD' | 'NEEDS_ATTENTION' | 'AT_RISK';

export type RoomHealthScoreDTO = {
  score: number; // 0..100
  band: RoomHealthBand;
  label: string; // "Good" | "Needs attention" | "At risk"
  badges: string[]; // for small UI chips if you want (e.g., ["Coverage gaps", "Missing appliances"])
  improvements: Array<{ title: string; detail?: string }>; // "how to improve"
  factors: {
    itemCount: number;
    docsLinkedCount: number;
    coverageGapsCount: number;
    missingAppliancesCount: number;
    comfortScoreHint: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  };
};

export type RoomInsightsDTO = {
  room: {
    id: string;
    name: string;
    type: RoomType | 'OTHER';
    profile: any | null;
  };
  stats: {
    itemCount: number;
    replacementTotalCents: number;
    coverageGapsCount: number;
    appliancesCount: number;
    docsLinkedCount: number;
  };
  kitchen?: {
    missingAppliances: string[];
    quickWins: { title: string; detail: string }[];
  };
  livingRoom?: {
    comfortScoreHint: 'LOW' | 'MEDIUM' | 'HIGH';
    quickWins: { title: string; detail: string }[];
  };
  healthScore: RoomHealthScoreDTO;
};

export class RoomInsightsService {
  async getRoomInsights(propertyId: string, roomId: string): Promise<RoomInsightsDTO> {
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      include: {
        items: {
          include: {
            documents: true,
          },
        },
      },
    });

    if (!room) throw new APIError('Room not found', 404);

    const items = room.items || [];

    const replacementTotalCents = items.reduce((sum, it) => sum + (it.replacementCostCents || 0), 0);

    const coverageGapsCount = items.filter((it) => !it.warrantyId || !it.insurancePolicyId).length;

    const appliancesCount = items.filter((it) => it.category === 'APPLIANCE').length;

    const docsLinkedCount = items.reduce((sum, it) => sum + (it.documents?.length || 0), 0);

    const base: RoomInsightsDTO = {
      room: {
        id: room.id,
        name: room.name,
        type: (room.type as any) || 'OTHER',
        profile: (room.profile as any) ?? null,
      },
      stats: {
        itemCount: items.length,
        replacementTotalCents,
        coverageGapsCount,
        appliancesCount,
        docsLinkedCount,
      },
      healthScore: {
        score: 0,
        band: 'AT_RISK',
        label: 'At risk',
        badges: [],
        improvements: [],
        factors: {
          itemCount: items.length,
          docsLinkedCount,
          coverageGapsCount,
          missingAppliancesCount: 0,
          comfortScoreHint: 'UNKNOWN',
        },
      },
    };

    const type = (room.type as any) || 'OTHER';

    // ✅ Kitchen “presence” check is intentionally lightweight
    if (type === 'KITCHEN') {
      const hasFridge = items.some((it) => keywordHas(it.name, ['fridge', 'refrigerator']));
      const hasRange = items.some((it) => keywordHas(it.name, ['range', 'oven', 'stove']));
      const hasDishwasher = items.some((it) => keywordHas(it.name, ['dishwasher']));
      const hasMicrowave = items.some((it) => keywordHas(it.name, ['microwave']));

      const missingAppliances: string[] = [];
      if (!hasFridge) missingAppliances.push('Refrigerator');
      if (!hasRange) missingAppliances.push('Range/Oven');
      if (!hasDishwasher) missingAppliances.push('Dishwasher');
      if (!hasMicrowave) missingAppliances.push('Microwave');

      const quickWins = [
        {
          title: 'Add manuals & receipts',
          detail: docsLinkedCount === 0 ? 'Link at least one document to unlock better replacement + recall tracking.' : 'Nice—keep adding receipts for better coverage proof.',
        },
        {
          title: 'Close coverage gaps',
          detail:
            coverageGapsCount > 0
              ? `${coverageGapsCount} items are missing warranty or insurance mapping.`
              : 'No obvious coverage gaps found for items in this room.',
        },
      ];

      base.kitchen = { missingAppliances, quickWins };
    }

    // ✅ Living room: “comfort hint” is a tiny heuristic (not “AI heavy”)
    if (type === 'LIVING' || type === 'LIVING_ROOM') {
      const hasSofa = items.some((it) => keywordHas(it.name, ['sofa', 'couch', 'sectional']));
      const hasTV = items.some((it) => keywordHas(it.name, ['tv', 'television']));
      const hasLamp = items.some((it) => keywordHas(it.name, ['lamp', 'light']));

      const score =
        (hasSofa ? 1 : 0) + (hasTV ? 1 : 0) + (hasLamp ? 1 : 0);

      const comfortScoreHint: 'LOW' | 'MEDIUM' | 'HIGH' =
        score >= 3 ? 'HIGH' : score === 2 ? 'MEDIUM' : 'LOW';

      const quickWins = [
        {
          title: 'Track high-value items',
          detail: replacementTotalCents > 0 ? `You’ve captured ~$${centsToDollars(replacementTotalCents)} replacement value.` : 'Add replacement values to get a room value snapshot.',
        },
        {
          title: 'Simplify claims later',
          detail: docsLinkedCount > 0 ? 'Great—documents linked help a ton in claims.' : 'Attach receipts/photos for big-ticket items (TV, sofa).',
        },
      ];

      base.livingRoom = { comfortScoreHint, quickWins };
    }

    base.healthScore = computeRoomHealthScore({
      stats: {
        itemCount: base.stats.itemCount,
        docsLinkedCount: base.stats.docsLinkedCount,
        coverageGapsCount: base.stats.coverageGapsCount,
      },
      kitchen: base.kitchen ? { missingAppliances: base.kitchen.missingAppliances } : undefined,
      livingRoom: base.livingRoom ? { comfortScoreHint: base.livingRoom.comfortScoreHint } : undefined,
    });
    
    return base;
  }

  async updateRoomMeta(propertyId: string, roomId: string, input: { type?: RoomType | null; profile?: any | null; heroImage?: string | null }) {
    const existing = await prisma.inventoryRoom.findFirst({ where: { id: roomId, propertyId } });
    if (!existing) throw new APIError('Room not found', 404);

    return prisma.inventoryRoom.update({
      where: { id: roomId },
      data: {
        type: input.type ?? undefined,
        profile: input.profile ?? undefined,
        heroImage: input.heroImage ?? undefined,
      },
    });
  }

  async updateRoomProfile(propertyId: string, roomId: string, profile: any) {
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true },
    });
  
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');
  
    return prisma.inventoryRoom.update({
      where: { id: roomId },
      data: { profile },
    });
  }
  
  
  
  async addRoomChecklistItem(roomId: string, label: string, order?: number) {
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId },
      select: { propertyId: true },
    });
    if (!room) throw new APIError('Room not found', 404);

    return prisma.roomChecklistItem.create({
      data: {
        propertyId: room.propertyId,
        roomId,
        title: label,
        sortOrder: order ?? 0,
        status: 'OPEN',
      },
    });
  }
  
  async toggleRoomChecklistItem(id: string, isDone: boolean) {
    return prisma.roomChecklistItem.update({
      where: { id },
      data: {
        status: isDone ? 'DONE' : 'OPEN',
        ...(isDone && { lastCompletedAt: new Date() }),
      },
    });
  }
  
  async getRoomMaintenanceTimeline(roomId: string) {
    const incidents = await prisma.incident.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      include: { events: true, actions: true },
    });
  
    const tasks = await prisma.propertyMaintenanceTask.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    });
  
    return { incidents, tasks };
  }

  // ---------------- Room Checklist ----------------

  async listRoomChecklistItems(propertyId: string, roomId: string) {
    return prisma.roomChecklistItem.findMany({
      where: { propertyId, roomId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createRoomChecklistItem(propertyId: string, roomId: string, input: any) {
    // ensure room exists + belongs to property
    const room = await prisma.inventoryRoom.findFirst({
      where: { id: roomId, propertyId },
      select: { id: true },
    });
    if (!room) throw new APIError('Room not found', 404, 'ROOM_NOT_FOUND');

    return prisma.roomChecklistItem.create({
      data: {
        propertyId,
        roomId,
        title: String(input.title).trim(),
        notes: input.notes ?? null,
        key: input.key ?? null,
        frequency: input.frequency ?? 'ONCE',
        sortOrder: input.sortOrder ?? 0,
        nextDueDate: input.nextDueDate ? new Date(input.nextDueDate) : null,
        status: 'OPEN',
      },
    });
  }

  async updateRoomChecklistItem(propertyId: string, roomId: string, itemId: string, patch: any) {
    const existing = await prisma.roomChecklistItem.findFirst({
      where: { id: itemId, propertyId, roomId },
      select: { id: true, status: true },
    });
    if (!existing) throw new APIError('Checklist item not found', 404, 'CHECKLIST_ITEM_NOT_FOUND');
  
    const data: any = {};
  
    // Whitelisted fields only
    if (typeof patch.title === 'string') data.title = patch.title.trim();
    if (typeof patch.notes === 'string' || patch.notes === null) data.notes = patch.notes;
    if (typeof patch.key === 'string' || patch.key === null) data.key = patch.key;
    if (typeof patch.frequency === 'string') data.frequency = patch.frequency;
    if (typeof patch.sortOrder === 'number') data.sortOrder = patch.sortOrder;
  
    if (typeof patch.status === 'string') {
      data.status = patch.status;
      if (patch.status === 'DONE' && existing.status !== 'DONE') {
        data.lastCompletedAt = new Date();
      }
    }
  
    if (patch?.nextDueDate !== undefined) {
      data.nextDueDate = patch.nextDueDate ? new Date(patch.nextDueDate) : null;
    }
  
    return prisma.roomChecklistItem.update({
      where: { id: itemId },
      data,
    });
  }  

  async deleteRoomChecklistItem(propertyId: string, roomId: string, itemId: string) {
    const existing = await prisma.roomChecklistItem.findFirst({
      where: { id: itemId, propertyId, roomId },
      select: { id: true },
    });
    if (!existing) throw new APIError('Checklist item not found', 404, 'CHECKLIST_ITEM_NOT_FOUND');

    await prisma.roomChecklistItem.delete({ where: { id: itemId } });
  }

  // ---------------- Room Timeline (Tasks + Incidents) ----------------

  async getRoomTimeline(propertyId: string, roomId: string) {
    // assumes Incident.roomId and PropertyMaintenanceTask.roomId exist
    const [tasks, incidents] = await Promise.all([
      prisma.propertyMaintenanceTask.findMany({
        where: { propertyId, roomId },
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      }),
      prisma.incident.findMany({
        where: { propertyId, roomId },
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      }),
    ]);

    const taskEvents = tasks.map((t: any) => ({
      type: 'TASK',
      id: t.id,
      title: t.title,
      status: t.status,
      at: t.updatedAt || t.createdAt,
      meta: {
        priority: t.priority,
        source: t.source,
        beforeAfter: t.status === 'COMPLETED' ? 'AFTER' : 'BEFORE',
      },
    }));

    const incidentEvents = incidents.map((i: any) => ({
      type: 'INCIDENT',
      id: i.id,
      title: i.title || i.type || 'Incident',
      status: i.status,
      at: i.updatedAt || i.createdAt,
      meta: {
        severity: i.severity,
        beforeAfter: i.status === 'RESOLVED' ? 'AFTER' : 'BEFORE',
      },
    }));

    const merged = [...taskEvents, ...incidentEvents].sort(
      (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()
    );

    return merged;
  }  

}
