// apps/frontend/src/lib/storage/db.ts

import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface C2CDB extends DBSchema {
  'maintenance-tasks': {
    key: string;
    value: {
      id: string;
      title: string;
      description: string;
      completed: boolean;
      dueDate: string;
      propertyId: string;
      syncStatus: 'synced' | 'pending' | 'failed';
      updatedAt: string;
      localOnly?: boolean;
    };
    indexes: { 'by-property': string; 'by-sync-status': string };
  };
  'offline-queue': {
    key: number;
    value: {
      url: string;
      method: string;
      body: any;
      headers?: Record<string, string>;
      timestamp: number;
      retryCount: number;
    };
  };
  'cached-properties': {
    key: string;
    value: {
      id: string;
      address: string;
      data: any;
      cachedAt: string;
    };
  };
}

let dbInstance: IDBPDatabase<C2CDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<C2CDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<C2CDB>('c2c-offline', 3, {
    upgrade(db) {
      // Maintenance tasks store
      if (!db.objectStoreNames.contains('maintenance-tasks')) {
        const taskStore = db.createObjectStore('maintenance-tasks', { keyPath: 'id' });
        taskStore.createIndex('by-property', 'propertyId');
        taskStore.createIndex('by-sync-status', 'syncStatus');
      }

      // Offline request queue
      if (!db.objectStoreNames.contains('offline-queue')) {
        db.createObjectStore('offline-queue', { autoIncrement: true });
      }

      // Cached properties
      if (!db.objectStoreNames.contains('cached-properties')) {
        db.createObjectStore('cached-properties', { keyPath: 'id' });
      }

      // v1.0 hardening: do not persist raw user documents in IndexedDB.
      // If an older client created the store, delete it during upgrade.
      if ((db.objectStoreNames as DOMStringList).contains('documents')) {
        (db as unknown as IDBDatabase).deleteObjectStore('documents');
      }
    },
  });

  return dbInstance;
}

// ========== MAINTENANCE TASKS ==========

export async function saveTasks(tasks: any[]) {
  const db = await getDB();
  const tx = db.transaction('maintenance-tasks', 'readwrite');
  
  await Promise.all(
    tasks.map((task) =>
      tx.store.put({
        ...task,
        syncStatus: 'synced',
        updatedAt: new Date().toISOString(),
      })
    )
  );
  
  await tx.done;
}

export async function getTasks(propertyId?: string) {
  const db = await getDB();
  
  if (propertyId) {
    return db.getAllFromIndex('maintenance-tasks', 'by-property', propertyId);
  }
  
  return db.getAll('maintenance-tasks');
}

export async function updateTask(taskId: string, updates: Partial<any>) {
  const db = await getDB();
  const task = await db.get('maintenance-tasks', taskId);
  
  if (!task) throw new Error('Task not found');
  
  await db.put('maintenance-tasks', {
    ...task,
    ...updates,
    syncStatus: 'pending',
    updatedAt: new Date().toISOString(),
  });
}

export async function getPendingTasks() {
  const db = await getDB();
  return db.getAllFromIndex('maintenance-tasks', 'by-sync-status', 'pending');
}

// ========== OFFLINE QUEUE ==========

export async function queueOfflineRequest(
  url: string,
  method: string,
  body: any,
  headers?: Record<string, string>
) {
  const db = await getDB();

  // Strip Authorization header before persisting to IndexedDB.
  // Tokens must never be written to IndexedDB: it is not encrypted and is
  // accessible to any script running in this origin. A fresh token is attached
  // by the sync worker when the queued request is replayed online.
  const { Authorization, authorization, ...safeHeaders } = headers ?? {};

  await db.add('offline-queue', {
    url,
    method,
    body,
    headers: safeHeaders,
    timestamp: Date.now(),
    retryCount: 0,
  });
}

export async function getOfflineQueue() {
  const db = await getDB();
  return db.getAll('offline-queue');
}

export async function removeFromQueue(key: number) {
  const db = await getDB();
  await db.delete('offline-queue', key);
}

export async function incrementRetryCount(key: number) {
  const db = await getDB();
  const item = await db.get('offline-queue', key);
  
  if (item) {
    item.retryCount += 1;
    await db.put('offline-queue', item, key);
  }
}

// ========== CACHED PROPERTIES ==========

export async function cacheProperty(property: any) {
  const db = await getDB();
  await db.put('cached-properties', {
    ...property,
    cachedAt: new Date().toISOString(),
  });
}

export async function getCachedProperty(propertyId: string) {
  const db = await getDB();
  return db.get('cached-properties', propertyId);
}

export async function getCachedProperties() {
  const db = await getDB();
  return db.getAll('cached-properties');
}

// ========== DOCUMENTS ==========
// Raw document persistence is intentionally disabled for v1.0 security hardening.

export async function saveDocumentForUpload(
  _id: string,
  _name: string,
  _type: string,
  _data: Blob,
  _propertyId: string
) {
  throw new Error('Offline document storage is disabled for security reasons.');
}

export async function getPendingDocuments() {
  return [];
}

export async function updateDocumentStatus(
  _id: string,
  _status: 'pending' | 'uploading' | 'uploaded' | 'failed'
) {
  return;
}

export async function removeDocument(_id: string) {
  return;
}

// ========== CLEANUP ==========

export async function clearOldCache(daysOld = 7) {
  const db = await getDB();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const properties = await db.getAll('cached-properties');
  
  for (const prop of properties) {
    if (new Date(prop.cachedAt) < cutoffDate) {
      await db.delete('cached-properties', prop.id);
    }
  }
}
