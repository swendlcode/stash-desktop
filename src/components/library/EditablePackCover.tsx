import { useRef, useState } from 'react';
import { usePackCover } from '../../hooks/usePackCover';
import {
  useSetPackArtwork,
  useClearPackArtwork,
} from '../../hooks/usePacks';
import { GalleryAdd, GalleryEdit } from '../ui/icons';
import { ContextMenu, type ContextMenuItem } from '../ui/ContextMenu';

interface Props {
  packRoot: string | null;
  packName?: string | null;
  size?: number;
}

const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

function coerceMime(file: { type: string; name?: string }): string {
  if (file.type && ACCEPTED_MIME.has(file.type)) return file.type;
  const name = file.name?.toLowerCase() ?? '';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return file.type || '';
}

export function EditablePackCover({ packRoot, packName, size = 64 }: Props) {
  const { data: coverUrl } = usePackCover(packRoot);
  const setArtwork = useSetPackArtwork(packRoot);
  const clearArtwork = useClearPackArtwork(packRoot);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [isHot, setIsHot] = useState(false);
  const [imgError, setImgError] = useState(false);

  const label = packName ?? packRoot?.split(/[/\\]/).filter(Boolean).pop() ?? '?';
  const style = { width: size, height: size, minWidth: size, minHeight: size };
  const hasCover = Boolean(coverUrl) && !imgError;

  const uploadBlob = async (blob: Blob, fallbackName?: string) => {
    const mime = coerceMime({ type: blob.type, name: fallbackName });
    if (!ACCEPTED_MIME.has(mime)) {
      const msg = `Unsupported image type: "${blob.type || 'unknown'}". Use PNG, JPG, or WebP.`;
      console.warn(msg);
      window.alert(msg);
      return;
    }
    try {
      const buf = await blob.arrayBuffer();
      await setArtwork.mutateAsync({ bytes: new Uint8Array(buf), mime });
      setImgError(false);
    } catch (err) {
      console.error('set_pack_artwork failed:', err);
      window.alert(`Could not save artwork: ${String(err)}`);
    }
  };

  const pasteFromClipboard = async (): Promise<boolean> => {
    if (!navigator.clipboard || !('read' in navigator.clipboard)) return false;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          await uploadBlob(blob);
          return true;
        }
      }
    } catch (e) {
      console.warn('clipboard read failed', e);
    }
    return false;
  };

  const pickFile = () => fileInputRef.current?.click();

  const handleClick = async () => {
    if (!packRoot) return;
    const pasted = await pasteFromClipboard();
    if (!pasted) pickFile();
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      await pasteFromClipboard();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      await handleClick();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await uploadBlob(file, file.name);
  };

  const handlePasteEvent = async (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    const blob = item.getAsFile();
    if (blob) await uploadBlob(blob, blob.name);
  };

  const menuItems: ContextMenuItem[] = [
    { label: 'Paste from clipboard', onSelect: () => void pasteFromClipboard() },
    { label: 'Upload image…', onSelect: pickFile },
    {
      label: 'Remove artwork',
      onSelect: () => clearArtwork.mutate(),
      danger: true,
      disabled: !hasCover,
    },
  ];

  const busy = setArtwork.isPending || clearArtwork.isPending;

  return (
    <>
      <button
        type="button"
        disabled={!packRoot}
        style={style}
        className={`group relative overflow-hidden rounded-lg border transition-all focus:outline-none focus:ring-2 focus:ring-stack-fire disabled:opacity-50 ${
          isHot ? 'border-stack-fire' : 'border-transparent hover:border-gray-600'
        }`}
        title="Click to paste from clipboard or upload an image"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePasteEvent}
        onDragOver={(e) => {
          e.preventDefault();
          setIsHot(true);
        }}
        onDragLeave={() => setIsHot(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setIsHot(false);
          const file = e.dataTransfer.files?.[0];
          if (file) await uploadBlob(file, file.name);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        {hasCover ? (
          <img
            src={coverUrl!}
            alt={label}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-800">
            <GalleryAdd
              size={Math.round(size * 0.4)}
              color="#6b7280"
              variant="Linear"
            />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/50 group-hover:opacity-100">
          <GalleryEdit size={Math.round(size * 0.35)} color="#ffffff" variant="Linear" />
        </div>

        {busy && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-stack-fire border-t-transparent" />
          </div>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}
