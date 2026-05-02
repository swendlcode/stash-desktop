import type { AssetType } from '../types';

export function getExtension(path: string): string {
  const idx = path.lastIndexOf('.');
  if (idx < 0) return '';
  return path.slice(idx + 1).toLowerCase();
}

export function getFilename(path: string): string {
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
}

export function classifyExtension(ext: string): AssetType | null {
  const e = ext.toLowerCase();
  if (['wav', 'aif', 'aiff', 'mp3', 'flac', 'ogg'].includes(e)) return 'sample';
  if (['mid', 'midi'].includes(e)) return 'midi';
  if (['fxp', 'nmsv', 'h2p', 'spf'].includes(e)) return 'preset';
  if (['als'].includes(e)) return 'project';
  return null;
}
