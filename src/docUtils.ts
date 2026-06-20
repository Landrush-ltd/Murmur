import type { MurmurDoc } from './types';

// ─── Display helpers ──────────────────────────────────────────────────────────

const DEFAULT_DOC_TITLE = 'Untitled';

export function createDefaultTitle(createdAt: Date = new Date()): string {
  return `Note ${createdAt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeTitle(title: string): string {
  return title.trim() || DEFAULT_DOC_TITLE;
}

export function getDocDisplayTitle(doc: MurmurDoc): string {
  return (doc.title.trim() || DEFAULT_DOC_TITLE);
}

/** Strip HTML tags to get a plain-text preview of the notes content. */
export function getNotesPreview(notes: string, maxLen = 80): string {
  const plain = notes
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > maxLen ? plain.slice(0, maxLen) + '…' : plain;
}

export function getAudioExtension(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  return 'webm';
}

// ─── Date display ─────────────────────────────────────────────────────────────

export function getDateBucket(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const lastWeekStart = new Date(today);
  lastWeekStart.setDate(today.getDate() - 7);

  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === yesterday.getTime()) return 'Yesterday';
  if (d >= lastWeekStart) return 'This week';
  return 'Older';
}

export function formatDocTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ─── Filtering / sorting ──────────────────────────────────────────────────────

export function sortDocsByPinnedThenNewest(docs: MurmurDoc[]): MurmurDoc[] {
  return [...docs].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

export function getActiveDocs(docs: MurmurDoc[]): MurmurDoc[] {
  return docs.filter((d) => !d.archived);
}

export function getArchivedDocs(docs: MurmurDoc[]): MurmurDoc[] {
  return docs.filter((d) => d.archived);
}

export function matchesDoc(doc: MurmurDoc, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const plain = getNotesPreview(doc.notes, 1000);
  const tagStr = doc.tags.join(' ');
  const transcriptStr = doc.transcript ?? '';
  return `${doc.title} ${tagStr} ${plain} ${transcriptStr}`.toLowerCase().includes(q);
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface DocInsights {
  totalDocs: number;
  activeDocs: number;
  audioDocs: number;
  textDocs: number;
  totalDurationMs: number;
  currentStreak: number;
  longestStreak: number;
  seriesBreakdown: { series: string; count: number; durationMs: number }[];
  recentActivity: { date: string; count: number }[];
}

export function computeInsights(docs: MurmurDoc[]): DocInsights {
  const active = docs.filter((d) => !d.archived);
  const audioDocs = active.filter((d) => !!d.blob);
  const textDocs = active.filter((d) => !d.blob);
  const totalDurationMs = audioDocs.reduce((s, d) => s + (d.durationMs ?? 0), 0);

  const days = new Set(active.map((d) => new Date(d.createdAt).toDateString()));
  const { current, longest } = computeStreaks(days);

  const seriesMap = new Map<string, { count: number; durationMs: number }>();
  for (const doc of active) {
    const docTags = doc.tags?.length ? doc.tags : ['Untagged'];
    for (const tag of docTags) {
      const prev = seriesMap.get(tag) ?? { count: 0, durationMs: 0 };
      seriesMap.set(tag, {
        count: prev.count + 1,
        durationMs: prev.durationMs + (doc.durationMs ?? 0),
      });
    }
  }
  const seriesBreakdown = [...seriesMap.entries()]
    .map(([series, data]) => ({ series, ...data }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDocs: docs.length,
    activeDocs: active.length,
    audioDocs: audioDocs.length,
    textDocs: textDocs.length,
    totalDurationMs,
    currentStreak: current,
    longestStreak: longest,
    seriesBreakdown,
    recentActivity: getLast30DaysCounts(active),
  };
}

function computeStreaks(days: Set<string>): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let current = 0, longest = 0, streak = 0, checkingCurrent = true;
  for (let i = 0; i < 365; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    if (days.has(day.toDateString())) {
      streak += 1;
      if (checkingCurrent) current = streak;
      longest = Math.max(longest, streak);
    } else {
      if (checkingCurrent && i > 0) checkingCurrent = false;
      streak = 0;
    }
  }
  return { current, longest };
}

function getLast30DaysCounts(docs: MurmurDoc[]): { date: string; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const countMap = new Map<string, number>();
  for (const doc of docs) {
    const day = new Date(doc.createdAt);
    day.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - day.getTime()) / 86_400_000);
    if (diff >= 0 && diff < 30) {
      const key = day.toISOString().slice(0, 10);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
  }
  return Array.from({ length: 14 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (13 - i));
    const key = day.toISOString().slice(0, 10);
    return { date: key, count: countMap.get(key) ?? 0 };
  });
}
