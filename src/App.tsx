import { useEffect } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { useAuth } from './context/AuthContext';
import { router } from './app/router';

/**
 * Hands the session to the router. Route guards read it from the router
 * context, so the router re-checks them whenever someone signs in or out.
 */
export default function App() {
  const auth = useAuth();

  // Only once the router has been given the session: invalidating earlier
  // runs the guards against an empty context.
  useEffect(() => {
    if (!auth.isLoading) router.invalidate();
  }, [auth.isLoading, auth.isAuthenticated, auth.user?.role]);

  if (auth.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        Checking your session...
      </div>
    );
  }

  return <RouterProvider router={router} context={{ auth }} />;
}
