import type { Prisma } from '@prisma/client';

export const ASK_SESSION_HISTORY_PAGE_SIZE = 20;

export interface AskSessionHistoryCursor {
  lastActiveAt: Date;
  id: string;
}

export function encodeAskSessionHistoryCursor(cursor: AskSessionHistoryCursor): string {
  return Buffer.from(JSON.stringify({ lastActiveAt: cursor.lastActiveAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeAskSessionHistoryCursor(value: string): AskSessionHistoryCursor | null {
  if (!value || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) return null;
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id || record.id.length > 160 || typeof record.lastActiveAt !== 'string') return null;
    const lastActiveAt = new Date(record.lastActiveAt);
    if (Number.isNaN(lastActiveAt.getTime()) || lastActiveAt.toISOString() !== record.lastActiveAt) return null;
    return { lastActiveAt, id: record.id };
  } catch {
    return null;
  }
}

export function askSessionHistoryWhere(input: {
  userId: string;
  propertyId: string;
  now: Date;
  retentionDays: number;
  cursor: AskSessionHistoryCursor | null;
  titleQuery?: string;
}): Prisma.AskSessionWhereInput {
  const retentionWindowMs = input.retentionDays * 24 * 60 * 60 * 1000;
  return {
    userId: input.userId,
    propertyId: input.propertyId,
    lastActiveAt: { gte: new Date(input.now.getTime() - retentionWindowMs) },
    OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }],
    executions: { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: input.now } }] } },
    ...(input.titleQuery ? { title: { contains: input.titleQuery, mode: 'insensitive' } } : {}),
    ...(input.cursor ? { AND: [{ OR: [
      { lastActiveAt: { lt: input.cursor.lastActiveAt } },
      { lastActiveAt: input.cursor.lastActiveAt, id: { lt: input.cursor.id } },
    ] }] } : {}),
  };
}
