import { useEffect, useRef, useState } from 'react';
import { usePackCover } from '../../hooks/usePackCover';
import { useCoverUpload } from '../../hooks/useCoverUpload';
import { CloseCircle, GalleryAdd, Copy, Trash } from '../ui/icons';

interface Props {
  packRoot: string;
  packName: string;
  onClose: () => void;
}

export function CoverEditorModal({ packRoot, packName, onClose }: Props) {
  const { data: coverUrl } = usePackCover(packRoot);
  const up = useCoverUpload(packRoot, onClose);
  const [hot, setHot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shownUrl = up.preview ?? coverUrl ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Edit folder cover"
    >
      <div
        className="w-[min(520px,94vw)] overflow-hidden rounded-lg border border-gray-700 bg-stack-black shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        onPaste={up.handlePasteEvent}
      >
        <header className="flex items-center justify-between border-b border-gray-700/70 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-stack-white" title={packName}>
              Cover · {packName}
            </h2>
            <div className="mt-0.5 text-[11px] text-gray-500">
              Paste (⌘V) · drop a file · fetch from URL
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-stack-white"
            aria-label="Close"
            title="Close (Esc)"
          >
            <CloseCircle size={18} color="currentColor" variant="Linear" />
          </button>
        </header>

        <div className="flex flex-col gap-4 p-4">
          <div
            className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
              hot ? 'border-stack-fire bg-stack-fire/5' : 'border-gray-700 bg-gray-900'
            }`}
            onDragOver={(e) => { e.preventDefault(); setHot(true); }}
            onDragLeave={() => setHot(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setHot(false);
              const f = e.dataTransfer.files?.[0];
              if (f) await up.handleFile(f);
            }}
          >
            {shownUrl ? (
              <img src={shownUrl} alt={packName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-gray-500">
                <GalleryAdd size={32} color="currentColor" variant="Linear" />
                <span className="text-xs">Drop an image here or paste</span>
              </div>
            )}
            {up.working && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-stack-fire border-t-transparent" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] uppercase tracking-widest text-gray-500">
              Fetch from URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={up.urlDraft}
                onChange={(e) => up.setUrlDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); up.fetchFromUrl(); } }}
                placeholder="https://…image.jpg or a page with og:image"
                className="min-w-0 flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-stack-white placeholder:text-gray-600 focus:border-stack-fire focus:outline-none"
                disabled={up.working}
              />
              <button
                onClick={up.fetchFromUrl}
                disabled={up.working || !up.urlDraft.trim()}
                className="rounded-md border border-stack-fire/40 bg-stack-fire/10 px-3 py-1.5 text-xs font-semibold text-stack-fire hover:bg-stack-fire/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {up.busy === 'url' ? 'Fetching…' : 'Fetch'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={up.working}
              className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-stack-fire hover:text-stack-white disabled:opacity-40"
            >
              <GalleryAdd size={14} color="currentColor" variant="Linear" />
              Upload file…
            </button>
            <button
              onClick={up.pasteFromClipboard}
              disabled={up.working}
              className="flex items-center gap-1.5 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:border-stack-fire hover:text-stack-white disabled:opacity-40"
            >
              <Copy size={14} color="currentColor" variant="Linear" />
              Paste from clipboard
            </button>
            {coverUrl && (
              <button
                onClick={up.clearCover}
                disabled={up.working}
                className="ml-auto flex items-center gap-1.5 rounded-md border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
              >
                <Trash size={14} color="currentColor" variant="Linear" />
                Remove
              </button>
            )}
          </div>

          {up.error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {up.error}
            </div>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) await up.handleFile(f);
          }}
        />
      </div>
    </div>
  );
}
