import { usePacks } from '../../hooks/usePacks';
import { useUiStore } from '../../stores/uiStore';
import { PackItem } from './PackItem';

export function PackList() {
  const { data: packs = [], isLoading } = usePacks();
  const activePage = useUiStore((s) => s.activePage);
  const activePackId = useUiStore((s) => s.activePackId);
  const setActivePage = useUiStore((s) => s.setActivePage);

  return (
    <div className="flex flex-col gap-1 p-3">
      <h3 className="mb-1 px-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Packs
      </h3>
      {isLoading && <div className="px-2 text-xs text-gray-500">Loading...</div>}
      {!isLoading && packs.length === 0 && (
        <div className="px-2 text-xs text-gray-500">No packs yet. Add a folder to start.</div>
      )}
      {packs.map((pack) => (
        <PackItem
          key={pack.id}
          pack={pack}
          active={activePage === 'pack' && activePackId === pack.id}
          onSelect={() => setActivePage('pack', pack.id)}
        />
      ))}
    </div>
  );
}
