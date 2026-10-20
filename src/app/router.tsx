import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { AuthContextType } from '@/context/AuthContext';
import { LoginPage } from '@/components/LoginPage';
import { RegisterPage } from '@/components/RegisterPage';
import { AppShell } from './AppShell';
import { NotFoundPage } from './pages/NotFoundPage';
import { ErrorPage } from './pages/ErrorPage';
import { homeFor, safeRedirect, type Role } from './roles';

/**
 * URL routing. Pages used to be tabs switched in App.tsx state, so nothing had
 * a URL, a refresh lost your place, and new screens had nowhere to go.
 *
 * Each role's pages load as their own chunk, so a resident's phone does not
 * download the manager console.
 */

export interface RouterContext {
  auth: AuthContextType;
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});

/** Signed-in users have no business on the sign-in pages. */
function leaveIfSignedIn({ context, search }: { context: RouterContext; search: { redirect?: string } }) {
  if (context.auth.isAuthenticated) {
    throw redirect({ href: safeRedirect(search.redirect) ?? homeFor(context.auth.user?.role) });
  }
}

const authSearch = (search: Record<string, unknown>): { redirect?: string } => ({
  redirect: safeRedirect(search.redirect) ?? undefined,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: authSearch,
  beforeLoad: leaveIfSignedIn,
  component: LoginPage,
});

const registerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/register',
  validateSearch: authSearch,
  beforeLoad: leaveIfSignedIn,
  component: RegisterPage,
});

/** Every signed-in page. ?ticket=<id> opens that ticket over whichever page is showing. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  validateSearch: (search: Record<string, unknown>): { ticket?: string } => ({
    ticket: typeof search.ticket === 'string' ? search.ticket : undefined,
  }),
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppShell,
});

/** Sends anyone without one of these roles to their own home page. */
const requireRole =
  (roles: Role[]) =>
  ({ context }: { context: RouterContext }) => {
    const role = context.auth.user?.role;
    if (!roles.includes(role)) throw redirect({ to: homeFor(role) });
  };

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    throw redirect({ to: homeFor(context.auth.user?.role) });
  },
});

// Managers can use the resident assistant too, as they could before.
const residentRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/resident',
  component: lazyRouteComponent(() => import('./pages/ResidentPage'), 'ResidentPage'),
});

const managerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/manager',
  beforeLoad: requireRole(['maintenance', 'admin']),
});

const managerIndexRoute = createRoute({
  getParentRoute: () => managerRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/ManagerPage'), 'ManagerPage'),
});

const vendorsRoute = createRoute({
  getParentRoute: () => managerRoute,
  path: '/vendors',
  component: lazyRouteComponent(() => import('./pages/VendorsPage'), 'VendorsPage'),
});

const workerRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/worker',
  beforeLoad: requireRole(['worker']),
  component: lazyRouteComponent(() => import('./pages/ComingSoonPage'), 'WorkerHomePage'),
});

const platformRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/platform',
  beforeLoad: requireRole(['platform_admin']),
  component: lazyRouteComponent(() => import('./pages/ComingSoonPage'), 'PlatformHomePage'),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  registerRoute,
  appRoute.addChildren([
    indexRoute,
    residentRoute,
    managerRoute.addChildren([managerIndexRoute, vendorsRoute]),
    workerRoute,
    platformRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  // Filled in by <RouterProvider context> once the session has been checked.
  context: { auth: undefined! },
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
