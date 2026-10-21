import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  lazyRouteComponent,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import type { AuthContextType } from '@/context/AuthContext';
import { LoginPage, SignUpPage } from './pages/AuthPages';
import { WelcomePage } from './pages/WelcomePage';
import { CreateSocietyPage } from './pages/CreateSocietyPage';
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
    const home = homeFor(context.auth);
    // A redirect back into the app only makes sense once there is an app to enter.
    throw redirect({ href: home === '/welcome' ? home : (safeRedirect(search.redirect) ?? home) });
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

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/signup',
  validateSearch: authSearch,
  beforeLoad: leaveIfSignedIn,
  component: SignUpPage,
});

/** Signed in but not yet ready for the app: no name, or no society. */
const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/welcome',
  beforeLoad: ({ context }) => {
    if (!context.auth.isAuthenticated) throw redirect({ to: '/login' });
    const home = homeFor(context.auth);
    if (home !== '/welcome') throw redirect({ to: home });
  },
  component: WelcomePage,
});

/** Setting up an additional society, for someone who already belongs to one. */
const newSocietyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/societies/new',
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) throw redirect({ to: '/login', search: { redirect: location.href } });
    if (!context.auth.user?.name) throw redirect({ to: '/welcome' });
  },
  component: CreateSocietyPage,
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
    if (homeFor(context.auth) === '/welcome') throw redirect({ to: '/welcome' });
  },
  component: AppShell,
});

/** Sends anyone without one of these roles to their own home page. */
const requireRole =
  (roles: Role[]) =>
  ({ context }: { context: RouterContext }) => {
    if (!roles.includes(context.auth.user?.role as Role)) throw redirect({ to: homeFor(context.auth) });
  };

const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: '/',
  beforeLoad: ({ context }) => {
    throw redirect({ to: homeFor(context.auth) });
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
  beforeLoad: requireRole(['society_admin', 'manager']),
});

const managerIndexRoute = createRoute({
  getParentRoute: () => managerRoute,
  path: '/',
  component: lazyRouteComponent(() => import('./pages/ManagerPage'), 'ManagerPage'),
});

const buildingsRoute = createRoute({
  getParentRoute: () => managerRoute,
  path: '/buildings',
  component: lazyRouteComponent(() => import('./pages/BuildingsPage'), 'BuildingsPage'),
});

const settingsRoute = createRoute({
  getParentRoute: () => managerRoute,
  path: '/settings',
  beforeLoad: requireRole(['society_admin']),
  component: lazyRouteComponent(() => import('./pages/SocietySettingsPage'), 'SocietySettingsPage'),
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
  // Platform admins are a property of the user, not a society role.
  beforeLoad: ({ context }) => {
    if (context.auth.user?.platformRole !== 'platform_admin') throw redirect({ to: homeFor(context.auth) });
  },
  component: lazyRouteComponent(() => import('./pages/ComingSoonPage'), 'PlatformHomePage'),
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  signUpRoute,
  welcomeRoute,
  newSocietyRoute,
  appRoute.addChildren([
    indexRoute,
    residentRoute,
    managerRoute.addChildren([managerIndexRoute, vendorsRoute, buildingsRoute, settingsRoute]),
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
