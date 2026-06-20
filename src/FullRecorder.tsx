import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  computeInsights,
  createDefaultTitle,
  formatDuration,
  getActiveDocs,
  getArchivedDocs,
  getAudioExtension,
  getNotesPreview,
  matchesDoc,
  normalizeTitle,
  sortDocsByPinnedThenNewest,
  formatDocTime,
} from './docUtils';
import {
  createBackupFile,
  createBackupFileName,
  readBackupFile,
} from './backup';
import {
  deleteDoc,
  deleteFolder,
  getAllDocs,
  getAllFolders,
  initDocStore,
  saveDoc,
  saveFolder,
  updateDoc,
  updateFolder,
} from './documentStore';
import {
  buildFavoritesNodes,
  buildRecentsNodes,
  buildSearchNodes,
  buildWorkspaceTree,
} from './sidebarTree';
import { WorkspaceSidebar } from './WorkspaceSidebar';
import type { MurmurFolder } from './types';
import Logo from './Logo';
import {
  clearBiometric,
  clearPasscode,
  getPrivacyStatus,
  registerBiometric,
  setPasscode,
  verifyBiometric,
  verifyPasscode,
  type PrivacyStatus,
} from './privacy';
import {
  connectSia,
  downloadSiaBackup,
  getStoredSiaBackup,
  hasStoredSiaConnection,
  listSiaBackups,
  reconnectSia,
  uploadSiaBackup,
  type SiaBackupRecord,
} from './siaStorage';
import { onInstallAvailable, triggerInstallPrompt, isRunningAsPWA } from './pwa';
import { NoteEditor } from './NoteEditor';
import { isAudioDoc } from './types';
import type { DraftDoc, MurmurDoc } from './types';
import './styles.css';

const TIMER_INTERVAL_MS = 250;
const RECORDING_TIMESLICE_MS = 1_000;
const WELCOME_DISMISSED_KEY = 'murmur.welcomeDismissedDate.v1';
const REMINDER_SETTINGS_KEY = 'murmur.reminders.v1';
const INSTALL_DISMISSED_KEY = 'murmur.installDismissed.v1';
const AUTO_LOCK_ENABLED_KEY = 'murmur.autoLock.v1';
const INCOMPLETE_REMINDER_COOLDOWN_MS = 5 * 60 * 1_000;
const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 2] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

type RecordingState = 'idle' | 'recording' | 'paused';
type MenuPanel = 'settings' | 'storage' | 'privacy' | 'insights' | null;

interface ReminderSettings {
  dailyEnabled: boolean;
  dailyTime: string;
}

const defaultReminderSettings: ReminderSettings = {
  dailyEnabled: false,
  dailyTime: '09:00',
};

const seriesTemplates = [
  {
    series: 'idea 💡',
    emoji: '💡',
    prompt: 'Capture a rough idea before it disappears.',
    label: 'Idea',
  },
  {
    series: 'diary entry',
    emoji: '📖',
    prompt: 'Leave a note for your future self.',
    label: 'Diary',
  },
  {
    series: 'vent or rant',
    emoji: '🔥',
    prompt: 'Say what you need to say. No filter.',
    label: 'Vent',
  },
  {
    series: 'deep thought 🧠',
    emoji: '🧠',
    prompt: 'Work through something complex out loud.',
    label: 'Thought',
  },
  {
    series: 'reminder ⏰',
    emoji: '⏰',
    prompt: 'Record a reminder for later — task, follow-up, or errand.',
    label: 'Reminder',
  },
  {
    series: 'Daily affirmations',
    emoji: '✨',
    prompt: 'Record one affirmation you want to carry today.',
    label: 'Affirm',
  },
  {
    series: 'Gratitude log',
    emoji: '🙏',
    prompt: 'Name one thing you are grateful for right now.',
    label: 'Gratitude',
  },
  {
    series: 'Meeting recap',
    emoji: '📋',
    prompt: 'Summarize decisions, blockers, and follow-ups.',
    label: 'Recap',
  },
] as const;

const reminderSeriesIdeas = [
  {
    series: 'Daily affirmations',
    prompt: 'Record one affirmation you want to carry today.',
  },
  {
    series: 'To-do list',
    prompt: 'Talk through your top priorities before the day gets busy.',
  },
  {
    series: 'Gratitude log',
    prompt: 'Save one thing you are grateful for right now.',
  },
  {
    series: 'Idea journal',
    prompt: 'Capture a rough idea before it disappears.',
  },
  {
    series: 'Mood check-in',
    prompt: 'Name how you feel and what you need next.',
  },
  {
    series: 'Meeting recap',
    prompt: 'Summarize decisions, blockers, and follow-ups.',
  },
  {
    series: 'Voice diary',
    prompt: 'Leave a short note for your future self.',
  },
];


const recorderPrompts = [
  'drop the thought 🎙️',
  'brain dump in 3... 2...',
  'vent, plan, or just vibe',
  'say it before it disappears',
  'main character monologue?',
  'tiny thought, big energy',
];

const preferredMimeTypes = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  return (
    preferredMimeTypes.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    ) ?? ''
  );
}

function createDrafts(docs: MurmurDoc[]): Record<string, DraftDoc> {
  return docs.reduce<Record<string, DraftDoc>>((acc, doc) => {
    acc[doc.id] = {
      title: doc.title,
      icon: doc.icon ?? '',
      tags: doc.tags ?? [],
      notes: doc.notes ?? '',
    };
    return acc;
  }, {});
}

function sanitizeFileName(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'murmur-memo'
  );
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Extract first sentence from transcript for title suggestion */
function extractTitleFromTranscript(transcript: string): string {
  const clean = transcript.trim();
  if (!clean) return '';
  const sentence = clean.split(/[.!?]/)[0].trim();
  if (sentence.length < 3 || sentence.length > 80) return '';
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function getStoredReminderSettings(): ReminderSettings {
  const storedSettings = localStorage.getItem(REMINDER_SETTINGS_KEY);

  if (!storedSettings) {
    return defaultReminderSettings;
  }

  try {
    return {
      ...defaultReminderSettings,
      ...(JSON.parse(storedSettings) as Partial<ReminderSettings>),
    };
  } catch {
    return defaultReminderSettings;
  }
}

function saveReminderSettings(settings: ReminderSettings): void {
  localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings));
}

function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!('Notification' in window)) {
    return 'unsupported';
  }

  return Notification.permission;
}

function getDelayUntilReminder(time: string): number {
  const [hour = '9', minute = '0'] = time.split(':');
  const now = new Date();
  const nextReminder = new Date();

  nextReminder.setHours(Number(hour), Number(minute), 0, 0);

  if (nextReminder <= now) {
    nextReminder.setDate(nextReminder.getDate() + 1);
  }

  return nextReminder.getTime() - now.getTime();
}

function showBrowserNotification(title: string, body: string): boolean {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }

  new Notification(title, {
    body,
    icon: '/murmur-mark.svg',
    badge: '/murmur-mark.svg',
  });

  return true;
}

function getReminderSeriesIdea(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor(
    (date.getTime() - startOfYear.getTime()) / 86_400_000,
  );

  return reminderSeriesIdeas[dayOfYear % reminderSeriesIdeas.length];
}

// ─── MemoAudio – with playback speed control ─────────────────────────────────

function MemoAudio({ memo }: { memo: MurmurDoc & { blob: Blob } }) {
  const source = useMemo(() => URL.createObjectURL(memo.blob), [memo.blob]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);

  useEffect(() => {
    return () => URL.revokeObjectURL(source);
  }, [source]);

  const handleSpeedChange = (newSpeed: PlaybackSpeed) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  return (
    <div className="audio-player">
      <audio
        ref={audioRef}
        controls
        preload="metadata"
        src={source}
      />
      <div className="speed-controls">
        <span className="speed-label">Speed</span>
        {PLAYBACK_SPEEDS.map((s) => (
          <button
            key={s}
            className={`speed-chip ${speed === s ? 'speed-chip-active' : ''}`}
            type="button"
            onClick={() => handleSpeedChange(s)}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Insights Panel ───────────────────────────────────────────────────────────

function InsightsPanel({ memos }: { memos: MurmurDoc[] }) {
  const insights = useMemo(() => computeInsights(memos), [memos]);

  const maxActivity = Math.max(1, ...insights.recentActivity.map((d) => d.count));
  const last14 = insights.recentActivity.slice(-14);

  const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="insights-panel">
      <div className="insights-stats-grid">
        <div className="insight-stat">
          <span className="insight-stat-value">{insights.currentStreak}</span>
          <span className="insight-stat-label">day streak 🔥</span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value">{insights.audioDocs}</span>
          <span className="insight-stat-label">recordings</span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value">
            {formatDuration(insights.totalDurationMs)}
          </span>
          <span className="insight-stat-label">total audio</span>
        </div>
        <div className="insight-stat">
          <span className="insight-stat-value">{insights.longestStreak}</span>
          <span className="insight-stat-label">best streak</span>
        </div>
      </div>

      <div className="insights-section">
        <p className="insights-section-label">Last 14 days</p>
        <div className="activity-bars">
          {last14.map((day) => (
            <div key={day.date} className="activity-bar-wrap">
              <div
                className="activity-bar"
                style={{
                  height: `${Math.round((day.count / maxActivity) * 48) + 4}px`,
                  opacity: day.count > 0 ? 1 : 0.22,
                }}
                title={`${day.date}: ${day.count}`}
              />
            </div>
          ))}
        </div>
        <div className="activity-day-labels">
          {last14.map((day, i) => (
            <span key={i} className="activity-day-label">
              {dayLabels[new Date(day.date + 'T12:00:00').getDay()]}
            </span>
          ))}
        </div>
      </div>

      {insights.seriesBreakdown.length > 0 && (
        <div className="insights-section">
          <p className="insights-section-label">By tag</p>
          <div className="series-breakdown">
            {insights.seriesBreakdown.slice(0, 6).map((row) => (
              <div key={row.series} className="series-row">
                <span className="series-row-name">{row.series}</span>
                <span className="series-row-count">{row.count}</span>
                <span className="series-row-duration">
                  {formatDuration(row.durationMs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="privacy-status-list" style={{ marginTop: 8 }}>
        <span>{insights.textDocs} notes · {insights.audioDocs} recordings</span>
      </div>
    </div>
  );
}

// ─── Install Banner ───────────────────────────────────────────────────────────

function InstallBanner({ onDismiss }: { onDismiss: () => void }) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    await triggerInstallPrompt();
    setInstalling(false);
  };

  return (
    <div className="install-banner" role="banner">
      <div className="install-banner-content">
        <span className="install-banner-icon">📲</span>
        <div>
          <strong>Add Murmur to your home screen</strong>
          <p>Record faster — no browser chrome, works offline.</p>
        </div>
      </div>
      <div className="install-banner-actions">
        <button
          className="primary-button install-banner-btn"
          disabled={installing}
          onClick={() => void handleInstall()}
        >
          {installing ? 'Installing…' : 'Install'}
        </button>
        <button className="text-danger-button" onClick={onDismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}

// ─── FullRecorder ─────────────────────────────────────────────────────────────

export default function FullRecorder() {
  const [docs, setDocs] = useState<MurmurDoc[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftDoc>>({});
  const [query, setQuery] = useState('');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [recordingState, setRecordingState] =
    useState<RecordingState>('idle');
  const [recordingMs, setRecordingMs] = useState(0);
  const [recorderPrompt] = useState(
    () => recorderPrompts[Math.floor(Math.random() * recorderPrompts.length)],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeMenuPanel, setActiveMenuPanel] = useState<MenuPanel>(null);
  const [showWelcome, setShowWelcome] = useState(
    () =>
      localStorage.getItem(WELCOME_DISMISSED_KEY) !==
      new Date().toDateString(),
  );
  const [reminderSettings, setReminderSettings] = useState(
    getStoredReminderSettings,
  );
  const [notificationPermission, setNotificationPermission] = useState(
    getNotificationPermission,
  );
  const [reminderStatus, setReminderStatus] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [privacyStatus, setPrivacyStatus] = useState<PrivacyStatus>({
    passcodeEnabled: false,
    biometricEnabled: false,
    biometricAvailable: false,
  });
  const [isPrivacyReady, setIsPrivacyReady] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [autoLockEnabled, setAutoLockEnabled] = useState(
    () => localStorage.getItem(AUTO_LOCK_ENABLED_KEY) === 'true',
  );
  const [unlockPasscode, setUnlockPasscode] = useState('');
  const [setupPasscodeValue, setSetupPasscodeValue] = useState('');
  const [setupPasscodeConfirm, setSetupPasscodeConfirm] = useState('');
  const [privacyMessage, setPrivacyMessage] = useState('');
  const [isSiaConnected, setIsSiaConnected] = useState(false);
  const [isSiaReady, setIsSiaReady] = useState(false);
  const [isSiaBusy, setIsSiaBusy] = useState(false);
  const [isSiaSyncing, setIsSiaSyncing] = useState(false);
  const [siaStatus, setSiaStatus] = useState('');
  const [siaApprovalUrl, setSiaApprovalUrl] = useState('');
  const [siaRecoveryPhrase, setSiaRecoveryPhrase] = useState('');
  const [siaRecoveryPhraseToUse, setSiaRecoveryPhraseToUse] = useState('');
  const [latestSiaBackup, setLatestSiaBackup] =
    useState<SiaBackupRecord | null>(() => getStoredSiaBackup());

  // New feature state
  const [showArchived, setShowArchived] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<
    (typeof seriesTemplates)[number] | null
  >(null);

  const [liveTranscript, setLiveTranscript] = useState('');

  // Folders
  const [folders, setFolders] = useState<MurmurFolder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [folderPickerDocId, setFolderPickerDocId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Drag & drop
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null); // folder id or '__unfiled__'

  // Pending folder — applied to the next new note / recording
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const backupInputRef = useRef<HTMLInputElement | null>(null);
  const incompleteReminderSentAtRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const elapsedBeforeCurrentRunRef = useRef(0);
  const finalDurationRef = useRef(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  // Load docs + folders on mount
  useEffect(() => {
    let isMounted = true;

    Promise.all([initDocStore(), getAllFolders()])
      .then(([loadedDocs, loadedFolders]) => {
        if (!isMounted) return;
        setDocs(loadedDocs);
        setDrafts(createDrafts(loadedDocs));
        setFolders(loadedFolders);
      })
      .catch(() => {
        if (isMounted) {
          setError('Unable to load saved notes from this browser.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
      stopStream(streamRef.current);
    };
  }, []);

  // Reconnect Sia on load
  useEffect(() => {
    let isMounted = true;

    const initializeSia = async () => {
      if (!hasStoredSiaConnection()) {
        return;
      }

      try {
        await reconnectSia();

        if (!isMounted) {
          return;
        }

        setIsSiaConnected(true);
        const records = await listSiaBackups();

        if (!isMounted) {
          return;
        }

        if (records[0]) {
          setLatestSiaBackup(records[0]);
        }
      } catch {
        if (isMounted) {
          setSiaStatus('Reconnect storage to use Murmur.');
        }
      }
    };

    void initializeSia().finally(() => {
      if (isMounted) {
        setIsSiaReady(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  // Load privacy status
  useEffect(() => {
    let isMounted = true;

    getPrivacyStatus()
      .then((status) => {
        if (!isMounted) {
          return;
        }

        setPrivacyStatus(status);
        setIsLocked(status.passcodeEnabled || status.biometricEnabled);
      })
      .catch(() => {
        if (isMounted) {
          setPrivacyMessage('Privacy settings could not be loaded.');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsPrivacyReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Auto-lock when app goes to background
  useEffect(() => {
    const canAutoLock =
      autoLockEnabled &&
      (privacyStatus.passcodeEnabled || privacyStatus.biometricEnabled);

    if (!canAutoLock) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsLocked(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [autoLockEnabled, privacyStatus]);

  // Daily reminders
  useEffect(() => {
    if (
      !reminderSettings.dailyEnabled ||
      notificationPermission !== 'granted'
    ) {
      return;
    }

    let isActive = true;
    let timeoutId: number | null = null;

    const scheduleReminder = () => {
      timeoutId = window.setTimeout(() => {
        if (!isActive) {
          return;
        }

        const idea = getReminderSeriesIdea();

        showBrowserNotification(
          'Time to record in Murmur',
          `${idea.series}: ${idea.prompt}`,
        );
        setReminderStatus('Daily reminder sent.');
        scheduleReminder();
      }, getDelayUntilReminder(reminderSettings.dailyTime));
    };

    scheduleReminder();

    return () => {
      isActive = false;

      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    reminderSettings.dailyEnabled,
    reminderSettings.dailyTime,
    notificationPermission,
  ]);

  // Warn about incomplete recording on tab switch
  useEffect(() => {
    if (recordingState === 'idle') {
      return;
    }

    const notifyIncompleteRecording = () => {
      const now = Date.now();

      if (
        now - incompleteReminderSentAtRef.current <
        INCOMPLETE_REMINDER_COOLDOWN_MS
      ) {
        return;
      }

      incompleteReminderSentAtRef.current = now;

      const didNotify = showBrowserNotification(
        'Finish your Murmur recording',
        'You have a recording in progress. Return to save it before leaving.',
      );

      if (didNotify) {
        setReminderStatus('Sent an unfinished recording reminder.');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        notifyIncompleteRecording();
      }
    };

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      notifyIncompleteRecording();
      event.preventDefault();
      event.returnValue = '';
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [recordingState]);

  // PWA install prompt
  useEffect(() => {
    if (
      isRunningAsPWA() ||
      localStorage.getItem(INSTALL_DISMISSED_KEY) === 'true'
    ) {
      return;
    }

    const unsubscribe = onInstallAvailable((canInstall) => {
      setShowInstallBanner(canInstall);
    });

    return unsubscribe;
  }, []);

  // ── Computed state ─────────────────────────────────────────────────────────

  const visibleDocs = useMemo(() => {
    const base = showArchived ? getArchivedDocs(docs) : getActiveDocs(docs);
    return base.filter((doc) => matchesDoc(doc, query));
  }, [docs, query, showArchived]);


  const selectedDoc = selectedDocId
    ? docs.find((d) => d.id === selectedDocId) ?? null
    : null;

  const totalDurationMs = useMemo(
    () => docs.reduce((total, d) => total + (d.durationMs ?? 0), 0),
    [docs],
  );

  const archivedCount = useMemo(() => getArchivedDocs(docs).length, [docs]);

  const activeDocCount = useMemo(() => getActiveDocs(docs).length, [docs]);

  const isSearchActive = query.trim().length > 0;

  const sidebarFavorites = useMemo(
    () => buildFavoritesNodes(getActiveDocs(docs)),
    [docs],
  );

  const sidebarRecents = useMemo(
    () => buildRecentsNodes(getActiveDocs(docs)),
    [docs],
  );

  const sidebarWorkspaceTree = useMemo(
    () => buildWorkspaceTree(folders, visibleDocs, expandedFolders),
    [folders, visibleDocs, expandedFolders],
  );

  const sidebarSearchResults = useMemo(
    () => buildSearchNodes(visibleDocs),
    [visibleDocs],
  );

  // ── Recording controls ────────────────────────────────────────────────────

  const getCurrentRecordingMs = () => {
    if (!recordingStartedAtRef.current) {
      return elapsedBeforeCurrentRunRef.current;
    }

    return (
      elapsedBeforeCurrentRunRef.current +
      Date.now() -
      recordingStartedAtRef.current
    );
  };

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = window.setInterval(() => {
      setRecordingMs(getCurrentRecordingMs());
    }, TIMER_INTERVAL_MS);
  };

  const resetRecordingRefs = () => {
    chunksRef.current = [];
    recorderRef.current = null;
    streamRef.current = null;
    recordingStartedAtRef.current = null;
    elapsedBeforeCurrentRunRef.current = 0;
    finalDurationRef.current = 0;
  };

  const syncMemosToSia = async (
    docsToSync: MurmurDoc[],
    successMessage: string,
  ) => {
    setIsSiaSyncing(true);
    setSiaStatus('Syncing recordings...');

    try {
      const record = await uploadSiaBackup(docsToSync);
      setLatestSiaBackup(record);
      setSiaStatus(successMessage);
    } catch (siaError) {
      setSiaStatus(
        siaError instanceof Error
          ? siaError.message
          : 'Sync failed. Check your storage connection.',
      );
    } finally {
      setIsSiaSyncing(false);
    }
  };

  // ── Speech-to-text (SpeechRecognition API) ────────────────────────────────

  const startTranscription = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechAPI = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechAPI) return;

    try {
      const recognition = new SpeechAPI();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      transcriptRef.current = '';
      setLiveTranscript('');

      recognition.onresult = (event: { results: SpeechRecognitionResultList }) => {
        let full = '';
        for (let i = 0; i < event.results.length; i++) {
          full += event.results[i][0].transcript;
        }
        transcriptRef.current = full;
        setLiveTranscript(full);
      };

      recognition.onerror = () => { /* silent — transcription is best-effort */ };
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      /* not supported, proceed without transcription */
    }
  };

  const stopTranscription = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
  };

  const persistRecording = async (mimeType: string) => {
    clearTimer();
    stopStream(streamRef.current);

    const blob = new Blob(chunksRef.current, {
      type: mimeType || 'audio/webm',
    });

    if (!blob.size) {
      resetRecordingRefs();
      setRecordingMs(0);
      setError('No audio was captured. Please try recording again.');
      return;
    }

    const createdAt = new Date();
    const now = createdAt.toISOString();
    const finalTranscript = transcriptRef.current.trim();
    stopTranscription();

    const suggestedTitle = finalTranscript
      ? extractTitleFromTranscript(finalTranscript)
      : '';

    const recordingFolderId = pendingFolderId ?? undefined;
    setPendingFolderId(null);

    const doc: MurmurDoc = {
      id: crypto.randomUUID(),
      title: suggestedTitle || createDefaultTitle(createdAt),
      icon: activeTemplate?.emoji ?? '🎙️',
      tags: activeTemplate?.series ? [activeTemplate.series] : [],
      folderId: recordingFolderId,
      notes: finalTranscript ? `<p>${finalTranscript}</p>` : '',
      transcript: finalTranscript || undefined,
      starred: false,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      blob,
      durationMs: finalDurationRef.current,
      mimeType: blob.type,
      size: blob.size,
    };

    try {
      const savedDoc = await saveDoc(doc);
      const nextDocs = sortDocsByPinnedThenNewest([savedDoc, ...docs]);

      setDocs(nextDocs);
      setSelectedDocId(savedDoc.id);
      setDrafts((prev) => ({
        ...prev,
        [savedDoc.id]: {
          title: savedDoc.title,
          icon: savedDoc.icon,
          tags: savedDoc.tags ?? [],
          notes: savedDoc.notes,
        },
      }));
      await syncMemosToSia(nextDocs, 'Recording saved and synced.');
      setRecordingMs(0);
      setError('');
    } catch {
      setError('Recording finished, but it could not be saved.');
    } finally {
      resetRecordingRefs();
    }
  };

  const startRecording = async () => {
    setError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser does not support microphone recording.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('This browser does not support the MediaRecorder API.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      elapsedBeforeCurrentRunRef.current = 0;
      finalDurationRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        void persistRecording(recorder.mimeType);
      };
      recorder.onerror = () => {
        setError('The recorder stopped unexpectedly.');
      };

      recorder.start(RECORDING_TIMESLICE_MS);
      setRecordingState('recording');
      startTimer();
      startTranscription();
    } catch {
      setError(
        'Could not access the microphone. Check that permissions are granted.',
      );
    }
  };

  // Handle ?action=record shortcut from manifest / home-screen icon
  // Placed after startRecording is defined intentionally.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('action') === 'record') {
      window.history.replaceState({}, '', '/');
      const id = window.setTimeout(() => {
        void startRecording();
      }, 600);

      return () => window.clearTimeout(id);
    }

    return undefined;
  // startRecording is stable per render; omitting from deps is intentional
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseRecording = () => {
    if (!recorderRef.current || recordingState !== 'recording') {
      return;
    }

    finalDurationRef.current = getCurrentRecordingMs();
    clearTimer();
    recorderRef.current.pause();
    setRecordingState('paused');
  };

  const resumeRecording = () => {
    if (!recorderRef.current || recordingState !== 'paused') {
      return;
    }

    recordingStartedAtRef.current = Date.now();
    elapsedBeforeCurrentRunRef.current = finalDurationRef.current;
    finalDurationRef.current = 0;
    recorderRef.current.resume();
    setRecordingState('recording');
    startTimer();
  };

  const stopRecording = () => {
    if (!recorderRef.current) {
      return;
    }

    finalDurationRef.current =
      elapsedBeforeCurrentRunRef.current +
      (recordingStartedAtRef.current
        ? Date.now() - recordingStartedAtRef.current
        : 0);

    setRecordingState('idle');
    recorderRef.current.stop();
  };

  const handleMicButtonClick = () => {
    if (recordingState === 'idle') {
      void startRecording();
      return;
    }

    stopRecording();
  };

  // ── Doc operations ────────────────────────────────────────────────────────

  const updateDraft = (docId: string, field: keyof DraftDoc, value: string | string[]) => {
    setDrafts((prev) => ({
      ...prev,
      [docId]: { ...prev[docId], [field]: value },
    }));
  };

  /** Auto-save notes HTML — called by NoteEditor's debounced onChange */
  const saveNotesAuto = useCallback(
    async (docId: string, html: string) => {
      try {
        const updated = await updateDoc(docId, { notes: html });
        setDocs((prev) =>
          sortDocsByPinnedThenNewest(
            prev.map((d) => (d.id === updated.id ? updated : d)),
          ),
        );
        setDrafts((prev) => ({
          ...prev,
          [docId]: { ...prev[docId], notes: html },
        }));
      } catch {
        /* silent — user content is still in editor */
      }
    },
    [],
  );

  const saveDraft = async (doc: MurmurDoc) => {
    const draft = drafts[doc.id];
    if (!draft) return;

    const updates = {
      title: normalizeTitle(draft.title),
      tags: draft.tags,
      icon: draft.icon,
      notes: draft.notes,
    };

    try {
      const updated = await updateDoc(doc.id, updates);
      const nextDocs = sortDocsByPinnedThenNewest(
        docs.map((d) => (d.id === updated.id ? updated : d)),
      );
      setDocs(nextDocs);
      setDrafts((prev) => ({
        ...prev,
        [updated.id]: {
          title: updated.title,
          icon: updated.icon,
          tags: updated.tags ?? [],
          notes: updated.notes,
        },
      }));
      await syncMemosToSia(nextDocs, 'Note synced.');
      setError('');
    } catch {
      setError('Unable to save changes.');
    }
  };


  const toggleArchiveDoc = async (doc: MurmurDoc) => {
    try {
      const updated = await updateDoc(doc.id, {
        archived: !doc.archived,
        pinned: doc.archived ? doc.pinned : false,
      });
      const nextDocs = sortDocsByPinnedThenNewest(
        docs.map((d) => (d.id === updated.id ? updated : d)),
      );
      setDocs(nextDocs);
      setSelectedDocId(null);
      await syncMemosToSia(nextDocs, 'Library updated and synced.');
    } catch {
      setError('Unable to archive.');
    }
  };

  const shareDoc = async (doc: MurmurDoc) => {
    if (!isAudioDoc(doc)) return;
    const file = new File(
      [doc.blob],
      `${sanitizeFileName(doc.title)}.${getAudioExtension(doc.mimeType)}`,
      { type: doc.mimeType },
    );

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: doc.title,
          text: getNotesPreview(doc.notes) || doc.title,
          files: [file],
        });
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') exportDoc(doc);
      }
    } else {
      exportDoc(doc);
    }
  };

  const removeDoc = async (doc: MurmurDoc) => {
    const shouldDelete = window.confirm(
      `Delete "${doc.title}"? This cannot be undone.`,
    );

    if (!shouldDelete) return;

    try {
      await deleteDoc(doc.id);
      const nextDocs = docs.filter((d) => d.id !== doc.id);

      setDocs(nextDocs);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[doc.id];
        return next;
      });
      setSelectedDocId((cur) => (cur === doc.id ? null : cur));
      await syncMemosToSia(nextDocs, 'Deleted and backup updated.');
      setError('');
    } catch {
      setError('Unable to delete this note.');
    }
  };

  const exportDoc = (doc: MurmurDoc) => {
    if (!isAudioDoc(doc)) return;
    const url = URL.createObjectURL(doc.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFileName(doc.title)}.${getAudioExtension(doc.mimeType)}`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const exportBackup = async () => {
    if (!docs.length) {
      setBackupStatus('Add a note before creating a backup.');
      return;
    }

    try {
      const backup = await createBackupFile(docs);
      downloadBlob(backup, createBackupFileName());
      setBackupStatus(
        `Backup created (${docs.length} ${docs.length === 1 ? 'note' : 'notes'}). Store it somewhere safe.`,
      );
    } catch {
      setBackupStatus('Unable to create a backup file.');
    }
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;

    try {
      const backupDocs = await readBackupFile(file);
      await Promise.all(backupDocs.map((d) => saveDoc(d)));

      const loadedDocs = await getAllDocs();
      setDocs(loadedDocs);
      setDrafts(createDrafts(loadedDocs));
      await syncMemosToSia(loadedDocs, 'Restored notes synced.');
      setBackupStatus(
        `Restored ${backupDocs.length} ${backupDocs.length === 1 ? 'note' : 'notes'} from backup.`,
      );
      setError('');
    } catch {
      setBackupStatus('Unable to restore this backup file.');
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = '';
    }
  };

  // ── Privacy & biometric ───────────────────────────────────────────────────

  const refreshPrivacyStatus = async () => {
    const status = await getPrivacyStatus();
    setPrivacyStatus(status);

    return status;
  };

  const savePasscode = async () => {
    if (setupPasscodeValue !== setupPasscodeConfirm) {
      setPrivacyMessage('Passcodes do not match.');
      return;
    }

    try {
      await setPasscode(setupPasscodeValue);
      setSetupPasscodeValue('');
      setSetupPasscodeConfirm('');
      await refreshPrivacyStatus();
      setPrivacyMessage('Passcode lock is enabled.');
    } catch (privacyError) {
      setPrivacyMessage(
        privacyError instanceof Error
          ? privacyError.message
          : 'Unable to save this passcode.',
      );
    }
  };

  const unlockWithPasscode = async () => {
    if (!(await verifyPasscode(unlockPasscode))) {
      setPrivacyMessage('Incorrect passcode.');
      return;
    }

    setUnlockPasscode('');
    setPrivacyMessage('');
    setIsLocked(false);
  };

  const unlockWithBiometric = async () => {
    try {
      if (!(await verifyBiometric())) {
        setPrivacyMessage('Biometric unlock was canceled.');
        return;
      }

      setPrivacyMessage('');
      setIsLocked(false);
    } catch {
      setPrivacyMessage('Biometric unlock failed.');
    }
  };

  const enableBiometric = async () => {
    try {
      await registerBiometric();
      await refreshPrivacyStatus();
      setPrivacyMessage('Biometric unlock is enabled on this device.');
    } catch (privacyError) {
      setPrivacyMessage(
        privacyError instanceof Error
          ? privacyError.message
          : 'Unable to enable biometric unlock.',
      );
    }
  };

  const disablePrivacy = async () => {
    const shouldDisable = window.confirm(
      'Disable passcode and biometric unlock for this browser?',
    );

    if (!shouldDisable) {
      return;
    }

    clearPasscode();
    clearBiometric();
    await refreshPrivacyStatus();
    setIsLocked(false);
    setPrivacyMessage('Privacy lock is disabled.');
  };

  const panicWipe = async () => {
    const confirmed = window.confirm(
      'PANIC WIPE: This will permanently delete all local recordings and clear all Murmur data from this browser. This cannot be undone.\n\nContinue?',
    );

    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(docs.map((d) => deleteDoc(d.id)));
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch {
      setPrivacyMessage('Wipe failed. Try again.');
    }
  };

  const toggleAutoLock = (enabled: boolean) => {
    localStorage.setItem(AUTO_LOCK_ENABLED_KEY, String(enabled));
    setAutoLockEnabled(enabled);
  };

  const canLockApp =
    privacyStatus.passcodeEnabled || privacyStatus.biometricEnabled;

  // ── Reminders ─────────────────────────────────────────────────────────────

  const requestReminderPermission = async () => {
    if (!('Notification' in window)) {
      setReminderStatus('This browser does not support notifications.');
      setNotificationPermission('unsupported');
      return false;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);

    if (permission !== 'granted') {
      setReminderStatus('Notifications are blocked for Murmur.');
      return false;
    }

    setReminderStatus('Notifications are enabled.');
    return true;
  };

  const updateDailyReminder = async (dailyEnabled: boolean) => {
    if (dailyEnabled && notificationPermission !== 'granted') {
      const didGrantPermission = await requestReminderPermission();

      if (!didGrantPermission) {
        return;
      }
    }

    const nextSettings = {
      ...reminderSettings,
      dailyEnabled,
    };

    saveReminderSettings(nextSettings);
    setReminderSettings(nextSettings);
    setReminderStatus(
      dailyEnabled
        ? `Daily reminders set for ${nextSettings.dailyTime}.`
        : 'Daily reminders are off.',
    );
  };

  const updateReminderTime = (dailyTime: string) => {
    const nextSettings = {
      ...reminderSettings,
      dailyTime,
    };

    saveReminderSettings(nextSettings);
    setReminderSettings(nextSettings);

    if (nextSettings.dailyEnabled) {
      setReminderStatus(`Daily reminders set for ${dailyTime}.`);
    }
  };

  const sendTestReminder = async () => {
    if (notificationPermission !== 'granted') {
      const didGrantPermission = await requestReminderPermission();

      if (!didGrantPermission) {
        return;
      }
    }

    const idea = getReminderSeriesIdea();
    const didNotify = showBrowserNotification(
      'Murmur reminder test',
      `${idea.series}: ${idea.prompt}`,
    );

    setReminderStatus(
      didNotify
        ? 'Test notification sent.'
        : 'Notifications are not available right now.',
    );
  };

  // ── Sia storage ───────────────────────────────────────────────────────────

  const connectSiaStorage = async () => {
    setIsSiaBusy(true);
    setSiaStatus('Opening storage approval flow...');
    setSiaApprovalUrl('');
    setSiaRecoveryPhrase('');

    try {
      const result = await connectSia(siaRecoveryPhraseToUse, (url) => {
        setSiaApprovalUrl(url);
        setSiaStatus('Approve Murmur storage, then return here.');
        window.open(url, '_blank', 'noopener,noreferrer');
      });
      const records = await listSiaBackups();

      setIsSiaConnected(true);
      setSiaRecoveryPhrase(result.recoveryPhrase);
      setLatestSiaBackup(records[0] ?? getStoredSiaBackup());
      setSiaStatus(
        siaRecoveryPhraseToUse.trim()
          ? 'Connected with your recovery phrase.'
          : 'Connected. Save the recovery phrase shown below before relying on cloud restore.',
      );
    } catch (siaError) {
      setSiaStatus(
        siaError instanceof Error
          ? siaError.message
          : 'Unable to connect storage.',
      );
    } finally {
      setIsSiaBusy(false);
    }
  };

  const uploadCloudBackup = async () => {
    if (!docs.length) {
      setSiaStatus('Add a note before syncing.');
      return;
    }

    try {
      await syncMemosToSia(docs, 'All notes are synced.');
    } catch (siaError) {
      setSiaStatus(
        siaError instanceof Error
          ? siaError.message
          : 'Unable to upload backup.',
      );
    }
  };

  const restoreCloudBackup = async () => {
    setIsSiaBusy(true);
    setSiaStatus('Looking for the latest Murmur backup...');

    try {
      const records = await listSiaBackups();
      const record = records[0] ?? latestSiaBackup;

      if (!record) {
        setSiaStatus('No Murmur backups were found for this recovery key.');
        return;
      }

      const backupFile = await downloadSiaBackup(record.objectId);
      await importBackup(backupFile);
      setSiaStatus(`Restored from backup dated ${new Date(record.uploadedAt).toLocaleDateString()}.`);
    } catch {
      setSiaStatus('Unable to restore from cloud backup.');
    } finally {
      setIsSiaBusy(false);
    }
  };

  // ── UI helpers ────────────────────────────────────────────────────────────

  const dismissWelcome = () => {
    localStorage.setItem(WELCOME_DISMISSED_KEY, new Date().toDateString());
    setShowWelcome(false);
  };

  const dismissInstallBanner = () => {
    localStorage.setItem(INSTALL_DISMISSED_KEY, 'true');
    setShowInstallBanner(false);
  };

  const openMenuPanel = (panel: Exclude<MenuPanel, null>) => {
    setActiveMenuPanel((currentPanel) =>
      currentPanel === panel ? null : panel,
    );
  };

  const handleTemplateSelect = (template: (typeof seriesTemplates)[number]) => {
    setActiveTemplate((prev) =>
      prev?.series === template.series ? null : template,
    );
  };

  // ── Loading & lock screens ────────────────────────────────────────────────

  if (!isPrivacyReady) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <Logo size="small" />
          <h1>Loading</h1>
          <p>Checking privacy settings…</p>
        </section>
      </main>
    );
  }

  if (isLocked) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <Logo size="small" />
          <h1>Locked</h1>
          <p>
            Unlock to view your recordings.
          </p>
          {privacyStatus.passcodeEnabled ? (
            <form
              className="lock-form"
              onSubmit={(event) => {
                event.preventDefault();
                void unlockWithPasscode();
              }}
            >
              <label>
                <span>Passcode</span>
                <input
                  autoComplete="current-password"
                  type="password"
                  value={unlockPasscode}
                  onChange={(event) => setUnlockPasscode(event.target.value)}
                />
              </label>
              <button className="primary-button" type="submit">
                Unlock
              </button>
            </form>
          ) : null}
          {privacyStatus.biometricEnabled ? (
            <button
              className="secondary-button"
              onClick={() => void unlockWithBiometric()}
            >
              Use fingerprint / biometrics
            </button>
          ) : null}
          {privacyMessage ? (
            <p className="utility-status" role="alert">
              {privacyMessage}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  if (!isSiaReady) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <Logo size="small" />
          <h1>Connecting</h1>
          <p>Preparing your secure storage…</p>
        </section>
      </main>
    );
  }

  if (!isSiaConnected) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <Logo size="small" />
          <h1>Set up storage</h1>
          <p>
            Connect your Sia vault before recording. Paste a recovery phrase
            to restore an existing vault, or leave blank to create a new one.
          </p>
          <label>
            <span>Recovery phrase</span>
            <textarea
              className="compact-textarea"
              placeholder="Paste your saved phrase to restore, or leave blank to create a new storage identity."
              value={siaRecoveryPhraseToUse}
              onChange={(event) =>
                setSiaRecoveryPhraseToUse(event.target.value)
              }
            />
          </label>
          <button
            className="primary-button"
            disabled={isSiaBusy}
            onClick={() => void connectSiaStorage()}
          >
            {isSiaBusy ? 'Waiting for approval...' : 'Set up storage'}
          </button>
          {siaApprovalUrl ? (
            <p className="utility-status">
              Approval page:{' '}
              <a href={siaApprovalUrl} target="_blank" rel="noreferrer">
                Open approval
              </a>
            </p>
          ) : null}
          {siaRecoveryPhrase ? (
            <div className="recovery-phrase" role="status">
              <span>Save this recovery phrase:</span>
              <code>{siaRecoveryPhrase}</code>
            </div>
          ) : null}
          {siaStatus ? (
            <p className="utility-status" role="status">
              {siaStatus}
            </p>
          ) : null}
        </section>
      </main>
    );
  }

  // ── New Note ─────────────────────────────────────────────────────────────

  const createNewNote = async (inFolderId?: string) => {
    const now = new Date();
    const iso = now.toISOString();
    const targetFolder = inFolderId ?? pendingFolderId ?? undefined;
    if (!inFolderId) setPendingFolderId(null);
    const doc: MurmurDoc = {
      id: crypto.randomUUID(),
      title: '',
      icon: '📝',
      tags: [],
      folderId: targetFolder,
      notes: '',
      starred: false,
      pinned: false,
      archived: false,
      createdAt: iso,
      updatedAt: iso,
    };

    const saved = await saveDoc(doc);
    setDocs((prev) => sortDocsByPinnedThenNewest([saved, ...prev]));
    setDrafts((prev) => ({
      ...prev,
      [saved.id]: { title: '', icon: '📝', tags: [], notes: '' },
    }));
    setSelectedDocId(saved.id);
  };

  // ── Folder management ─────────────────────────────────────────────────────

  const createFolder = async (name: string, parentId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const folder: MurmurFolder = {
      id: crypto.randomUUID(),
      name: trimmed,
      icon: '📁',
      parentId: parentId ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveFolder(folder);
    const nextFolders = await getAllFolders();
    setFolders(nextFolders);
    setExpandedFolders((prev) => new Set([...prev, ...(parentId ? [parentId] : []), folder.id]));
    setShowNewFolderInput(false);
    setNewFolderName('');
    setNewFolderParentId(null);
  };

  const removeFolder = async (id: string) => {
    await deleteFolder(id);
    const [nextFolders, nextDocs] = await Promise.all([getAllFolders(), getAllDocs()]);
    setFolders(nextFolders);
    setDocs(nextDocs);
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const isFolderDescendant = (folderId: string, ancestorId: string): boolean => {
    let current = folders.find((f) => f.id === folderId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = folders.find((f) => f.id === current!.parentId);
    }
    return false;
  };

  const moveFolderToParent = async (folderId: string, parentId: string | undefined) => {
    if (folderId === parentId) return;
    if (parentId && isFolderDescendant(parentId, folderId)) return;
    const updated = await updateFolder(folderId, { parentId });
    setFolders((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    if (parentId) {
      setExpandedFolders((prev) => new Set([...prev, parentId]));
    }
  };

  const moveDocToFolder = async (docId: string, folderId: string | undefined) => {
    const updated = await updateDoc(docId, { folderId });
    setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    setFolderPickerDocId(null);
    setDraggedDocId(null);
    setDragOverTarget(null);
    if (folderId) {
      setExpandedFolders((prev) => new Set([...prev, folderId]));
    }
  };

  const handleDropOnFolder = (folderId: string, payload: string, payloadType: 'doc' | 'folder') => {
    if (payloadType === 'doc') {
      void moveDocToFolder(payload, folderId);
    } else {
      void moveFolderToParent(payload, folderId);
    }
  };

  const handleDropOnRoot = (payload: string, payloadType: 'doc' | 'folder') => {
    if (payloadType === 'doc') {
      void moveDocToFolder(payload, undefined);
    } else {
      void moveFolderToParent(payload, undefined);
    }
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Main app ──────────────────────────────────────────────────────────────

  const getSidebarProps = (closeDrawer: boolean) => ({
    workspaceName: 'murmur',
    collapsed: false,
    closeDrawer,
    onCloseDrawer: closeDrawer ? () => setMobileNavOpen(false) : undefined,
    query,
    onQueryChange: setQuery,
    favorites: sidebarFavorites,
    recents: sidebarRecents,
    workspaceTree: sidebarWorkspaceTree,
    searchResults: sidebarSearchResults,
    isSearchActive,
    expandedIds: expandedFolders,
    onToggleExpand: toggleFolder,
    selectedDocId,
    onSelectDoc: setSelectedDocId,
    onSelectHome: () => setSelectedDocId(null),
    isLoading,
    showArchived,
    archivedCount,
    onToggleArchived: () => { setShowArchived((v) => !v); setQuery(''); },
    draggedDocId,
    dragOverTarget,
    onDragStartDoc: setDraggedDocId,
    onDragEnd: () => { setDraggedDocId(null); setDragOverTarget(null); },
    onDragOverFolder: setDragOverTarget,
    onDropOnFolder: handleDropOnFolder,
    onDropOnRoot: handleDropOnRoot,
    onCreateNote: (folderId?: string) => { void createNewNote(folderId); },
    onCreateRecord: (folderId?: string) => {
      setPendingFolderId(folderId ?? null);
      setSelectedDocId(null);
      if (closeDrawer) setMobileNavOpen(false);
    },
    onCreateFolder: (name: string, parentId?: string) => { void createFolder(name, parentId); },
    onDeleteFolder: (id: string) => { void removeFolder(id); },
    onDeleteDoc: (docId: string) => {
      const doc = docs.find((d) => d.id === docId);
      if (doc) void removeDoc(doc);
    },
    onToggleStar: (docId: string, starred: boolean) => {
      void updateDoc(docId, { starred }).then((u) =>
        setDocs((prev) => sortDocsByPinnedThenNewest(prev.map((d) => d.id === u.id ? u : d))),
      );
    },
    showNewFolderInput,
    newFolderName,
    newFolderParentId,
    onShowNewFolderInput: (show: boolean, parentId?: string | null) => {
      setShowNewFolderInput(show);
      setNewFolderParentId(parentId ?? null);
      if (!show) setNewFolderName('');
    },
    onNewFolderNameChange: setNewFolderName,
    onOpenPanel: (panel: 'insights' | 'storage' | 'privacy' | 'settings') => {
      openMenuPanel(panel);
      if (closeDrawer) setMobileNavOpen(false);
    },
    isSyncing: isSiaSyncing || isSiaBusy,
  });

  return (
    <div className={`app-root${sidebarCollapsed ? ' app-root-sidebar-collapsed' : ''}`}>
      {/* Mobile nav overlay */}
      {mobileNavOpen && (
        <div
          className="mobile-nav-overlay"
          role="presentation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Mobile nav drawer */}
      <div className={`mobile-nav-drawer${mobileNavOpen ? ' open' : ''}`} aria-label="Navigation drawer">
        <WorkspaceSidebar {...getSidebarProps(true)} />
      </div>

      {/* Left sidebar — workspace tree (desktop) */}
      <nav className="nav-sidebar" aria-label="Sidebar navigation">
        <WorkspaceSidebar
          {...getSidebarProps(false)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
        />
      </nav>

      {/* Center main panel */}
      <main className="main-panel">
        {/* Mobile header */}
        <header className="mobile-header">
          <button
            className="mobile-menu-btn"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <span /><span /><span />
          </button>
          <div className="brand-lockup">
            <Logo size="small" />
            <span className="brand-name">murmur</span>
          </div>
          <div className="header-actions">
            {(isSiaSyncing || isSiaBusy) && (
              <span className="sync-indicator syncing" aria-label="Syncing" title="Syncing…" />
            )}
          </div>
        </header>

        {showInstallBanner && <InstallBanner onDismiss={dismissInstallBanner} />}

        {selectedDoc ? (
          /* ── Doc detail panel ─────────────────────────────────────────────── */
          (() => {
            const draft = drafts[selectedDoc.id] ?? {
              title: selectedDoc.title,
              icon: selectedDoc.icon,
              tags: selectedDoc.tags ?? [],
              notes: selectedDoc.notes,
            };
            const hasTitleChange =
              draft.title !== selectedDoc.title ||
              JSON.stringify(draft.tags) !== JSON.stringify(selectedDoc.tags);

            const addTag = (tag: string) => {
              const t = tag.trim();
              if (!t || draft.tags.includes(t)) return;
              updateDraft(selectedDoc.id, 'tags', [...draft.tags, t] as unknown as string);
            };

            const removeTag = (tag: string) => {
              updateDraft(selectedDoc.id, 'tags', draft.tags.filter((t) => t !== tag) as unknown as string);
            };

            return (
              <article className="doc-detail-panel">
                <div className="doc-detail-header">
                  <div className="doc-detail-title-row">
                    <span className="doc-icon-badge" aria-hidden="true">
                      {draft.icon || (selectedDoc.blob ? '🎙️' : '📝')}
                    </span>
                    <input
                      className="doc-title-input"
                      value={draft.title}
                      placeholder="Untitled"
                      onChange={(e) => updateDraft(selectedDoc.id, 'title', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveDraft(selectedDoc);
                      }}
                    />
                    <button
                      className={`doc-star-btn${selectedDoc.starred ? ' active' : ''}`}
                      title={selectedDoc.starred ? 'Remove from favorites' : 'Add to favorites'}
                      onClick={() => void updateDoc(selectedDoc.id, { starred: !selectedDoc.starred }).then((u) =>
                        setDocs((prev) => sortDocsByPinnedThenNewest(prev.map((d) => d.id === u.id ? u : d)))
                      )}
                    >
                      {selectedDoc.starred ? '⭐' : '☆'}
                    </button>
                    <button
                      className="text-danger-button"
                      onClick={() => setSelectedDocId(null)}
                      aria-label="Close"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="doc-detail-meta">
                    <time dateTime={selectedDoc.updatedAt} className="doc-time">
                      {formatDocTime(selectedDoc.updatedAt)}
                    </time>
                    {selectedDoc.durationMs != null && (
                      <span className="duration-pill">{formatDuration(selectedDoc.durationMs)}</span>
                    )}
                  </div>

                  {/* Tags */}
                  <div className="doc-tags-row">
                    {draft.tags.map((tag) => (
                      <span key={tag} className="doc-tag-pill">
                        {tag}
                        <button
                          className="doc-tag-remove"
                          aria-label={`Remove tag ${tag}`}
                          onClick={() => removeTag(tag)}
                        >×</button>
                      </span>
                    ))}
                    <input
                      className="doc-tag-input"
                      placeholder="+ tag"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addTag(e.currentTarget.value);
                          e.currentTarget.value = '';
                        }
                      }}
                      onBlur={(e) => {
                        if (e.target.value.trim()) {
                          addTag(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>

                  {/* Default tag quick-picks (shown when no tags set) */}
                  {draft.tags.length === 0 && (
                    <div className="default-tags-row">
                      {seriesTemplates.map((t) => (
                        <button
                          key={t.series}
                          className="default-tag-chip"
                          type="button"
                          onClick={() => {
                            updateDraft(selectedDoc.id, 'tags', [t.series] as unknown as string);
                            if (!draft.icon) updateDraft(selectedDoc.id, 'icon', t.emoji);
                          }}
                        >
                          {t.emoji} {t.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Folder picker */}
                  <div className="doc-folder-row">
                    <span className="doc-folder-label">
                      {selectedDoc.folderId
                        ? `📁 ${folders.find((f) => f.id === selectedDoc.folderId)?.name ?? 'Unknown folder'}`
                        : '📂 No folder'}
                    </span>
                    <button
                      className="doc-folder-btn"
                      onClick={() => setFolderPickerDocId(
                        folderPickerDocId === selectedDoc.id ? null : selectedDoc.id
                      )}
                    >
                      {folderPickerDocId === selectedDoc.id ? 'Cancel' : 'Move'}
                    </button>
                    {folderPickerDocId === selectedDoc.id && (
                      <div className="folder-picker-dropdown">
                        <button
                          className="folder-picker-option"
                          onClick={() => void moveDocToFolder(selectedDoc.id, undefined)}
                        >
                          📂 No folder (unfiled)
                        </button>
                        {folders.map((f) => (
                          <button
                            key={f.id}
                            className={`folder-picker-option${selectedDoc.folderId === f.id ? ' folder-picker-active' : ''}`}
                            onClick={() => void moveDocToFolder(selectedDoc.id, f.id)}
                          >
                            {f.icon} {f.name}
                          </button>
                        ))}
                        {folders.length === 0 && (
                          <p className="folder-picker-empty">No folders yet — create one in the sidebar.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {hasTitleChange && (
                    <button
                      className="primary-button doc-save-btn"
                      onClick={() => void saveDraft(selectedDoc)}
                    >
                      Save
                    </button>
                  )}
                </div>

                {isAudioDoc(selectedDoc) && <MemoAudio memo={selectedDoc} />}

                <div className="doc-editor-area">
                  <NoteEditor
                    content={draft.notes}
                    onChange={(html) => void saveNotesAuto(selectedDoc.id, html)}
                    placeholder="Write notes, thoughts, follow-ups…"
                    autoFocus={!selectedDoc.blob}
                  />
                </div>

                <div className="doc-detail-actions">
                  {isAudioDoc(selectedDoc) && (
                    <button
                      className="secondary-button"
                      onClick={() => void shareDoc(selectedDoc)}
                    >
                      Share
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    onClick={() => void toggleArchiveDoc(selectedDoc)}
                  >
                    {selectedDoc.archived ? 'Unarchive' : 'Archive'}
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => void removeDoc(selectedDoc)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })()
        ) : (
          /* ── Recorder ─────────────────────────────────────────────────────── */
          <div className="recorder-view">
            {showWelcome && (
              <div className="welcome-card" aria-label="Welcome">
                <div>
                  <h2>Tap the mic. Catch the thought.</h2>
                  <p className="panel-copy">Tag and annotate after. Just speak first.</p>
                </div>
                <button className="text-danger-button" onClick={dismissWelcome}>Dismiss</button>
              </div>
            )}

            <section className="template-section" aria-label="Recording templates">
              <div className="template-scroll">
                {seriesTemplates.map((template) => (
                  <button
                    key={template.series}
                    className={`template-chip${activeTemplate?.series === template.series ? ' template-chip-active' : ''}`}
                    type="button"
                    title={template.prompt}
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <span>{template.emoji}</span>
                    <span>{template.label}</span>
                  </button>
                ))}
              </div>
              {activeTemplate && <p className="template-prompt">{activeTemplate.prompt}</p>}
            </section>

            <section className="recorder-panel" aria-labelledby="recorder-title">
              <h2 id="recorder-title" className="sr-only">Recorder</h2>
              <div className="record-hero">
                <div
                  className={`waveform-ring${recordingState === 'recording' ? ' waveform-active' : ''}`}
                  aria-hidden="true"
                >
                  {Array.from({ length: 12 }).map((_, i) => <span key={i} />)}
                </div>
                <button
                  className={`mic-button mic-${recordingState}`}
                  aria-label={recordingState === 'idle' ? 'Start recording' : 'Save recording'}
                  onClick={handleMicButtonClick}
                >
                  <span className="mic-icon" aria-hidden="true">🎙️</span>
                  <span>{recordingState === 'idle' ? 'record' : 'save'}</span>
                </button>
              </div>

              <div className="recording-footer">
                <div className="timer" aria-live="polite">{formatDuration(recordingMs)}</div>
                {recordingState !== 'idle' && (
                  <div className="recording-controls">
                    {recordingState === 'recording' ? (
                      <button className="secondary-button" onClick={pauseRecording}>Pause</button>
                    ) : (
                      <button className="secondary-button" onClick={resumeRecording}>Resume</button>
                    )}
                  </div>
                )}
              </div>

              <p className="recorder-status">
                <span className={`status-dot status-${recordingState}`} />
                <span className="prompt-text">
                  {recordingState === 'idle'
                    ? (activeTemplate?.prompt ?? recorderPrompt)
                    : recordingState === 'paused'
                      ? 'Paused — save it or keep going.'
                      : 'Recording…'}
                </span>
              </p>

              {/* Live transcript preview */}
              {recordingState !== 'idle' && liveTranscript && (
                <p className="live-transcript" aria-live="polite">
                  {liveTranscript}
                </p>
              )}
            </section>
          </div>
        )}

        {error && <div className="error-banner" role="alert">{error}</div>}

        {/* Settings / Insights / Storage / Privacy drawer */}
        {activeMenuPanel ? (
          <div
            className="settings-drawer-backdrop"
            role="presentation"
            onClick={() => setActiveMenuPanel(null)}
          >
            <aside
              className="settings-drawer"
              aria-label="Menu panel"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="menu-panel-heading">
              <p className="eyebrow">
                {activeMenuPanel === 'settings'
                  ? 'Settings'
                  : activeMenuPanel === 'insights'
                    ? 'Insights'
                    : activeMenuPanel === 'storage'
                      ? 'Storage & restore'
                      : 'Privacy'}
              </p>
              <button
                className="text-danger-button"
                onClick={() => setActiveMenuPanel(null)}
              >
                Close
              </button>
            </div>

            {activeMenuPanel === 'settings' ? (
              <article className="utility-card">
                <div className="section-heading">
                  <h2>App settings</h2>
                  <p className="panel-copy">
                    Quick status without crowding the recorder.
                  </p>
                </div>
                <div className="privacy-status-list">
                  <span>{activeDocCount} active notes</span>
                  <span>{formatDuration(totalDurationMs)} total audio</span>
                  <span>
                    Sync:{' '}
                    {isSiaSyncing
                      ? 'In progress'
                      : latestSiaBackup
                        ? 'Current'
                        : 'Waiting for first recording'}
                  </span>
                </div>
                <div className="utility-actions">
                  <button
                    className="secondary-button"
                    disabled={isSiaBusy || isSiaSyncing}
                    onClick={() => void uploadCloudBackup()}
                  >
                    Sync now
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!canLockApp}
                    onClick={() => setIsLocked(true)}
                  >
                    Lock app
                  </button>
                </div>
                <div className="reminder-settings">
                  <div className="section-heading">
                    <h3>Recording reminders</h3>
                    <p className="panel-copy">
                      Get a daily nudge to record. Murmur also warns you if
                      you leave with an unsaved recording in progress.
                    </p>
                  </div>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={reminderSettings.dailyEnabled}
                      onChange={(event) =>
                        void updateDailyReminder(event.target.checked)
                      }
                    />
                    <span>Daily recording reminder</span>
                  </label>
                  <label>
                    <span>Reminder time</span>
                    <input
                      type="time"
                      value={reminderSettings.dailyTime}
                      onChange={(event) =>
                        updateReminderTime(event.target.value)
                      }
                    />
                  </label>
                  <div className="utility-actions">
                    <button
                      className="secondary-button"
                      onClick={() => void requestReminderPermission()}
                    >
                      Enable notifications
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() => void sendTestReminder()}
                    >
                      Send test
                    </button>
                  </div>
                  <div className="privacy-status-list">
                    <span>Permission: {notificationPermission}</span>
                  </div>
                  {reminderStatus ? (
                    <p className="utility-status" role="status">
                      {reminderStatus}
                    </p>
                  ) : null}
                </div>
                {siaStatus ? (
                  <p className="utility-status" role="status">
                    {siaStatus}
                  </p>
                ) : null}
              </article>
            ) : null}

            {activeMenuPanel === 'insights' ? (
              <article className="utility-card">
                <div className="section-heading">
                  <h2>Your insights</h2>
                  <p className="panel-copy">
                    Private analytics — computed locally, never sent anywhere.
                  </p>
                </div>
                <InsightsPanel memos={docs} />
              </article>
            ) : null}

            {activeMenuPanel === 'storage' ? (
              <article className="utility-card">
                <div className="section-heading">
                  <h2>Storage & restore</h2>
                  <p className="panel-copy">
                    Recording changes sync automatically. Use these controls
                    only when you need a manual export or restore.
                  </p>
                </div>
                <div className="privacy-status-list">
                  <span>Storage: Connected</span>
                  <span>
                    Latest snapshot:{' '}
                    {latestSiaBackup
                      ? new Date(
                          latestSiaBackup.uploadedAt,
                        ).toLocaleDateString()
                      : 'None'}
                  </span>
                  {latestSiaBackup ? (
                    <span>{latestSiaBackup.memoCount} memos in cloud</span>
                  ) : null}
                </div>
                <div className="utility-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void exportBackup()}
                  >
                    Export backup
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => backupInputRef.current?.click()}
                  >
                    Restore file
                  </button>
                  <button
                    className="secondary-button"
                    disabled={isSiaBusy || isSiaSyncing}
                    onClick={() => void restoreCloudBackup()}
                  >
                    Restore from cloud
                  </button>
                  <input
                    ref={backupInputRef}
                    className="file-input"
                    type="file"
                    accept="application/json,.json"
                    onChange={(event) =>
                      void importBackup(event.target.files?.[0])
                    }
                  />
                </div>
                {latestSiaBackup ? (
                  <p className="utility-status">
                    Backup ID: <code>{latestSiaBackup.objectId}</code>
                  </p>
                ) : null}
                {backupStatus ? (
                  <p className="utility-status" role="status">
                    {backupStatus}
                  </p>
                ) : null}
                {siaStatus ? (
                  <p className="utility-status" role="status">
                    {siaStatus}
                  </p>
                ) : null}
              </article>
            ) : null}

            {activeMenuPanel === 'privacy' ? (
              <article className="utility-card">
                <div className="section-heading">
                  <h2>App lock</h2>
                  <p className="panel-copy">
                    Add a passcode and optional device biometrics to keep
                    casual access out of Murmur on this browser.
                  </p>
                </div>
                <div className="privacy-status-list">
                  <span>
                    Passcode:{' '}
                    {privacyStatus.passcodeEnabled ? 'Enabled' : 'Not enabled'}
                  </span>
                  <span>
                    Biometrics:{' '}
                    {privacyStatus.biometricEnabled
                      ? 'Enabled'
                      : privacyStatus.biometricAvailable
                        ? 'Available'
                        : 'Unavailable'}
                  </span>
                </div>
                <div className="passcode-grid">
                  <label>
                    <span>New passcode</span>
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={setupPasscodeValue}
                      onChange={(event) =>
                        setSetupPasscodeValue(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>Confirm passcode</span>
                    <input
                      autoComplete="new-password"
                      type="password"
                      value={setupPasscodeConfirm}
                      onChange={(event) =>
                        setSetupPasscodeConfirm(event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="utility-actions">
                  <button
                    className="secondary-button"
                    onClick={() => void savePasscode()}
                  >
                    Save passcode
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!privacyStatus.biometricAvailable}
                    onClick={() => void enableBiometric()}
                  >
                    Enable fingerprint / biometrics
                  </button>
                  <button
                    className="secondary-button"
                    disabled={!canLockApp}
                    onClick={() => setIsLocked(true)}
                  >
                    Lock now
                  </button>
                  <button
                    className="text-danger-button"
                    disabled={!canLockApp}
                    onClick={() => void disablePrivacy()}
                  >
                    Disable lock
                  </button>
                </div>

                <label className="toggle-row" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={autoLockEnabled}
                    disabled={!canLockApp}
                    onChange={(event) => toggleAutoLock(event.target.checked)}
                  />
                  <span>Auto-lock when app goes to background</span>
                </label>

                {/* Privacy dashboard */}
                <div className="privacy-dashboard">
                  <p className="insights-section-label">What Murmur stores</p>
                  <div className="privacy-data-rows">
                    <div className="privacy-data-row">
                      <span className="privacy-data-icon">📱</span>
                      <div>
                        <strong>On this device</strong>
                        <p>
                          All recordings (IndexedDB), settings, passcode hash,
                          biometric key, reminder preferences.
                        </p>
                      </div>
                    </div>
                    <div className="privacy-data-row">
                      <span className="privacy-data-icon">☁️</span>
                      <div>
                        <strong>Sia (your vault)</strong>
                        <p>
                          Encrypted backup of your recordings. Only accessible
                          with your recovery phrase. Murmur's servers cannot
                          read this.
                        </p>
                      </div>
                    </div>
                    <div className="privacy-data-row">
                      <span className="privacy-data-icon">🔑</span>
                      <div>
                        <strong>Supabase (account only)</strong>
                        <p>
                          Your email address and hashed password for sign-in.
                          No recordings, no notes, no metadata.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {privacyMessage ? (
                  <p className="utility-status" role="status">
                    {privacyMessage}
                  </p>
                ) : null}

                <button
                  className="danger-button"
                  style={{ marginTop: 8 }}
                  onClick={() => void panicWipe()}
                >
                  Panic wipe — erase all local data
                </button>
              </article>
            ) : null}
            </aside>
          </div>
        ) : null}
      </main>
    </div>
  );
}
