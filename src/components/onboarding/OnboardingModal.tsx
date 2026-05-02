import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  FolderAdd,
  Element3,
  Edit2,
  ArrowLeft2,
  ArrowRight2,
  Play,
  Pause,
  Backward,
  Forward,
} from '../ui/icons';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateSettings: () => void;
  onNavigateProjects: () => void;
  onNavigateBrowser: () => void;
}

interface Slide {
  kicker: string;
  icon: ReactNode;
  title: string;
  body: string;
  hints: string[];
  visual: 'folder' | 'project' | 'editor';
  ctaLabel: string;
  onCta: () => void;
}

export function OnboardingModal({
  isOpen,
  onClose,
  onNavigateSettings,
  onNavigateProjects,
  onNavigateBrowser,
}: OnboardingModalProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (isOpen) setIndex(0);
  }, [isOpen]);

  const slides = useMemo<Slide[]>(
    () => [
      {
        kicker: 'Library setup',
        icon: <FolderAdd size={16} color="currentColor" variant="Bulk" />,
        title: 'Add your first folder',
        body: 'Open Settings and use Watched Folders to add your sample library. Stack will index it and keep it in sync.',
        hints: ['Settings page', 'Watched Folders', 'Re-scan all'],
        visual: 'folder',
        ctaLabel: 'Open Settings',
        onCta: onNavigateSettings,
      },
      {
        kicker: 'Project workflow',
        icon: <Element3 size={16} color="currentColor" variant="Bulk" />,
        title: 'Create and open projects',
        body: 'Go to Projects to add DAW project folders and open them as focused workspaces with versions and metadata.',
        hints: ['Projects tab', 'Add project folder', 'Open Project'],
        visual: 'project',
        ctaLabel: 'Open Projects',
        onCta: onNavigateProjects,
      },
      {
        kicker: 'Editing',
        icon: <Edit2 size={16} color="currentColor" variant="Bulk" />,
        title: 'Use the edit tool',
        body: 'In Browser, select a sample and open the editor from the bottom panel. Trim, reverse, and export edits quickly.',
        hints: ['Browser tab', 'Select sample', 'Editor tools'],
        visual: 'editor',
        ctaLabel: 'Open Browser',
        onCta: onNavigateBrowser,
      },
    ],
    [onNavigateBrowser, onNavigateProjects, onNavigateSettings]
  );

  if (!isOpen) return null;

  const current = slides[index];
  const isLast = index === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/45 backdrop-blur-md p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-4xl rounded-xl border border-gray-700/80 bg-gray-900/95 p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <span className="mono text-xs text-gray-500">
            Onboarding {index + 1}/{slides.length}
          </span>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 transition-colors hover:text-stack-white"
          >
            Skip
          </button>
        </div>

        <div className="grid gap-4 rounded-lg border border-gray-700 bg-gray-800/60 p-4 md:grid-cols-[1.1fr_1fr]">
          <div className="min-h-[220px]">
            <StepVisual kind={current.visual} />
          </div>
          <div className="flex flex-col justify-center">
            <div className="mb-3 flex items-center gap-2">
              <Badge tone="outline" className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px]">
                <span className="text-stack-fire">{current.icon}</span>
                {current.kicker}
              </Badge>
            </div>
            <h2 id="onboarding-title" className="text-2xl font-bold text-stack-white">
              {current.title}
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-gray-300">{current.body}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {current.hints.map((hint) => (
                <Badge key={hint} tone="muted" className="px-2 py-0.5 text-[11px]">
                  {hint}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 h-1 w-full overflow-hidden rounded bg-gray-800">
          <div
            className="h-full bg-stack-fire transition-[width] duration-300"
            style={{ width: `${((index + 1) / slides.length) * 100}%` }}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIndex((v) => Math.max(0, v - 1))}
            disabled={index === 0}
            icon={<ArrowLeft2 size={14} color="currentColor" variant="Linear" />}
          >
            Back
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => current.onCta()}
          >
            {current.ctaLabel}
          </Button>
          <div className="ml-auto">
            {isLast ? (
              <Button variant="primary" size="sm" onClick={onClose}>
                Finish
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIndex((v) => Math.min(slides.length - 1, v + 1))}
                icon={<ArrowRight2 size={14} color="currentColor" variant="Linear" />}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepVisual({ kind }: { kind: 'folder' | 'project' | 'editor' }) {
  if (kind === 'folder') {
    return (
      <div className="rounded-md border border-gray-700 bg-gray-900/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="mono text-[11px] text-gray-500">Watched folders</span>
          <Badge tone="outline" className="text-[10px] px-1.5 py-0">+ Add</Badge>
        </div>
        <div className="space-y-1.5">
          <div className="truncate rounded bg-gray-800 px-2 py-1.5 mono text-[11px] text-gray-300">
            /Users/you/Samples/Drums
          </div>
          <div className="truncate rounded bg-gray-800 px-2 py-1.5 mono text-[11px] text-gray-300">
            /Users/you/Samples/Bass
          </div>
        </div>
      </div>
    );
  }

  if (kind === 'project') {
    return (
      <div className="rounded-md border border-gray-700 bg-gray-900/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="mono text-[11px] text-gray-500">Projects</span>
          <Badge tone="accent" className="text-[10px] px-1.5 py-0">LIVE</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-gray-700 bg-gray-800 p-2">
            <div className="h-10 rounded bg-stack-fire/25" />
            <div className="mt-1.5 text-[11px] text-gray-300">Night Drive</div>
          </div>
          <div className="rounded border border-gray-700 bg-gray-800 p-2">
            <div className="h-10 rounded bg-stack-fire/15" />
            <div className="mt-1.5 text-[11px] text-gray-300">Club Mix v2</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-gray-700 bg-gray-900/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="mono text-[11px] text-gray-500">Sample editor</span>
        <span className="mono text-[11px] text-stack-fire">00:12 / 00:44</span>
      </div>
      <div className="mb-3 overflow-hidden rounded bg-gray-800 p-2">
        <svg viewBox="0 0 420 72" className="h-16 w-full" aria-hidden>
          <defs>
            <linearGradient id="wave-muted" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#5b6474" />
              <stop offset="100%" stopColor="#7b8392" />
            </linearGradient>
            <linearGradient id="wave-fire" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F2613F" />
              <stop offset="100%" stopColor="#FF8A6B" />
            </linearGradient>
          </defs>
          <path
            d="M0,36 C16,10 32,62 48,36 C64,8 80,64 96,36 C112,16 128,56 144,36 C160,18 176,54 192,36 C208,14 224,58 240,36 C256,12 272,60 288,36 C304,20 320,52 336,36 C352,12 368,60 384,36 C396,24 408,48 420,36"
            fill="none"
            stroke="url(#wave-muted)"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M142,36 C150,22 158,48 166,36 C174,24 182,46 190,36 C198,22 206,50 214,36 C222,26 230,44 238,36 C246,24 254,46 262,36"
            fill="none"
            stroke="url(#wave-fire)"
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !w-7 !px-0"
          icon={<Backward size={12} color="currentColor" variant="Linear" />}
        />
        <Button
          variant="primary"
          size="sm"
          className="!h-8 !w-8 !px-0"
          icon={<Play size={13} color="currentColor" variant="Bold" />}
        />
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !w-7 !px-0"
          icon={<Pause size={12} color="currentColor" variant="Linear" />}
        />
        <Button
          variant="ghost"
          size="sm"
          className="!h-7 !w-7 !px-0"
          icon={<Forward size={12} color="currentColor" variant="Linear" />}
        />
      </div>
    </div>
  );
}
