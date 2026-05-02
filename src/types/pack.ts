export type PackKind = 'pack' | 'project';

export interface ProjectFolderMeta {
  title: string;
  keyNote: string | null;
  keyScale: string | null;
  altKeyNote: string | null;
  altKeyScale: string | null;
  bpm: number | null;
  /** ISO 8601 date string, YYYY-MM-DD. */
  deadline: string | null;
}

export interface Pack {
  id: string;
  name: string;
  rootPath: string;
  vendor: string | null;
  genre: string | null;
  color: string | null;
  assetCount: number;
  addedAt: number;
  updatedAt: number;
  kind: PackKind;
  projectMeta: ProjectFolderMeta | null;
}

export interface WatchedFolder {
  id: string;
  path: string;
  isActive: boolean;
  addedAt: number;
  kind: PackKind;
}

export interface ScanStats {
  totalFiles: number;
  skipped: number;
  durationMs: number;
}

export interface ScanProgress {
  total: number;
  indexed: number;
  queued: number;
  isScanning: boolean;
}

export interface ReconcileReport {
  newFiles: number;
  missingFiles: number;
  durationMs: number;
  packsRemoved: number;
}

export interface CleanCacheReport {
  missingDeleted: number;
  packsDeleted: number;
}

export interface HardCleanReport {
  assetsDeleted: number;
  packsDeleted: number;
}

export interface FolderInfo {
  path: string;
  totalSizeBytes: number;
  fileCount: number;
  assetCount: number;
}

export interface CategoryStat {
  count: number;
  sizeBytes: number;
}

export interface SubfolderSummary {
  name: string;
  path: string;
  fileCount: number;
  sizeBytes: number;
}

export interface ProjectInfo {
  path: string;
  totalSizeBytes: number;
  fileCount: number;
  audio: CategoryStat;
  midi: CategoryStat;
  preset: CategoryStat;
  project: CategoryStat;
  video: CategoryStat;
  image: CategoryStat;
  other: CategoryStat;
  backupCount: number;
  backupSizeBytes: number;
  subfolders: SubfolderSummary[];
}

export interface TreeNode {
  name: string;
  path: string;
  assetCount: number;
  children: TreeNode[];
}
