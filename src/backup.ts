import type { MurmurDoc } from './types';
import { sortDocsByPinnedThenNewest } from './docUtils';

const BACKUP_APP_ID = 'murmur';
const BACKUP_VERSION = 2;

interface BackupEntry {
  id: string;
  title: string;
  icon: string;
  tags: string[];
  notes: string;
  transcript?: string;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
  pinned: boolean;
  archived: boolean;
  // Audio — only present when the doc has a recording
  durationMs?: number;
  mimeType?: string;
  size?: number;
  audioData?: string;   // base-64 data URL
}

interface BackupFile {
  app: typeof BACKUP_APP_ID;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  docCount: number;
  docs: BackupEntry[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error('Unable to read audio data from backup.');
  return response.blob();
}

function assertBackupFile(value: unknown): asserts value is BackupFile {
  if (!value || typeof value !== 'object') {
    throw new Error('Backup file is empty or invalid.');
  }

  const b = value as Partial<BackupFile>;

  if (b.app !== BACKUP_APP_ID || !Array.isArray(b.docs)) {
    throw new Error('This is not a supported Murmur backup file.');
  }
}

export async function createBackupFile(docs: MurmurDoc[]): Promise<Blob> {
  const entries = await Promise.all(
    docs.map(async (doc): Promise<BackupEntry> => {
      const entry: BackupEntry = {
        id: doc.id,
        title: doc.title,
        icon: doc.icon,
        tags: doc.tags ?? [],
        notes: doc.notes,
        transcript: doc.transcript,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        starred: doc.starred ?? false,
        pinned: doc.pinned,
        archived: doc.archived,
      };

      if (doc.blob) {
        entry.durationMs = doc.durationMs;
        entry.mimeType = doc.mimeType;
        entry.size = doc.size;
        entry.audioData = await blobToDataUrl(doc.blob);
      }

      return entry;
    }),
  );

  const backup: BackupFile = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    docCount: entries.length,
    docs: entries,
  };

  return new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
}

export async function readBackupFile(file: File): Promise<MurmurDoc[]> {
  const rawBackup = JSON.parse(await file.text()) as unknown;
  assertBackupFile(rawBackup);

  const restored = await Promise.all(
    rawBackup.docs.map(async (entry): Promise<MurmurDoc> => {
      const doc: MurmurDoc = {
        id: entry.id,
        title: entry.title,
        icon: entry.icon ?? '',
        tags: entry.tags ?? [],
        notes: entry.notes ?? '',
        transcript: entry.transcript,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt ?? entry.createdAt,
        starred: entry.starred ?? false,
        pinned: entry.pinned ?? false,
        archived: entry.archived ?? false,
      };

      if (entry.audioData) {
        const blob = await dataUrlToBlob(entry.audioData);
        doc.blob = blob;
        doc.durationMs = entry.durationMs;
        doc.mimeType = entry.mimeType || blob.type || 'audio/webm';
        doc.size = entry.size || blob.size;
      }

      return doc;
    }),
  );

  return sortDocsByPinnedThenNewest(restored);
}

export function createBackupFileName(date = new Date()): string {
  return `murmur-backup-${date.toISOString().slice(0, 10)}.json`;
}
