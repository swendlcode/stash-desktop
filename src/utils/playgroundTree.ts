import type { TreeNode } from '../types';

export const PLAYGROUND_MOVES_KEY = 'stack.playground.folderMoves.v1';
export const PLAYGROUND_ROOT = '__PLAYGROUND_ROOT__';

export type MovesMap = Record<string, string>;

export function readPlaygroundMoves(): MovesMap {
  try {
    const raw = localStorage.getItem(PLAYGROUND_MOVES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as MovesMap;
  } catch {
    // ignore bad local state
  }
  return {};
}

export function buildPlaygroundTree(sourceRoots: TreeNode[], moves: MovesMap): TreeNode[] {
  const originalParent = new Map<string, string | null>();
  const sourceNode = new Map<string, TreeNode>();
  const order: string[] = [];

  const walk = (node: TreeNode, parentPath: string | null) => {
    originalParent.set(node.path, parentPath);
    sourceNode.set(node.path, node);
    order.push(node.path);
    node.children.forEach((child) => walk(child, node.path));
  };
  sourceRoots.forEach((root) => walk(root, null));

  const resolvedParent = new Map<string, string | null>();
  const resolveParent = (path: string): string | null => {
    if (resolvedParent.has(path)) return resolvedParent.get(path) ?? null;
    const fallback = originalParent.get(path) ?? null;
    const candidate = moves[path];
    if (!candidate || candidate === path) {
      resolvedParent.set(path, fallback);
      return fallback;
    }
    if (candidate === PLAYGROUND_ROOT) {
      resolvedParent.set(path, null);
      return null;
    }
    if (!sourceNode.has(candidate)) {
      resolvedParent.set(path, fallback);
      return fallback;
    }

    // Prevent cycles in virtual structure.
    let cursor: string | null = candidate;
    const seen = new Set<string>([path]);
    while (cursor) {
      if (seen.has(cursor)) {
        resolvedParent.set(path, fallback);
        return fallback;
      }
      seen.add(cursor);
      if (cursor === PLAYGROUND_ROOT) {
        cursor = null;
      } else if (resolvedParent.has(cursor)) {
        cursor = resolvedParent.get(cursor) ?? null;
      } else {
        cursor = moves[cursor] ?? originalParent.get(cursor) ?? null;
      }
    }

    resolvedParent.set(path, candidate);
    return candidate;
  };

  const cloneNode = new Map<string, TreeNode>();
  for (const path of order) {
    const src = sourceNode.get(path);
    if (!src) continue;
    cloneNode.set(path, { ...src, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const path of order) {
    const node = cloneNode.get(path);
    if (!node) continue;
    const parent = resolveParent(path);
    if (!parent) {
      roots.push(node);
      continue;
    }
    const parentNode = cloneNode.get(parent);
    if (parentNode) parentNode.children.push(node);
    else roots.push(node);
  }

  return roots;
}
