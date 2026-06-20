import type { MurmurDoc, MurmurFolder, SidebarTreeNode } from './types';

const RECENTS_LIMIT = 8;

function docIcon(doc: MurmurDoc): string {
  return doc.icon || (doc.blob ? '🎙️' : '📝');
}

function docToNode(doc: MurmurDoc): SidebarTreeNode {
  return {
    id: `doc:${doc.id}`,
    docId: doc.id,
    title: doc.title || 'Untitled',
    icon: docIcon(doc),
    type: 'item',
    updatedAt: doc.updatedAt,
  };
}

/** Build nested folder nodes with their child folders + docs. */
function buildFolderBranch(
  folder: MurmurFolder,
  allFolders: MurmurFolder[],
  docsByFolder: Map<string | undefined, MurmurDoc[]>,
  expandedIds: Set<string>,
): SidebarTreeNode {
  const childFolders = allFolders
    .filter((f) => f.parentId === folder.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const childDocs = (docsByFolder.get(folder.id) ?? []).map(docToNode);

  const children: SidebarTreeNode[] = [
    ...childFolders.map((f) =>
      buildFolderBranch(f, allFolders, docsByFolder, expandedIds),
    ),
    ...childDocs,
  ];

  return {
    id: `folder:${folder.id}`,
    folderId: folder.id,
    title: folder.name,
    icon: folder.icon || '📁',
    type: 'folder',
    isExpanded: expandedIds.has(folder.id),
    children,
  };
}

/** Root workspace tree — top-level folders + unfiled docs. */
export function buildWorkspaceTree(
  folders: MurmurFolder[],
  docs: MurmurDoc[],
  expandedIds: Set<string>,
): SidebarTreeNode[] {
  const docsByFolder = new Map<string | undefined, MurmurDoc[]>();
  for (const doc of docs) {
    const key = doc.folderId;
    docsByFolder.set(key, [...(docsByFolder.get(key) ?? []), doc]);
  }

  const rootFolders = folders
    .filter((f) => !f.parentId)
    .sort((a, b) => a.name.localeCompare(b.name));

  return [
    ...rootFolders.map((f) =>
      buildFolderBranch(f, folders, docsByFolder, expandedIds),
    ),
    ...(docsByFolder.get(undefined) ?? []).map(docToNode),
  ];
}

export function buildFavoritesNodes(docs: MurmurDoc[]): SidebarTreeNode[] {
  return docs
    .filter((d) => d.starred)
    .map(docToNode);
}

export function buildRecentsNodes(docs: MurmurDoc[]): SidebarTreeNode[] {
  return [...docs]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, RECENTS_LIMIT)
    .map(docToNode);
}

/** Flat search results as item nodes. */
export function buildSearchNodes(docs: MurmurDoc[]): SidebarTreeNode[] {
  return docs.map(docToNode);
}

/** Collect all folder ids in a branch (for expand-on-drop). */
export function collectFolderIds(nodes: SidebarTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.type === 'folder' && node.folderId) {
      ids.push(node.folderId);
    }
    if (node.children) {
      ids.push(...collectFolderIds(node.children));
    }
  }
  return ids;
}
