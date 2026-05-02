import { invoke } from '@tauri-apps/api/core';
import type {
  ScanStats,
  ScanProgress,
  ReconcileReport,
  WatchedFolder,
  CleanCacheReport,
  HardCleanReport,
  TreeNode,
  FolderInfo,
  ProjectInfo,
} from '../types';

export const libraryService = {
  scanFolder(path: string): Promise<ScanStats> {
    return invoke('scan_folder', { path });
  },

  addWatchedFolder(path: string): Promise<WatchedFolder> {
    return invoke('add_watched_folder', { path });
  },

  addProjectFolder(path: string): Promise<WatchedFolder> {
    return invoke('add_project_folder', { path });
  },

  removeWatchedFolder(id: string): Promise<void> {
    return invoke('remove_watched_folder', { id });
  },

  getWatchedFolders(): Promise<WatchedFolder[]> {
    return invoke('get_watched_folders');
  },

  getScanProgress(): Promise<ScanProgress> {
    return invoke('get_scan_progress');
  },

  cancelScan(): Promise<void> {
    return invoke('cancel_scan');
  },

  runReconciliation(): Promise<ReconcileReport> {
    return invoke('run_reconciliation');
  },

  cleanCache(): Promise<CleanCacheReport> {
    return invoke('clean_cache');
  },

  hardCleanCache(): Promise<HardCleanReport> {
    return invoke('hard_clean_cache');
  },

  getLibraryTree(): Promise<TreeNode[]> {
    return invoke('get_library_tree');
  },

  getFolderInfo(path: string): Promise<FolderInfo> {
    return invoke('get_folder_info', { path });
  },

  getProjectInfo(path: string): Promise<ProjectInfo> {
    return invoke('get_project_info', { path });
  },

  moveLibraryFolder(fromPath: string, toParentPath: string): Promise<void> {
    return invoke('move_library_folder', { fromPath, toParentPath });
  },
};
