import { open } from '@tauri-apps/plugin-dialog';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { FolderAdd } from '../ui/icons';
import { libraryService } from '../../services/libraryService';
import { packQueryKeys } from '../../hooks/usePacks';
import { assetQueryKeys } from '../../hooks/useAssets';

export function FolderPicker() {
  const qc = useQueryClient();

  const pickFolder = async () => {
    const selected = await open({ directory: true, multiple: true });
    if (!selected) return;
    const folders = Array.isArray(selected) ? selected : [selected];
    if (folders.length === 0) return;

    for (const folder of folders) {
      await libraryService.addWatchedFolder(folder);
      await libraryService.scanFolder(folder);
    }

    qc.invalidateQueries({ queryKey: packQueryKeys.all });
    qc.invalidateQueries({ queryKey: assetQueryKeys.all });
    qc.invalidateQueries({ queryKey: ['watched-folders'] });
  };

  return (
    <Button
      variant="primary"
      icon={<FolderAdd size={16} variant="Linear" color="currentColor" />}
      onClick={pickFolder}
    >
      Add Folder
    </Button>
  );
}
