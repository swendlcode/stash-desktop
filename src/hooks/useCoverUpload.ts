import { useEffect, useRef, useState } from 'react';
import { packService } from '../services/packService';
import { useSetPackArtwork, useClearPackArtwork } from './usePacks';

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

/**
 * Shared logic for the cover editor: previewing, uploading, URL fetch,
 * clipboard paste, and error reporting. The modal just wires UI to this.
 */
export function useCoverUpload(packRoot: string, onDone: () => void) {
  const setArtwork = useSetPackArtwork(packRoot);
  const clearArtwork = useClearPackArtwork(packRoot);
  const [preview, setPreview] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState('');
  const [busy, setBusy] = useState<'idle' | 'url' | 'uploading'>('idle');
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  const setPreviewUrl = (url: string | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreview(url);
  };

  const coerceMime = (mime: string, name?: string): string => {
    if (mime && ACCEPTED.has(mime)) return mime;
    const n = (name ?? '').toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.webp')) return 'image/webp';
    return mime;
  };

  const uploadBlob = async (blob: Blob, fallbackName?: string) => {
    setError(null);
    const mime = coerceMime(blob.type, fallbackName);
    if (!ACCEPTED.has(mime)) {
      setError(`Unsupported image type: ${blob.type || 'unknown'}. Use PNG, JPG or WebP.`);
      return;
    }
    try {
      setBusy('uploading');
      const buf = await blob.arrayBuffer();
      await setArtwork.mutateAsync({ bytes: new Uint8Array(buf), mime });
      onDone();
    } catch (err) {
      setError(`Save failed: ${String(err)}`);
    } finally {
      setBusy('idle');
    }
  };

  const handleFile = async (f: File) => {
    setPreviewUrl(URL.createObjectURL(f));
    await uploadBlob(f, f.name);
  };

  const pasteFromClipboard = async () => {
    setError(null);
    if (!navigator.clipboard || !('read' in navigator.clipboard)) {
      setError('Clipboard read not supported here. Paste directly (⌘V) inside the modal.');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imgType = item.types.find((t) => t.startsWith('image/'));
        if (imgType) {
          const blob = await item.getType(imgType);
          await uploadBlob(blob);
          return;
        }
        if (item.types.includes('text/plain')) {
          const blob = await item.getType('text/plain');
          const txt = (await blob.text()).trim();
          if (/^https?:\/\//i.test(txt)) { setUrlDraft(txt); return; }
        }
      }
      setError('Clipboard does not contain an image or URL.');
    } catch (e) {
      setError(`Clipboard read failed: ${String(e)}`);
    }
  };

  const fetchFromUrl = async () => {
    const url = urlDraft.trim();
    if (!url) return;
    setError(null);
    try {
      setBusy('url');
      const res = await packService.fetchUrlImage(url);
      const bytes = new Uint8Array(res.bytes);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: res.mime });
      setPreviewUrl(URL.createObjectURL(blob));
      await uploadBlob(blob);
    } catch (e) {
      setError(`Fetch failed: ${String(e)}`);
    } finally {
      setBusy('idle');
    }
  };

  const handlePasteEvent = async (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob) { setError(null); await uploadBlob(blob, blob.name); return; }
    }
    const text = e.clipboardData.getData('text/plain').trim();
    if (text && /^https?:\/\//i.test(text)) {
      e.preventDefault();
      setUrlDraft(text);
    }
  };

  const clearCover = async () => {
    setError(null);
    try { await clearArtwork.mutateAsync(); onDone(); }
    catch (e) { setError(`Remove failed: ${String(e)}`); }
  };

  const working = busy !== 'idle' || setArtwork.isPending || clearArtwork.isPending;

  return {
    preview, urlDraft, setUrlDraft, error, busy, working,
    hasExistingCover: clearArtwork.isSuccess ? false : true,
    handleFile, handlePasteEvent, pasteFromClipboard, fetchFromUrl, clearCover,
  };
}
