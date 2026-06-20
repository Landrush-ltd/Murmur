/** A folder that groups documents together — supports nesting via parentId. */
export interface MurmurFolder {
  id: string;
  name: string;
  icon: string;       // emoji
  parentId?: string;  // undefined = root-level folder
  createdAt: string;
  updatedAt: string;
}

/** Recursive tree node consumed by the workspace sidebar. */
export interface SidebarTreeNode {
  id: string;
  title: string;
  icon: string;
  type: 'folder' | 'item';
  isExpanded?: boolean;
  children?: SidebarTreeNode[];
  /** Present on item nodes — links back to MurmurDoc */
  docId?: string;
  /** Present on folder nodes — links back to MurmurFolder */
  folderId?: string;
  updatedAt?: string;
}

/** A document in Murmur — may contain audio, rich-text notes, or both. */
export interface MurmurDoc {
  id: string;
  title: string;
  icon: string;       // emoji prefix, '' = none
  tags: string[];     // replaces single series field
  folderId?: string;  // optional folder reference
  notes: string;      // HTML from Tiptap editor
  starred: boolean;   // shown in Favorites section
  pinned: boolean;    // legacy compat / sorted first
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  // ── Audio (optional — absent on text-only notes) ──────────────────────────
  blob?: Blob;
  durationMs?: number;
  mimeType?: string;
  size?: number;
  // ── Transcription ────────────────────────────────────────────────────────
  transcript?: string;  // raw speech-to-text output
}

/** Narrow guard — true when the doc has an audio recording attached. */
export function isAudioDoc(
  doc: MurmurDoc,
): doc is MurmurDoc & {
  blob: Blob;
  durationMs: number;
  mimeType: string;
  size: number;
} {
  return !!doc.blob;
}

/** Fields editable in the detail panel without touching audio data. */
export interface DraftDoc {
  title: string;
  icon: string;
  tags: string[];
  notes: string;
}

// ─── Legacy ───────────────────────────────────────────────────────────────────
/** @deprecated Use MurmurDoc instead. Kept only for migration. */
export interface VoiceMemo {
  id: string;
  title: string;
  series: string;
  notes: string;
  createdAt: string;
  durationMs: number;
  blob: Blob;
  mimeType: string;
  size: number;
  pinned?: boolean;
  archived?: boolean;
}
