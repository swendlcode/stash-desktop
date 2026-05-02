import { invoke } from '@tauri-apps/api/core';
import type { Asset, ProjectMeta } from '../types';

export class ProjectService {
  /**
   * Open a project file in its associated DAW
   */
  async openProject(project: Asset): Promise<void> {
    try {
      await invoke('open_project_in_daw', { 
        projectPath: project.path 
      });
    } catch (error) {
      console.error('Failed to open project in DAW:', error);
      // Fallback: try to open with system default application
      try {
        await invoke('open_with_default_app', { 
          path: project.path 
        });
      } catch (fallbackError) {
        console.error('Failed to open with default app:', fallbackError);
        throw new Error(`Failed to open project: ${error}`);
      }
    }
  }

  /**
   * Get the default DAW application for a project type
   */
  getDefaultDawForExtension(extension: string): string {
    const dawMap: Record<string, string> = {
      'flp': 'FL Studio',
      'als': 'Ableton Live',
      'logicx': 'Logic Pro',
      'cpr': 'Cubase',
      'ptx': 'Pro Tools',
      'rpp': 'Reaper',
      'reason': 'Reason',
      'song': 'Studio One',
      'mmpz': 'LMMS',
      'mmp': 'LMMS',
      'bwproject': 'Bitwig Studio',
      'xrns': 'Renoise',
      'cwp': 'Cakewalk',
      'dawproject': 'DAWproject Compatible',
    };
    
    return dawMap[extension.toLowerCase()] || 'Unknown DAW';
  }

  /**
   * Group projects by their pack/folder
   */
  groupProjectsByPack(projects: Asset[]): Record<string, Asset[]> {
    const grouped: Record<string, Asset[]> = {};
    
    for (const project of projects) {
      const packName = project.packName || 'Ungrouped Projects';
      if (!grouped[packName]) {
        grouped[packName] = [];
      }
      grouped[packName].push(project);
    }
    
    return grouped;
  }

  /**
   * Get project statistics
   */
  getProjectStats(projects: Asset[]): {
    totalProjects: number;
    dawCounts: Record<string, number>;
    avgTracksPerProject: number;
  } {
    const dawCounts: Record<string, number> = {};
    let totalTracks = 0;
    let projectsWithTracks = 0;

    for (const project of projects) {
      const meta = project.meta as ProjectMeta;
      const daw = meta.daw || 'Unknown';
      
      dawCounts[daw] = (dawCounts[daw] || 0) + 1;
      
      if (meta.trackCount) {
        totalTracks += meta.trackCount;
        projectsWithTracks++;
      }
    }

    return {
      totalProjects: projects.length,
      dawCounts,
      avgTracksPerProject: projectsWithTracks > 0 ? Math.round(totalTracks / projectsWithTracks) : 0,
    };
  }
}

export const projectService = new ProjectService();