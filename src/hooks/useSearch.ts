import { useEffect, useRef, useState } from 'react';
import { useFilterStore } from '../stores/filterStore';

/**
 * Local input state debounced into the filter store query.
 *
 * Key design: `query` from the store is NOT a dependency of the debounce
 * effect. The draft is the single source of truth for the input value.
 * The store is write-only from this hook — reading it back as a dep caused
 * an infinite loop (type → store updates → effect re-runs → repeat).
 */
export function useSearch(delayMs = 200) {
  const setQuery = useFilterStore((s) => s.setQuery);
  // Initialise draft from the store once on mount only
  const initialQuery = useFilterStore.getState().filters.query;
  const [draft, setDraft] = useState(initialQuery);

  // Keep a ref so the timeout callback always sees the latest draft
  // without needing it as a dep (which would restart the timer on every keystroke)
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(draftRef.current);
    }, delayMs);
    return () => clearTimeout(t);
  // Only re-run when draft changes — not when store query changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, delayMs]);

  return [draft, setDraft] as const;
}
