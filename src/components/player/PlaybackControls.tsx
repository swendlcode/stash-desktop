import { usePlayerStore } from "../../stores/playerStore";
import { Play, Stop } from "../ui/icons";

export function PlaybackControls() {
  const currentAsset = usePlayerStore((s) => s.currentAsset);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const pause = usePlayerStore((s) => s.pause);
  const resume = usePlayerStore((s) => s.resume);
  const stop = usePlayerStore((s) => s.stop);

  const disabled = !currentAsset;

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={disabled}
        onClick={() => (isPlaying ? pause() : resume())}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-stack-fire text-stack-black transition-opacity disabled:opacity-30"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Stop size={18} variant="Bold" color="currentColor" />
        ) : (
          <Play size={18} variant="Bold" color="currentColor" />
        )}
      </button>
      <button
        disabled={disabled}
        onClick={stop}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-30"
        aria-label="Stop"
      >
        <Stop size={18} variant="Bold" color="currentColor" />
      </button>
    </div>
  );
}
