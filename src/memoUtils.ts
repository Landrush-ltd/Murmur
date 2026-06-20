import type { VoiceMemo } from './types';

const DEFAULT_MEMO_TITLE = 'Untitled memo';

export function createDefaultTitle(createdAt: Date = new Date()): string {
  return `Memo ${createdAt.toLocaleString([], {
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
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function normalizeTitle(title: string): string {
  return title.trim() || DEFAULT_MEMO_TITLE;
}

export function sortMemosByNewest(memos: VoiceMemo[]): VoiceMemo[] {
  return [...memos].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

export function sortMemosByPinnedThenNewest(memos: VoiceMemo[]): VoiceMemo[] {
  return [...memos].sort((left, right) => {
    if (left.pinned && !right.pinned) return -1;
    if (!left.pinned && right.pinned) return 1;

    return (
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
  });
}

export function getActiveMemos(memos: VoiceMemo[]): VoiceMemo[] {
  return memos.filter((m) => !m.archived);
}

export function getArchivedMemos(memos: VoiceMemo[]): VoiceMemo[] {
  return memos.filter((m) => m.archived);
}

export function matchesMemo(memo: VoiceMemo, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return `${memo.title} ${memo.series} ${memo.notes}`
    .toLowerCase()
    .includes(normalizedQuery);
}

export function getAudioExtension(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) {
    return 'mp3';
  }

  if (mimeType.includes('ogg')) {
    return 'ogg';
  }

  if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
    return 'm4a';
  }

  return 'webm';
}

// ─── Streak & Insights ───────────────────────────────────────────────────────

export interface MemoInsights {
  totalMemos: number;
  activeMemos: number;
  pinnedMemos: number;
  archivedMemos: number;
  totalDurationMs: number;
  totalSizeBytes: number;
  currentStreak: number;
  longestStreak: number;
  seriesBreakdown: { series: string; count: number; durationMs: number }[];
  recordingsByDayOfWeek: number[];
  recentActivity: { date: string; count: number }[];
}

export function computeInsights(memos: VoiceMemo[]): MemoInsights {
  const active = memos.filter((m) => !m.archived);
  const pinned = memos.filter((m) => m.pinned && !m.archived);
  const archived = memos.filter((m) => m.archived);

  const totalDurationMs = memos.reduce((sum, m) => sum + m.durationMs, 0);
  const totalSizeBytes = memos.reduce((sum, m) => sum + m.size, 0);

  // Recording days for streak calculation
  const recordingDays = new Set(
    active.map((m) => new Date(m.createdAt).toDateString()),
  );

  const { current, longest } = computeStreaks(recordingDays);

  // Series breakdown
  const seriesMap = new Map<string, { count: number; durationMs: number }>();
  for (const memo of active) {
    const key = memo.series || 'Untagged';
    const existing = seriesMap.get(key) ?? { count: 0, durationMs: 0 };

    seriesMap.set(key, {
      count: existing.count + 1,
      durationMs: existing.durationMs + memo.durationMs,
    });
  }

  const seriesBreakdown = [...seriesMap.entries()]
    .map(([series, data]) => ({ series, ...data }))
    .sort((a, b) => b.count - a.count);

  // Recordings by day of week (0=Sun … 6=Sat)
  const recordingsByDayOfWeek = Array.from({ length: 7 }, () => 0);
  for (const memo of active) {
    const day = new Date(memo.createdAt).getDay();
    recordingsByDayOfWeek[day] += 1;
  }

  // Last 30 days activity
  const last30 = getLast30DaysCounts(active);

  return {
    totalMemos: memos.length,
    activeMemos: active.length,
    pinnedMemos: pinned.length,
    archivedMemos: archived.length,
    totalDurationMs,
    totalSizeBytes,
    currentStreak: current,
    longestStreak: longest,
    seriesBreakdown,
    recordingsByDayOfWeek,
    recentActivity: last30,
  };
}

function computeStreaks(days: Set<string>): { current: number; longest: number } {
  if (days.size === 0) return { current: 0, longest: 0 };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let current = 0;
  let longest = 0;
  let streak = 0;
  let checkingCurrent = true;

  for (let i = 0; i < 365; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = day.toDateString();

    if (days.has(key)) {
      streak += 1;

      if (checkingCurrent) {
        current = streak;
      }

      longest = Math.max(longest, streak);
    } else {
      if (checkingCurrent && i > 0) {
        checkingCurrent = false;
      }

      streak = 0;
    }
  }

  return { current, longest };
}

function getLast30DaysCounts(
  memos: VoiceMemo[],
): { date: string; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const countMap = new Map<string, number>();

  for (const memo of memos) {
    const day = new Date(memo.createdAt);
    day.setHours(0, 0, 0, 0);
    const diff = Math.floor(
      (today.getTime() - day.getTime()) / 86_400_000,
    );

    if (diff >= 0 && diff < 30) {
      const key = day.toISOString().slice(0, 10);
      countMap.set(key, (countMap.get(key) ?? 0) + 1);
    }
  }

  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (29 - i));
    const key = d.toISOString().slice(0, 10);

    return { date: key, count: countMap.get(key) ?? 0 };
  });
}
