import { Badge } from '../ui/Badge';
import type { ProjectMeta } from '../../types/asset';

interface DawBadgeProps {
  meta: ProjectMeta;
  className?: string;
}

const DAW_COLORS: Record<string, string> = {
  'FL Studio': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Ableton Live': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Logic Pro': 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  'Cubase': 'bg-red-500/10 text-red-400 border-red-500/20',
  'Pro Tools': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Reaper': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Reason': 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Studio One': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  'LMMS': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'Bitwig Studio': 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  'Renoise': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'Cakewalk': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'DAWproject': 'bg-violet-500/10 text-violet-400 border-violet-500/20',
};

const DAW_ABBREVIATIONS: Record<string, string> = {
  'FL Studio': 'FL',
  'Ableton Live': 'Live',
  'Logic Pro': 'Logic',
  'Cubase': 'Cubase',
  'Pro Tools': 'PT',
  'Reaper': 'Reaper',
  'Reason': 'Reason',
  'Studio One': 'S1',
  'LMMS': 'LMMS',
  'Bitwig Studio': 'Bitwig',
  'Renoise': 'Renoise',
  'Cakewalk': 'Cakewalk',
  'DAWproject': 'DAW',
};

export function DawBadge({ meta, className }: DawBadgeProps) {
  const daw = meta.daw || 'Unknown DAW';
  const abbreviation = DAW_ABBREVIATIONS[daw] || daw;
  const colorClass = DAW_COLORS[daw] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';

  return (
    <Badge 
      className={`${colorClass} ${className || ''}`}
      title={`${daw}${meta.version ? ` ${meta.version}` : ''}`}
    >
      {abbreviation}
    </Badge>
  );
}