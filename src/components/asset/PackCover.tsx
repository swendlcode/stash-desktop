import { useState } from 'react';
import { usePackCover } from '../../hooks/usePackCover';
import { Music } from '../ui/icons';

interface PackCoverProps {
  packRoot: string | null;
  packName: string | null;
  /** Pixel size for fixed dimensions, or "full" to fill the parent container */
  size?: number | 'full';
}

/**
 * Shows a pack's folder.jpg/cover.jpg if it exists, otherwise a dark square
 * with a music icon — clean and neutral when no artwork is available.
 */
export function PackCover({ packRoot, packName, size = 38 }: PackCoverProps) {
  const { data: coverUrl } = usePackCover(packRoot);
  const [imgError, setImgError] = useState(false);

  const label = packName ?? packRoot?.split(/[/\\]/).filter(Boolean).pop() ?? '?';

  const isFull = size === 'full';
  const style = isFull
    ? { width: '100%', height: '100%' }
    : { width: size, height: size, minWidth: size, minHeight: size };

  if (coverUrl && !imgError) {
    return (
      <img
        src={coverUrl}
        alt={label}
        style={style}
        className="object-cover"
        onError={() => setImgError(true)}
        draggable={false}
      />
    );
  }

  // Fallback: dark square with music icon
  return (
    <div
      style={style}
      className={`flex items-center justify-center select-none bg-gray-700/80 ${isFull ? 'w-full h-full' : 'rounded'}`}
      aria-label={label}
      title={label}
    >
      <Music
        size={isFull ? 40 : Math.round((size as number) * 0.45)}
        color="#6b7280"
        variant="Linear"
      />
    </div>
  );
}
