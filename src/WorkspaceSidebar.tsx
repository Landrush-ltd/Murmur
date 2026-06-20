import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from './Logo';
import type { SidebarTreeNode } from './types';

const INDENT_PX = 16;

export interface WorkspaceSidebarProps {
  workspaceName?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  closeDrawer?: boolean;
  onCloseDrawer?: () => void;

  query: string;
  onQueryChange: (q: string) => void;

  favorites: SidebarTreeNode[];
  recents: SidebarTreeNode[];
  workspaceTree: SidebarTreeNode[];
  searchResults: SidebarTreeNode[];
  isSearchActive: boolean;

  expandedIds: Set<string>;
  onToggleExpand: (folderId: string) => void;

  selectedDocId: string | null;
  onSelectDoc: (docId: string | null) => void;
  onSelectHome: () => void;

  isLoading?: boolean;
  showArchived?: boolean;
  archivedCount?: number;
  onToggleArchived?: () => void;

  draggedDocId?: string | null;
  dragOverTarget?: string | null;
  onDragStartDoc: (docId: string) => void;
  onDragEnd: () => void;
  onDragOverFolder: (folderId: string | null) => void;
  onDropOnFolder: (folderId: string, payload: string, payloadType: 'doc' | 'folder') => void;
  onDropOnRoot: (payload: string, payloadType: 'doc' | 'folder') => void;

  onCreateNote: (folderId?: string) => void;
  onCreateRecord: (folderId?: string) => void;
  onCreateFolder: (name: string, parentId?: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onDeleteDoc: (docId: string) => void;
  onToggleStar: (docId: string, starred: boolean) => void;

  showNewFolderInput?: boolean;
  newFolderName?: string;
  newFolderParentId?: string | null;
  onShowNewFolderInput: (show: boolean, parentId?: string | null) => void;
  onNewFolderNameChange: (name: string) => void;

  onOpenPanel: (panel: 'insights' | 'storage' | 'privacy' | 'settings') => void;
  isSyncing?: boolean;
}

type TreeCtx = Omit<
  WorkspaceSidebarProps,
  'favorites' | 'recents' | 'workspaceTree' | 'searchResults' | 'workspaceName' | 'collapsed' | 'onToggleCollapse'
>;

interface TreeRowProps {
  node: SidebarTreeNode;
  depth: number;
  ctx: TreeCtx;
}

function TreeRow({ node, depth, ctx }: TreeRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isFolder = node.type === 'folder';
  const folderId = node.folderId;
  const docId = node.docId;
  const isActive = docId != null && ctx.selectedDocId === docId;
  const isExpanded = isFolder && !!node.isExpanded;
  const isDragOver = isFolder && folderId != null && ctx.dragOverTarget === folderId;
  const isDragging = docId != null && ctx.draggedDocId === docId;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleRowClick = () => {
    if (docId) {
      ctx.onSelectDoc(docId);
      if (ctx.closeDrawer && ctx.onCloseDrawer) ctx.onCloseDrawer();
    } else if (isFolder && folderId) {
      ctx.onToggleExpand(folderId);
    }
  };

  const dragPayload = docId ? `doc:${docId}` : folderId ? `folder:${folderId}` : '';

  return (
    <>
      <div
        className={`ws-tree-row${isActive ? ' ws-tree-row-active' : ''}${isDragOver ? ' ws-tree-drop-target' : ''}${isDragging ? ' ws-tree-row-dragging' : ''}`}
        style={{ paddingLeft: `${8 + depth * INDENT_PX}px` }}
        draggable={!!dragPayload}
        onDragStart={(e) => {
          if (!dragPayload) return;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('application/murmur', dragPayload);
          if (docId) ctx.onDragStartDoc(docId);
        }}
        onDragEnd={ctx.onDragEnd}
        onDragOver={(e) => {
          if (!isFolder || !folderId) return;
          e.preventDefault();
          e.stopPropagation();
          ctx.onDragOverFolder(folderId);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            ctx.onDragOverFolder(null);
          }
        }}
        onDrop={(e) => {
          if (!isFolder || !folderId) return;
          e.preventDefault();
          e.stopPropagation();
          const raw = e.dataTransfer.getData('application/murmur');
          if (!raw) return;
          const [type, id] = raw.split(':') as ['doc' | 'folder', string];
          if (id && id !== folderId) {
            ctx.onDropOnFolder(folderId, id, type);
          }
        }}
      >
        {isFolder ? (
          <button
            type="button"
            className={`ws-tree-caret${isExpanded ? ' ws-tree-caret-open' : ''}`}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            onClick={(e) => {
              e.stopPropagation();
              if (folderId) ctx.onToggleExpand(folderId);
            }}
          >
            ›
          </button>
        ) : (
          <span className="ws-tree-caret-spacer" aria-hidden="true" />
        )}

        <button
          type="button"
          className="ws-tree-row-main"
          onClick={handleRowClick}
          title={node.title}
        >
          <span className="ws-tree-icon" aria-hidden="true">{node.icon}</span>
          <span className="ws-tree-title">{node.title}</span>
        </button>

        <div className="ws-tree-actions">
          <div className="ws-tree-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="ws-tree-action-btn"
              aria-label="More options"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((v) => !v);
              }}
            >
              ···
            </button>
            {menuOpen && (
              <div className="ws-tree-menu" role="menu">
                {isFolder && folderId && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        ctx.onCreateNote(folderId);
                        setMenuOpen(false);
                        if (ctx.closeDrawer && ctx.onCloseDrawer) ctx.onCloseDrawer();
                      }}
                    >
                      New note inside
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        ctx.onShowNewFolderInput(true, folderId);
                        ctx.onToggleExpand(folderId);
                        setMenuOpen(false);
                      }}
                    >
                      New subfolder
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="ws-tree-menu-danger"
                      onClick={() => {
                        void ctx.onDeleteFolder(folderId);
                        setMenuOpen(false);
                      }}
                    >
                      Delete folder
                    </button>
                  </>
                )}
                {docId && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        ctx.onToggleStar(docId, true);
                        setMenuOpen(false);
                      }}
                    >
                      Add to favorites
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="ws-tree-menu-danger"
                      onClick={() => {
                        void ctx.onDeleteDoc(docId);
                        setMenuOpen(false);
                      }}
                    >
                      Delete page
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {isFolder && folderId && (
            <button
              type="button"
              className="ws-tree-action-btn"
              aria-label="Add to folder"
              onClick={(e) => {
                e.stopPropagation();
                ctx.onCreateNote(folderId);
                if (ctx.closeDrawer && ctx.onCloseDrawer) ctx.onCloseDrawer();
              }}
            >
              +
            </button>
          )}
        </div>
      </div>

      {isFolder && isExpanded && node.children && node.children.length > 0 && (
        <div className="ws-tree-children">
          {node.children.map((child) => (
            <TreeRow key={child.id} node={child} depth={depth + 1} ctx={ctx} />
          ))}
        </div>
      )}

      {isFolder && isExpanded && (!node.children || node.children.length === 0) && (
        <p
          className="ws-tree-empty"
          style={{ paddingLeft: `${8 + (depth + 1) * INDENT_PX}px` }}
        >
          Empty — drop pages here or use +
        </p>
      )}
    </>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ws-section">
      <div className="ws-section-header">
        <span className="ws-section-label">{label}</span>
        {action}
      </div>
      <div className="ws-section-body">{children}</div>
    </section>
  );
}

export function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const {
    workspaceName = 'murmur',
    collapsed = false,
    onToggleCollapse,
    closeDrawer = false,
    onCloseDrawer,
    query,
    onQueryChange,
    favorites,
    recents,
    workspaceTree,
    searchResults,
    isSearchActive,
    expandedIds,
    onToggleExpand,
    selectedDocId,
    onSelectDoc,
    onSelectHome,
    isLoading,
    showArchived,
    archivedCount = 0,
    onToggleArchived,
    draggedDocId,
    dragOverTarget,
    onDragStartDoc,
    onDragEnd,
    onDragOverFolder,
    onDropOnFolder,
    onDropOnRoot,
    onCreateNote,
    onCreateRecord,
    onCreateFolder,
    onDeleteFolder,
    onDeleteDoc,
    onToggleStar,
    showNewFolderInput,
    newFolderName = '',
    newFolderParentId,
    onShowNewFolderInput,
    onNewFolderNameChange,
    onOpenPanel,
    isSyncing,
  } = props;

  const treeCtx: TreeCtx = useMemo(
    () => ({
      closeDrawer,
      onCloseDrawer,
      query,
      onQueryChange,
      expandedIds,
      onToggleExpand,
      selectedDocId,
      onSelectDoc,
      onSelectHome,
      isLoading,
      showArchived,
      archivedCount,
      onToggleArchived,
      draggedDocId,
      dragOverTarget,
      onDragStartDoc,
      onDragEnd,
      onDragOverFolder,
      onDropOnFolder,
      onDropOnRoot,
      onCreateNote,
      onCreateRecord,
      onCreateFolder,
      onDeleteFolder,
      onDeleteDoc,
      onToggleStar,
      showNewFolderInput,
      newFolderName,
      newFolderParentId,
      onShowNewFolderInput,
      onNewFolderNameChange,
      onOpenPanel,
      isSyncing,
      isSearchActive,
    }),
    [
      closeDrawer,
      onCloseDrawer,
      query,
      onQueryChange,
      expandedIds,
      onToggleExpand,
      selectedDocId,
      onSelectDoc,
      onSelectHome,
      isLoading,
      showArchived,
      archivedCount,
      onToggleArchived,
      draggedDocId,
      dragOverTarget,
      onDragStartDoc,
      onDragEnd,
      onDragOverFolder,
      onDropOnFolder,
      onDropOnRoot,
      onCreateNote,
      onCreateRecord,
      onCreateFolder,
      onDeleteFolder,
      onDeleteDoc,
      onToggleStar,
      showNewFolderInput,
      newFolderName,
      newFolderParentId,
      onShowNewFolderInput,
      onNewFolderNameChange,
      onOpenPanel,
      isSyncing,
      isSearchActive,
    ],
  );

  const handleRootDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const raw = e.dataTransfer.getData('application/murmur');
      if (!raw) return;
      const [type, id] = raw.split(':') as ['doc' | 'folder', string];
      if (id) onDropOnRoot(id, type);
    },
    [onDropOnRoot],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        onCreateNote();
        if (closeDrawer && onCloseDrawer) onCloseDrawer();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCreateNote, closeDrawer, onCloseDrawer]);

  if (collapsed) {
    return (
      <aside className="ws-sidebar ws-sidebar-collapsed" aria-label="Workspace navigation">
        <button
          type="button"
          className="ws-collapse-btn ws-collapse-expand"
          aria-label="Expand sidebar"
          onClick={onToggleCollapse}
          title="Expand sidebar"
        >
          »
        </button>
        <button type="button" className="ws-rail-btn" title="Home" onClick={onSelectHome}>
          🏠
        </button>
        <button
          type="button"
          className="ws-rail-btn"
          title="New note (Ctrl+O)"
          onClick={() => onCreateNote()}
        >
          ✏️
        </button>
        <button
          type="button"
          className="ws-rail-btn"
          title="Record"
          onClick={() => onCreateRecord()}
        >
          🎙️
        </button>
      </aside>
    );
  }

  return (
    <aside className="ws-sidebar" aria-label="Workspace navigation">
      <header className="ws-header">
        <div className="ws-workspace">
          <Logo size="small" />
          <span className="ws-workspace-name">{workspaceName}</span>
        </div>
        {onToggleCollapse && (
          <button
            type="button"
            className="ws-collapse-btn"
            aria-label="Collapse sidebar"
            onClick={onToggleCollapse}
            title="Collapse sidebar"
          >
            «
          </button>
        )}
        {closeDrawer && onCloseDrawer && (
          <button
            type="button"
            className="ws-drawer-close"
            aria-label="Close navigation"
            onClick={onCloseDrawer}
          >
            ✕
          </button>
        )}
      </header>

      <nav className="ws-quick-nav" aria-label="Quick navigation">
        <div className="ws-search-wrap">
          <span className="ws-quick-icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="ws-search-input"
            placeholder="Search pages…"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search pages"
          />
        </div>
      </nav>

      <div className="ws-scroll" onDragOver={(e) => e.preventDefault()} onDrop={handleRootDrop}>
        {isSearchActive ? (
          <Section label="Results">
            {searchResults.length > 0
              ? searchResults.map((node) => (
                  <TreeRow key={node.id} node={node} depth={0} ctx={treeCtx} />
                ))
              : <p className="ws-empty">No results.</p>}
          </Section>
        ) : (
          <>
            {!showArchived && favorites.length > 0 && (
              <Section label="Favorites">
                {favorites.map((node) => (
                  <TreeRow key={node.id} node={node} depth={0} ctx={treeCtx} />
                ))}
              </Section>
            )}

            {!showArchived && recents.length > 0 && (
              <Section label="Recents">
                {recents.map((node) => (
                  <TreeRow key={node.id} node={node} depth={0} ctx={treeCtx} />
                ))}
              </Section>
            )}

            <Section
              label={showArchived ? 'Archive' : 'Workspace'}
              action={
                archivedCount > 0 && onToggleArchived ? (
                  <button type="button" className="ws-section-action" onClick={onToggleArchived}>
                    {showArchived ? 'Active' : `📦 ${archivedCount}`}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="ws-section-action"
                    onClick={() => onShowNewFolderInput(true, null)}
                  >
                    + Folder
                  </button>
                )
              }
            >
              {showNewFolderInput && (
                <div className="ws-new-folder-row">
                  <input
                    className="ws-new-folder-input"
                    autoFocus
                    placeholder={newFolderParentId ? 'Subfolder name…' : 'Folder name…'}
                    value={newFolderName}
                    onChange={(e) => onNewFolderNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFolderName.trim()) {
                        onCreateFolder(newFolderName, newFolderParentId ?? undefined);
                      }
                      if (e.key === 'Escape') {
                        onShowNewFolderInput(false, null);
                        onNewFolderNameChange('');
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="ws-new-folder-confirm"
                    onClick={() => onCreateFolder(newFolderName, newFolderParentId ?? undefined)}
                  >
                    ✓
                  </button>
                </div>
              )}

              {isLoading ? (
                <p className="ws-empty">Loading…</p>
              ) : workspaceTree.length > 0 ? (
                workspaceTree.map((node) => (
                  <TreeRow key={node.id} node={node} depth={0} ctx={treeCtx} />
                ))
              ) : (
                <p className="ws-empty">
                  {showArchived ? 'No archived pages.' : 'No pages yet — record or create a note.'}
                </p>
              )}
            </Section>
          </>
        )}
      </div>

      <footer className="ws-footer">
        <button
          type="button"
          className="ws-footer-primary"
          onClick={() => {
            onCreateNote();
            if (closeDrawer && onCloseDrawer) onCloseDrawer();
          }}
        >
          <span className="ws-footer-plus">+</span>
          <span className="ws-footer-label">New note</span>
          <kbd className="ws-footer-kbd">Ctrl+O</kbd>
        </button>
        <div className="ws-footer-nav">
          <button type="button" className="ws-footer-link" onClick={() => onOpenPanel('insights')}>
            Insights
          </button>
          <button type="button" className="ws-footer-link" onClick={() => onOpenPanel('storage')}>
            Storage
          </button>
          <button type="button" className="ws-footer-link" onClick={() => onOpenPanel('privacy')}>
            Privacy
          </button>
          <button type="button" className="ws-footer-link" onClick={() => onOpenPanel('settings')}>
            Settings
          </button>
          {isSyncing && (
            <span className="sync-indicator syncing" aria-label="Syncing" title="Syncing…" />
          )}
        </div>
      </footer>
    </aside>
  );
}
