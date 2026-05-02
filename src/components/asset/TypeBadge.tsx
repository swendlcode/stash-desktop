import { Badge } from '../ui/Badge';
import type { Asset } from '../../types';

export function TypeBadge({ asset }: { asset: Asset }) {
  const parts: string[] = [];
  if (asset.instrument) parts.push(asset.instrument);
  if (asset.subtype) parts.push(asset.subtype);
  if (parts.length === 0) parts.push(asset.type);
  return <Badge tone="outline">{parts.join(' · ')}</Badge>;
}
