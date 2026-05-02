import { useEffect, useRef, useState } from 'react';
import {
  usePackDescription,
  useSetPackDescription,
} from '../../hooks/usePacks';

interface Props {
  packRoot: string | null;
  placeholder?: string;
}

export function PackDescription({
  packRoot,
  placeholder = 'Add a description for this pack…',
}: Props) {
  const { data: remote = '' } = usePackDescription(packRoot);
  const save = useSetPackDescription(packRoot);
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (!dirtyRef.current) setValue(remote);
  }, [remote]);

  const autoresize = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(autoresize, [value]);

  const commit = () => {
    if (!dirtyRef.current) return;
    if (value === remote) {
      dirtyRef.current = false;
      return;
    }
    save.mutate(value, {
      onSuccess: () => {
        dirtyRef.current = false;
      },
    });
  };

  return (
    <textarea
      ref={taRef}
      value={value}
      onChange={(e) => {
        dirtyRef.current = true;
        setValue(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      placeholder={placeholder}
      disabled={!packRoot}
      rows={1}
      className="w-full resize-none bg-transparent text-sm text-gray-300 placeholder:text-gray-600 focus:outline-none focus:ring-0"
    />
  );
}
