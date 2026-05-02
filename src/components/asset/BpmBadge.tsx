import { Badge } from '../ui/Badge';
import { formatBpm } from '../../utils/formatters';
import type { Asset } from '../../types';

export function BpmBadge({ asset }: { asset: Asset }) {
  if (asset.bpm == null) return <Badge tone="muted">--</Badge>;
  const fromFilename = asset.bpmSource === 'filename' || asset.bpmSource === 'midi';
  return (
    <Badge tone={fromFilename ? 'accent' : 'outline'} title={`BPM source: ${asset.bpmSource ?? 'unknown'}`}>
      {formatBpm(asset.bpm)}
    </Badge>
  );
}
