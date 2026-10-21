import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext';
import { queryClient } from './app/queries';
import './index.css';

// Loaded only when configured, so deployments without Sentry do not ship it.
if (import.meta.env.VITE_SENTRY_DSN) {
  import('@sentry/react').then((Sentry) =>
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      environment: import.meta.env.MODE,
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false },
    }),
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
