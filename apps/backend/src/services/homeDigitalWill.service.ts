import {
  HomeDigitalWill,
  HomeDigitalWillSection,
  HomeDigitalWillEntry,
  HomeDigitalWillTrustedContact,
  HomeDigitalWillAccessLevel,
  HomeDigitalWillSectionType,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { APIError } from '../middleware/error.middleware';
import {
  CreateDigitalWillBody,
  UpdateDigitalWillBody,
  CreateSectionBody,
  UpdateSectionBody,
  ReorderBody,
  CreateEntryBody,
  UpdateEntryBody,
  CreateTrustedContactBody,
  UpdateTrustedContactBody,
} from '../validators/homeDigitalWill.validators';

// ─── Response DTOs ────────────────────────────────────────────────────────────

export type EntryDTO = Pick<
  HomeDigitalWillEntry,
  | 'id'
  | 'sectionId'
  | 'entryType'
  | 'title'
  | 'content'
  | 'summary'
  | 'priority'
  | 'sortOrder'
  | 'isPinned'
  | 'isEmergency'
  | 'effectiveFrom'
  | 'effectiveTo'
  | 'createdAt'
  | 'updatedAt'
>;

export type SectionDTO = Pick<
  HomeDigitalWillSection,
  'id' | 'digitalWillId' | 'type' | 'title' | 'description' | 'sortOrder' | 'isEnabled' | 'createdAt' | 'updatedAt'
> & { entries: EntryDTO[] };

export type TrustedContactDTO = Pick<
  HomeDigitalWillTrustedContact,
  'id' | 'digitalWillId' | 'name' | 'email' | 'phone' | 'relationship' | 'role' | 'accessLevel' | 'isPrimary' | 'notes' | 'createdAt' | 'updatedAt'
>;

export type DigitalWillCounts = {
  sectionCount: number;
  entryCount: number;
  trustedContactCount: number;
  hasEmergencyEntries: boolean;
};

export type DigitalWillDTO = Pick<
  HomeDigitalWill,
  | 'id'
  | 'propertyId'
  | 'title'
  | 'status'
  | 'readiness'
  | 'completionPercent'
  | 'setupCompletedAt'
  | 'lastReviewedAt'
  | 'publishedAt'
  | 'createdAt'
  | 'updatedAt'
> & {
  sections: SectionDTO[];
  trustedContacts: TrustedContactDTO[];
  counts: DigitalWillCounts;
};

// ─── Default section definitions ─────────────────────────────────────────────

const DEFAULT_SECTIONS: Array<{ type: HomeDigitalWillSectionType; title: string; sortOrder: number }> = [
  { type: 'EMERGENCY', title: 'Emergency Instructions', sortOrder: 0 },
  { type: 'CRITICAL_INFO', title: 'Critical Information', sortOrder: 1 },
  { type: 'CONTRACTORS', title: 'Preferred Contractors', sortOrder: 2 },
  { type: 'MAINTENANCE_KNOWLEDGE', title: 'Maintenance Knowledge', sortOrder: 3 },
  { type: 'UTILITIES', title: 'Utilities', sortOrder: 4 },
  { type: 'INSURANCE', title: 'Insurance Notes', sortOrder: 5 },
  { type: 'HOUSE_RULES', title: 'House Rules', sortOrder: 6 },
  { type: 'GENERAL_NOTES', title: 'General Notes', sortOrder: 7 },
];

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapEntry(e: HomeDigitalWillEntry): EntryDTO {
  return {
    id: e.id,
    sectionId: e.sectionId,
    entryType: e.entryType,
    title: e.title,
    content: e.content,
    summary: e.summary,
    priority: e.priority,
    sortOrder: e.sortOrder,
    isPinned: e.isPinned,
    isEmergency: e.isEmergency,
    effectiveFrom: e.effectiveFrom,
    effectiveTo: e.effectiveTo,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function mapSection(s: HomeDigitalWillSection & { entries: HomeDigitalWillEntry[] }): SectionDTO {
  return {
    id: s.id,
    digitalWillId: s.digitalWillId,
    type: s.type,
    title: s.title,
    description: s.description,
    sortOrder: s.sortOrder,
    isEnabled: s.isEnabled,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    entries: s.entries.map(mapEntry),
  };
}

function mapTrustedContact(c: HomeDigitalWillTrustedContact): TrustedContactDTO {
  return {
    id: c.id,
    digitalWillId: c.digitalWillId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    relationship: c.relationship,
    role: c.role,
    accessLevel: c.accessLevel,
    isPrimary: c.isPrimary,
    notes: c.notes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function buildCounts(
  sections: Array<HomeDigitalWillSection & { entries: HomeDigitalWillEntry[] }>,
  contacts: HomeDigitalWillTrustedContact[],
): DigitalWillCounts {
  const entryCount = sections.reduce((sum, s) => sum + s.entries.length, 0);
  const hasEmergencyEntries = sections.some((s) => s.entries.some((e) => e.isEmergency));
  return {
    sectionCount: sections.length,
    entryCount,
    trustedContactCount: contacts.length,
    hasEmergencyEntries,
  };
}

export function scopeTrustedContactSections(
  sections: SectionDTO[],
  accessLevel: HomeDigitalWillAccessLevel,
  sectionType?: HomeDigitalWillSectionType,
): SectionDTO[] {
  let scoped = sections;

  if (accessLevel === 'EMERGENCY_ONLY') {
    if (sectionType && sectionType !== 'EMERGENCY') {
      throw new APIError('Trusted contact access restricted to emergency section', 403, 'FORBIDDEN');
    }
    scoped = scoped
      .filter((section) => section.type === 'EMERGENCY')
      .map((section) => ({
        ...section,
        entries: section.entries.filter((entry) => entry.isEmergency),
      }));
  }

  if (sectionType) {
    scoped = scoped.filter((section) => section.type === sectionType);
    if (scoped.length === 0) {
      throw new APIError('Section not available for this trusted contact', 404, 'NOT_FOUND');
    }
  }

  return scoped;
}

// ─── Entry ordering helper ────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function sortEntries(entries: HomeDigitalWillEntry[]): HomeDigitalWillEntry[] {
  return [...entries].sort((a, b) => {
    // pinned first
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    // then by priority (CRITICAL → LOW)
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    // then sortOrder ascending
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    // finally by createdAt ascending
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

// ─── Service class ────────────────────────────────────────────────────────────

export class HomeDigitalWillService {
  // ─── Authorization helpers ───────────────────────────────────────────────

  /** Resolve a digital will and assert the requesting user owns the property. */
  private async assertWillOwnership(willId: string, userId: string) {
    const will = await prisma.homeDigitalWill.findFirst({
      where: { id: willId },
      include: {
        property: {
          select: { homeownerProfile: { select: { userId: true } } },
        },
      },
    });
    if (!will || will.property.homeownerProfile.userId !== userId) {
      throw new APIError('Digital will not found', 404, 'NOT_FOUND');
    }
    return will;
  }

  /** Assert a section belongs to a will the user owns, returns the section. */
  private async assertSectionOwnership(sectionId: string, userId: string) {
    const section = await prisma.homeDigitalWillSection.findFirst({
      where: { id: sectionId },
      include: {
        digitalWill: {
          include: {
            property: {
              select: { homeownerProfile: { select: { userId: true } } },
            },
          },
        },
      },
    });
    if (!section || section.digitalWill.property.homeownerProfile.userId !== userId) {
      throw new APIError('Section not found', 404, 'NOT_FOUND');
    }
    return section;
  }

  /** Assert an entry belongs to a section in a will the user owns. */
  private async assertEntryOwnership(entryId: string, userId: string) {
    const entry = await prisma.homeDigitalWillEntry.findFirst({
      where: { id: entryId },
      include: {
        section: {
          include: {
            digitalWill: {
              include: {
                property: {
                  select: { homeownerProfile: { select: { userId: true } } },
                },
              },
            },
          },
        },
      },
    });
    if (!entry || entry.section.digitalWill.property.homeownerProfile.userId !== userId) {
      throw new APIError('Entry not found', 404, 'NOT_FOUND');
    }
    return entry;
  }

  /** Assert a trusted contact belongs to a will the user owns. */
  private async assertContactOwnership(contactId: string, userId: string) {
    const contact = await prisma.homeDigitalWillTrustedContact.findFirst({
      where: { id: contactId },
      include: {
        digitalWill: {
          include: {
            property: {
              select: { homeownerProfile: { select: { userId: true } } },
            },
          },
        },
      },
    });
    if (!contact || contact.digitalWill.property.homeownerProfile.userId !== userId) {
      throw new APIError('Trusted contact not found', 404, 'NOT_FOUND');
    }
    return contact;
  }

  // ─── Full will loader ────────────────────────────────────────────────────

  private async loadFullWill(id: string): Promise<DigitalWillDTO> {
    const will = await prisma.homeDigitalWill.findUnique({
      where: { id },
      include: {
        sections: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            entries: true,
          },
        },
        trustedContacts: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!will) throw new APIError('Digital will not found', 404, 'NOT_FOUND');

    const sectionsWithSortedEntries = will.sections.map((s) => ({
      ...s,
      entries: sortEntries(s.entries),
    }));

    return {
      id: will.id,
      propertyId: will.propertyId,
      title: will.title,
      status: will.status,
      readiness: will.readiness,
      completionPercent: will.completionPercent,
      setupCompletedAt: will.setupCompletedAt,
      lastReviewedAt: will.lastReviewedAt,
      publishedAt: will.publishedAt,
      createdAt: will.createdAt,
      updatedAt: will.updatedAt,
      sections: sectionsWithSortedEntries.map(mapSection),
      trustedContacts: will.trustedContacts.map(mapTrustedContact),
      counts: buildCounts(sectionsWithSortedEntries, will.trustedContacts),
    };
  }

  // ─── Digital Will ────────────────────────────────────────────────────────

  async getByProperty(propertyId: string): Promise<DigitalWillDTO | null> {
    const will = await prisma.homeDigitalWill.findUnique({ where: { propertyId } });
    if (!will) return null;
    return this.loadFullWill(will.id);
  }

  async getTrustedContactScopedView(
    willId: string,
    userId: string,
    contactId: string,
    sectionType?: HomeDigitalWillSectionType,
  ): Promise<DigitalWillDTO> {
    await this.assertWillOwnership(willId, userId);

    const contact = await prisma.homeDigitalWillTrustedContact.findFirst({
      where: {
        id: contactId,
        digitalWillId: willId,
      },
    });

    if (!contact) {
      throw new APIError('Trusted contact not found', 404, 'NOT_FOUND');
    }

    const full = await this.loadFullWill(willId);

    const sections = scopeTrustedContactSections(full.sections, contact.accessLevel, sectionType);

    return {
      ...full,
      sections,
      counts: {
        ...full.counts,
        sectionCount: sections.length,
        entryCount: sections.reduce((sum, section) => sum + section.entries.length, 0),
        hasEmergencyEntries: sections.some((section) => section.entries.some((entry) => entry.isEmergency)),
      },
    };
  }

  async getOrCreateByProperty(propertyId: string, body: CreateDigitalWillBody): Promise<DigitalWillDTO> {
    const existing = await prisma.homeDigitalWill.findUnique({ where: { propertyId } });
    if (existing) {
      return this.loadFullWill(existing.id);
    }

    const created = await prisma.homeDigitalWill.create({
      data: {
        propertyId,
        title: body.title ?? 'Home Digital Will',
      },
    });

    // Bootstrap default sections
    await prisma.homeDigitalWillSection.createMany({
      data: DEFAULT_SECTIONS.map((s) => ({ ...s, digitalWillId: created.id })),
    });

    return this.loadFullWill(created.id);
  }

  async updateWill(willId: string, userId: string, body: UpdateDigitalWillBody): Promise<DigitalWillDTO> {
    await this.assertWillOwnership(willId, userId);

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.status !== undefined) data.status = body.status;
    if (body.readiness !== undefined) data.readiness = body.readiness;
    if (body.completionPercent !== undefined) data.completionPercent = body.completionPercent;
    if (body.setupCompletedAt !== undefined) data.setupCompletedAt = body.setupCompletedAt ? new Date(body.setupCompletedAt) : null;
    if (body.lastReviewedAt !== undefined) data.lastReviewedAt = body.lastReviewedAt ? new Date(body.lastReviewedAt) : null;
    if (body.publishedAt !== undefined) data.publishedAt = body.publishedAt ? new Date(body.publishedAt) : null;

    await prisma.homeDigitalWill.update({ where: { id: willId }, data });
    return this.loadFullWill(willId);
  }

  // ─── Sections ────────────────────────────────────────────────────────────

  async listSections(willId: string, userId: string): Promise<SectionDTO[]> {
    await this.assertWillOwnership(willId, userId);

    const sections = await prisma.homeDigitalWillSection.findMany({
      where: { digitalWillId: willId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { entries: true },
    });

    return sections.map((s) => mapSection({ ...s, entries: sortEntries(s.entries) }));
  }

  async createSection(willId: string, userId: string, body: CreateSectionBody): Promise<SectionDTO> {
    await this.assertWillOwnership(willId, userId);

    // Enforce one section per type per will
    const existing = await prisma.homeDigitalWillSection.findUnique({
      where: { digitalWillId_type: { digitalWillId: willId, type: body.type } },
    });
    if (existing) {
      throw new APIError(
        `A section of type ${body.type} already exists for this digital will`,
        409,
        'DUPLICATE_SECTION_TYPE',
      );
    }

    const section = await prisma.homeDigitalWillSection.create({
      data: {
        digitalWillId: willId,
        type: body.type,
        title: body.title,
        description: body.description ?? null,
        sortOrder: body.sortOrder ?? 0,
        isEnabled: body.isEnabled ?? true,
      },
      include: { entries: true },
    });

    return mapSection(section);
  }

  async updateSection(sectionId: string, userId: string, body: UpdateSectionBody): Promise<SectionDTO> {
    await this.assertSectionOwnership(sectionId, userId);

    const data: Record<string, unknown> = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;

    const section = await prisma.homeDigitalWillSection.update({
      where: { id: sectionId },
      data,
      include: { entries: true },
    });

    return mapSection({ ...section, entries: sortEntries(section.entries) });
  }

  async deleteSection(sectionId: string, userId: string): Promise<void> {
    await this.assertSectionOwnership(sectionId, userId);
    await prisma.homeDigitalWillSection.delete({ where: { id: sectionId } });
  }

  async reorderSections(willId: string, userId: string, body: ReorderBody): Promise<SectionDTO[]> {
    await this.assertWillOwnership(willId, userId);

    const { orderedIds } = body;

    const sections = await prisma.homeDigitalWillSection.findMany({
      where: { digitalWillId: willId },
      select: { id: true },
    });
    const validIds = new Set(sections.map((s) => s.id));
    for (const id of orderedIds) {
      if (!validIds.has(id)) {
        throw new APIError(`Section id ${id} does not belong to this digital will`, 400, 'INVALID_REORDER');
      }
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.homeDigitalWillSection.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.listSections(willId, userId);
  }

  // ─── Entries ─────────────────────────────────────────────────────────────

  async listEntries(sectionId: string, userId: string): Promise<EntryDTO[]> {
    await this.assertSectionOwnership(sectionId, userId);

    const entries = await prisma.homeDigitalWillEntry.findMany({
      where: { sectionId },
    });

    return sortEntries(entries).map(mapEntry);
  }

  async createEntry(sectionId: string, userId: string, body: CreateEntryBody): Promise<EntryDTO> {
    await this.assertSectionOwnership(sectionId, userId);

    const entry = await prisma.homeDigitalWillEntry.create({
      data: {
        sectionId,
        entryType: body.entryType,
        title: body.title,
        content: body.content ?? null,
        summary: body.summary ?? null,
        priority: body.priority ?? 'MEDIUM',
        sortOrder: body.sortOrder ?? 0,
        isPinned: body.isPinned ?? false,
        isEmergency: body.isEmergency ?? false,
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
      },
    });

    return mapEntry(entry);
  }

  async updateEntry(entryId: string, userId: string, body: UpdateEntryBody): Promise<EntryDTO> {
    await this.assertEntryOwnership(entryId, userId);

    const data: Record<string, unknown> = {};
    if (body.entryType !== undefined) data.entryType = body.entryType;
    if (body.title !== undefined) data.title = body.title;
    if (body.content !== undefined) data.content = body.content;
    if (body.summary !== undefined) data.summary = body.summary;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.isPinned !== undefined) data.isPinned = body.isPinned;
    if (body.isEmergency !== undefined) data.isEmergency = body.isEmergency;
    if (body.effectiveFrom !== undefined) data.effectiveFrom = body.effectiveFrom ? new Date(body.effectiveFrom) : null;
    if (body.effectiveTo !== undefined) data.effectiveTo = body.effectiveTo ? new Date(body.effectiveTo) : null;

    const entry = await prisma.homeDigitalWillEntry.update({ where: { id: entryId }, data });
    return mapEntry(entry);
  }

  async deleteEntry(entryId: string, userId: string): Promise<void> {
    await this.assertEntryOwnership(entryId, userId);
    await prisma.homeDigitalWillEntry.delete({ where: { id: entryId } });
  }

  async reorderEntries(sectionId: string, userId: string, body: ReorderBody): Promise<EntryDTO[]> {
    await this.assertSectionOwnership(sectionId, userId);

    const { orderedIds } = body;

    const entries = await prisma.homeDigitalWillEntry.findMany({
      where: { sectionId },
      select: { id: true },
    });
    const validIds = new Set(entries.map((e) => e.id));
    for (const id of orderedIds) {
      if (!validIds.has(id)) {
        throw new APIError(`Entry id ${id} does not belong to this section`, 400, 'INVALID_REORDER');
      }
    }

    await prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.homeDigitalWillEntry.update({ where: { id }, data: { sortOrder: index } }),
      ),
    );

    return this.listEntries(sectionId, userId);
  }

  // ─── Trusted Contacts ────────────────────────────────────────────────────

  async listTrustedContacts(willId: string, userId: string): Promise<TrustedContactDTO[]> {
    await this.assertWillOwnership(willId, userId);

    const contacts = await prisma.homeDigitalWillTrustedContact.findMany({
      where: { digitalWillId: willId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return contacts.map(mapTrustedContact);
  }

  async createTrustedContact(
    willId: string,
    userId: string,
    body: CreateTrustedContactBody,
  ): Promise<TrustedContactDTO> {
    await this.assertWillOwnership(willId, userId);

    const isPrimary = body.isPrimary ?? false;

    const contact = await prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.homeDigitalWillTrustedContact.updateMany({
          where: { digitalWillId: willId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.homeDigitalWillTrustedContact.create({
        data: {
          digitalWillId: willId,
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          relationship: body.relationship ?? null,
          role: body.role,
          accessLevel: body.accessLevel,
          isPrimary,
          notes: body.notes ?? null,
        },
      });
    });

    return mapTrustedContact(contact);
  }

  async updateTrustedContact(
    contactId: string,
    userId: string,
    body: UpdateTrustedContactBody,
  ): Promise<TrustedContactDTO> {
    const existing = await this.assertContactOwnership(contactId, userId);

    const contact = await prisma.$transaction(async (tx) => {
      if (body.isPrimary === true) {
        await tx.homeDigitalWillTrustedContact.updateMany({
          where: { digitalWillId: existing.digitalWillId, isPrimary: true, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }

      const data: Record<string, unknown> = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.email !== undefined) data.email = body.email;
      if (body.phone !== undefined) data.phone = body.phone;
      if (body.relationship !== undefined) data.relationship = body.relationship;
      if (body.role !== undefined) data.role = body.role;
      if (body.accessLevel !== undefined) data.accessLevel = body.accessLevel;
      if (body.isPrimary !== undefined) data.isPrimary = body.isPrimary;
      if (body.notes !== undefined) data.notes = body.notes;

      return tx.homeDigitalWillTrustedContact.update({ where: { id: contactId }, data });
    });

    return mapTrustedContact(contact);
  }

  async deleteTrustedContact(contactId: string, userId: string): Promise<void> {
    await this.assertContactOwnership(contactId, userId);
    await prisma.homeDigitalWillTrustedContact.delete({ where: { id: contactId } });
  }
}
