import type { MurmurDoc, MurmurFolder, VoiceMemo } from './types';
import { sortDocsByPinnedThenNewest } from './docUtils';

const DB_NAME = 'murmur-docs';
const DB_VERSION = 3;          // v3: nested folders (parentId)
const STORE = 'docs';
const FOLDER_STORE = 'folders';

// ─── Database helpers ─────────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      // Docs store (existed since v1)
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
      // Folders store (added in v2)
      if (!db.objectStoreNames.contains(FOLDER_STORE)) {
        const fs = db.createObjectStore(FOLDER_STORE, { keyPath: 'id' });
        fs.createIndex('createdAt', 'createdAt', { unique: false });
      }
      void event; // suppress unused warning
    };
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  try {
    const tx = db.transaction(storeName, mode);
    return await promisify(fn(tx.objectStore(storeName)));
  } finally {
    db.close();
  }
}

// Convenience wrappers for docs store (backward compat)
async function withDocStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return withStore(STORE, mode, fn);
}

// ─── Migration from legacy voice-memos store ──────────────────────────────────

function readLegacyMemos(): Promise<VoiceMemo[]> {
  return new Promise((resolve) => {
    if (!window.indexedDB) { resolve([]); return; }

    const req = window.indexedDB.open('murmur-voice-memos', 1);
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('memos')) { db.close(); resolve([]); return; }

      const tx = db.transaction('memos', 'readonly');
      const all = tx.objectStore('memos').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result as VoiceMemo[]); };
      all.onerror = () => { db.close(); resolve([]); };
    };
  });
}

function voiceMemoToDoc(memo: VoiceMemo): MurmurDoc {
  const now = memo.createdAt;
  return {
    id: memo.id,
    title: memo.title,
    icon: '',
    tags: memo.series ? [memo.series] : [],
    notes: memo.notes ? `<p>${memo.notes.replace(/\n/g, '</p><p>')}</p>` : '',
    starred: memo.pinned ?? false,
    pinned: memo.pinned ?? false,
    archived: memo.archived ?? false,
    createdAt: now,
    updatedAt: now,
    blob: memo.blob,
    durationMs: memo.durationMs,
    mimeType: memo.mimeType,
    size: memo.size,
  };
}

async function runMigration(): Promise<void> {
  const existing = await getAllDocs();
  if (existing.length > 0) return;

  const legacy = await readLegacyMemos();
  if (legacy.length === 0) return;

  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const memo of legacy) {
      store.put(voiceMemoToDoc(memo));
    }
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
}

// ─── Public API — Documents ────────────────────────────────────────────────────

export async function getAllDocs(): Promise<MurmurDoc[]> {
  const raw = await withDocStore('readonly', (s) => s.getAll());

  return sortDocsByPinnedThenNewest(
    (raw as MurmurDoc[]).map((d) => ({
      ...d,
      icon: d.icon ?? '',
      tags: d.tags ?? ((d as unknown as { series?: string }).series
        ? [(d as unknown as { series: string }).series]
        : []),
      notes: d.notes ?? '',
      starred: d.starred ?? d.pinned ?? false,
      pinned: d.pinned ?? false,
      archived: d.archived ?? false,
      updatedAt: d.updatedAt ?? d.createdAt,
      folderId: d.folderId ?? undefined,
    })),
  );
}

export async function initDocStore(): Promise<MurmurDoc[]> {
  await runMigration();
  return getAllDocs();
}

export async function saveDoc(doc: MurmurDoc): Promise<MurmurDoc> {
  await withDocStore('readwrite', (s) => s.put(doc));
  return doc;
}

export async function updateDoc(
  id: string,
  updates: Partial<Pick<MurmurDoc, 'title' | 'tags' | 'notes' | 'icon' | 'starred' | 'pinned' | 'archived' | 'transcript' | 'folderId'>>,
): Promise<MurmurDoc> {
  const current = await withDocStore<MurmurDoc>('readonly', (s) => s.get(id));
  if (!current) throw new Error('Document not found.');

  const updated: MurmurDoc = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await saveDoc(updated);
  return updated;
}

export async function deleteDoc(id: string): Promise<void> {
  await withDocStore('readwrite', (s) => s.delete(id));
}

// ─── Public API — Folders ─────────────────────────────────────────────────────

export async function getAllFolders(): Promise<MurmurFolder[]> {
  const raw = await withStore<MurmurFolder[]>(FOLDER_STORE, 'readonly', (s) => s.getAll());
  return (raw as MurmurFolder[]).map((f) => ({
    ...f,
    icon: f.icon ?? '📁',
    parentId: f.parentId ?? undefined,
  }));
}

export async function saveFolder(folder: MurmurFolder): Promise<MurmurFolder> {
  await withStore(FOLDER_STORE, 'readwrite', (s) => s.put(folder));
  return folder;
}

export async function updateFolder(
  id: string,
  updates: Partial<Pick<MurmurFolder, 'name' | 'icon' | 'parentId'>>,
): Promise<MurmurFolder> {
  const current = await withStore<MurmurFolder>(FOLDER_STORE, 'readonly', (s) => s.get(id));
  if (!current) throw new Error('Folder not found.');

  const updated: MurmurFolder = {
    ...current,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await saveFolder(updated);
  return updated;
}

export async function deleteFolder(id: string): Promise<void> {
  const allFolders = await getAllFolders();
  const allDocs = await getAllDocs();
  const folder = allFolders.find((f) => f.id === id);
  const parentId = folder?.parentId;

  const db = await openDb();
  try {
    const folderTx = db.transaction(FOLDER_STORE, 'readwrite');
    const folderStore = folderTx.objectStore(FOLDER_STORE);

    // Reparent child folders to this folder's parent
    for (const child of allFolders.filter((f) => f.parentId === id)) {
      folderStore.put({
        ...child,
        parentId,
        updatedAt: new Date().toISOString(),
      });
    }
    folderStore.delete(id);

    await new Promise<void>((res, rej) => {
      folderTx.oncomplete = () => res();
      folderTx.onerror = () => rej(folderTx.error);
    });

    const docTx = db.transaction(STORE, 'readwrite');
    const docStore = docTx.objectStore(STORE);
    for (const doc of allDocs) {
      if (doc.folderId === id) {
        docStore.put({
          ...doc,
          folderId: parentId,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    await new Promise<void>((res, rej) => {
      docTx.oncomplete = () => res();
      docTx.onerror = () => rej(docTx.error);
    });
  } finally {
    db.close();
  }
}
