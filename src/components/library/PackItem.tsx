import type { Pack } from '../../types';
import { Folder, FolderOpen } from '../ui/icons';
import { packColorFor } from '../../utils/colorUtils';

interface PackItemProps {
  pack: Pack;
  active: boolean;
  onSelect: () => void;
}

export function PackItem({ pack, active, onSelect }: PackItemProps) {
  const color = pack.color ?? packColorFor(pack.id);
  const Icon = active ? FolderOpen : Folder;

  return (
    <button
      onClick={onSelect}
      className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors ${
        active ? 'bg-stack-fire/10 text-stack-white' : 'text-gray-300 hover:bg-gray-800'
      }`}
    >
      <span
        className="block h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Icon size={14} color="currentColor" variant={active ? 'Bulk' : 'Linear'} />
      <span className="flex-1 truncate text-sm">{pack.name}</span>
      <span className="mono text-xs text-gray-500">{pack.assetCount}</span>
    </button>
  );
}
