import { formatCount } from '../../utils/formatters';

export function ResultCount({ count }: { count: number }) {
  return (
    <div className="mono text-xs text-gray-400">
      {formatCount(count)} {count === 1 ? 'result' : 'results'}
    </div>
  );
}
