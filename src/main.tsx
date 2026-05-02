import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { applyTheme, readPersistedTheme } from './hooks/useTheme';
import './index.css';

// Apply the user's last-chosen theme BEFORE React mounts, so the first paint
// matches their preference instead of flashing dark and then swapping when
// settings load from SQLite. The settings query reconciles after mount.
applyTheme(readPersistedTheme());

// Global unhandled error logging
window.addEventListener('error', (e) => {
  console.error('[Global] Unhandled error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Global] Unhandled promise rejection:', e.reason);
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Log all query errors
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === 'updated' && event.query.state.status === 'error') {
    console.error(
      '[QueryClient] Query error:',
      event.query.queryKey,
      event.query.state.error
    );
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
