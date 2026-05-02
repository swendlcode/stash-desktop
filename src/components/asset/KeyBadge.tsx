import { Badge } from '../ui/Badge';
import { formatKey } from '../../utils/formatters';
import type { Asset } from '../../types';

export function KeyBadge({ asset }: { asset: Asset }) {
  if (!asset.keyNote) return <Badge tone="muted">--</Badge>;
  const fromFilename = asset.keySource === 'filename';
  return (
    <Badge tone={fromFilename ? 'neutral' : 'outline'} title={`Key source: ${asset.keySource ?? 'unknown'}`}>
      {formatKey(asset.keyNote, asset.keyScale)}
    </Badge>
  );
}
