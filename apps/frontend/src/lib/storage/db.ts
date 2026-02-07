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
  'documents': {
    key: string;
    value: {
      id: string;
      name: string;
      type: string;
      size: number;
      data: Blob;
      uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
      propertyId: string;
      createdAt: string;
    };
    indexes: { 'by-upload-status': string };
  };
}

let dbInstance: IDBPDatabase<C2CDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<C2CDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<C2CDB>('c2c-offline', 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
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

      // Documents for offline upload
      if (!db.objectStoreNames.contains('documents')) {
        const docStore = db.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('by-upload-status', 'uploadStatus');
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
  await db.add('offline-queue', {
    url,
    method,
    body,
    headers,
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

export async function saveDocumentForUpload(
  id: string,
  name: string,
  type: string,
  data: Blob,
  propertyId: string
) {
  const db = await getDB();
  await db.put('documents', {
    id,
    name,
    type,
    size: data.size,
    data,
    uploadStatus: 'pending',
    propertyId,
    createdAt: new Date().toISOString(),
  });
}

export async function getPendingDocuments() {
  const db = await getDB();
  return db.getAllFromIndex('documents', 'by-upload-status', 'pending');
}

export async function updateDocumentStatus(
  id: string,
  status: 'pending' | 'uploading' | 'uploaded' | 'failed'
) {
  const db = await getDB();
  const doc = await db.get('documents', id);
  
  if (doc) {
    doc.uploadStatus = status;
    await db.put('documents', doc);
  }
}

export async function removeDocument(id: string) {
  const db = await getDB();
  await db.delete('documents', id);
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