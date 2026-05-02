import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export function useUpdateCheck(): string | null {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>('check_for_update')
      .then((v) => setLatestVersion(v ?? null))
      .catch(() => {});
  }, []);

  return latestVersion;
}
