// Objects written to storage for a database change that then failed (owner ruling D-P4). Object storage cannot join a database transaction, so a caller
// that uploads first and commits second must be able to undo the upload. Dependency-injected on purpose: the backend and the purge worker each pass their
// own database client and delete function, and neither imports the other's storage client.
export interface OrphanedObjectDb {
  orphanedStorageObject: {
    upsert(args: unknown): Promise<unknown>;
    findMany(args: unknown): Promise<Array<{ id: string; storageKey: string; attempts: number }>>;
    update(args: unknown): Promise<unknown>;
  };
}

/** Deletes a staged object now; if that fails the key is recorded for retry. Never throws: the caller is already handling the failure that orphaned it. */
export async function discardStagedObject(
  db: OrphanedObjectDb,
  deleteObject: (storageKey: string) => Promise<void>,
  storageKey: string,
  reason: string,
  now = new Date(),
): Promise<'DELETED' | 'RECORDED_FOR_RETRY' | 'UNRECORDED'> {
  try {
    await deleteObject(storageKey);
    return 'DELETED';
  } catch (deleteError) {
    const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
    try {
      await db.orphanedStorageObject.upsert({
        where: { storageKey },
        create: { storageKey, reason, attempts: 1, lastError: message.slice(0, 500), lastAttemptAt: now },
        update: { attempts: { increment: 1 }, lastError: message.slice(0, 500), lastAttemptAt: now },
      });
      return 'RECORDED_FOR_RETRY';
    } catch (recordError) {
      // Nothing more can be done from here; the key is in the log so it can be removed by hand.
      console.error('[orphaned-object] could not delete or record a staged object', { storageKey, reason, message });
      return 'UNRECORDED';
    }
  }
}

/** One retry pass over recorded orphans. Safe to run repeatedly; an object that is already gone counts as resolved by the delete function. */
export async function retryOrphanedObjectCleanup(
  db: OrphanedObjectDb,
  deleteObject: (storageKey: string) => Promise<void>,
  options: { limit?: number; now?: Date } = {},
): Promise<{ attempted: number; resolved: number }> {
  const now = options.now ?? new Date();
  const pending = await db.orphanedStorageObject.findMany({
    where: { resolvedAt: null }, orderBy: { createdAt: 'asc' }, take: options.limit ?? 20, select: { id: true, storageKey: true, attempts: true },
  });
  let resolved = 0;
  for (const row of pending) {
    try {
      await deleteObject(row.storageKey);
      await db.orphanedStorageObject.update({ where: { id: row.id }, data: { resolvedAt: now, attempts: row.attempts + 1, lastAttemptAt: now, lastError: null } });
      resolved += 1;
    } catch (error) {
      await db.orphanedStorageObject.update({
        where: { id: row.id },
        data: { attempts: row.attempts + 1, lastAttemptAt: now, lastError: (error instanceof Error ? error.message : String(error)).slice(0, 500) },
      }).catch(() => undefined);
    }
  }
  return { attempted: pending.length, resolved };
}
