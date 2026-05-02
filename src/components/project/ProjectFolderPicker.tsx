import { open } from '@tauri-apps/plugin-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { FolderAdd } from '../ui/icons';
import { libraryService } from '../../services/libraryService';
import { packQueryKeys } from '../../hooks/usePacks';
import { assetQueryKeys } from '../../hooks/useAssets';

export function ProjectFolderPicker() {
  const qc = useQueryClient();

  const pickProjectFolder = async () => {
    const selected = await open({ 
      directory: true, 
      multiple: true,
      title: 'Select Project Folders',
    });
    
    if (!selected) return;
    const folders = Array.isArray(selected) ? selected : [selected];
    if (folders.length === 0) return;

    for (const folder of folders) {
      await libraryService.addProjectFolder(folder);
      await libraryService.scanFolder(folder);
    }

    // Invalidate queries to refresh the UI
    qc.invalidateQueries({ queryKey: packQueryKeys.all });
    qc.invalidateQueries({ queryKey: assetQueryKeys.all });
    qc.invalidateQueries({ queryKey: ['watched-folders'] });
  };

  return (
    <Button
      variant="primary"
      icon={<FolderAdd size={16} variant="Linear" color="currentColor" />}
      onClick={pickProjectFolder}
    >
      Add Project Folder
    </Button>
  );
}