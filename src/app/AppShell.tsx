import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearch } from '@tanstack/react-router';
import { NavigationHeader } from '@/components/NavigationHeader';
import { TicketDetailModal } from '@/components/TicketDetailModal';
import { AnalyticsReportModal } from '@/components/AnalyticsReportModal';
import { NotificationsDrawer } from '@/components/NotificationsDrawer';
import { InboxDrawer, useInbox } from '@/components/InboxDrawer';
import { useAuth } from '@/context/AuthContext';
import type { Ticket } from '@/types';
import { useNotifications, useSocietyProfile, useTicket, useTicketActions, useVendors } from './queries';
import { isManagerRole } from './roles';

interface ShellContextValue {
  isDarkMode: boolean;
  /** Opens a ticket's detail over the current page (as ?ticket=<id>). */
  openTicket: (ticket: Pick<Ticket, 'id'>) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) throw new Error('useShell must be used inside AppShell');
  return value;
}

type Tab = 'resident' | 'manager' | 'vendors' | 'buildings' | 'residents' | 'notices' | 'maintenance' | 'jobs';

const TAB_PATHS: Record<Tab, string> = {
  jobs: '/worker',
  resident: '/resident',
  manager: '/manager',
  vendors: '/manager/vendors',
  buildings: '/manager/buildings',
  residents: '/manager/residents',
  notices: '/manager/notices',
  maintenance: '/manager/maintenance',
};

function tabFor(pathname: string): Tab {
  if (pathname.startsWith('/worker')) return 'jobs';
  if (pathname.startsWith('/manager/vendors')) return 'vendors';
  if (pathname.startsWith('/manager/buildings')) return 'buildings';
  if (pathname.startsWith('/manager/residents')) return 'residents';
  if (pathname.startsWith('/manager/notices')) return 'notices';
  if (pathname.startsWith('/manager/maintenance')) return 'maintenance';
  if (pathname.startsWith('/manager')) return 'manager';
  return 'resident';
}

const DARK_MODE_KEY = 'societyops_dark_mode';

function readDarkModePreference(): boolean {
  try {
    return localStorage.getItem(DARK_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

/** The frame around every signed-in page: header, drawers and the ticket modal. */
export function AppShell() {
  const { user } = useAuth();
  const isManager = isManagerRole(user?.role);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { ticket: openTicketId } = useSearch({ from: '/app' });

  const [isDarkMode, setIsDarkMode] = useState(readDarkModePreference);

  // The class drives Tailwind's dark: styles and the shadcn colour tokens, so
  // every part of the page, dialogs included, follows the toggle together.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    try {
      localStorage.setItem(DARK_MODE_KEY, isDarkMode ? '1' : '0');
    } catch {
      // Storage can be blocked; the choice then lasts until the page reloads.
    }
    return () => document.documentElement.classList.remove('dark');
  }, [isDarkMode]);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const inbox = useInbox(!isManager);
  const [isReportOpen, setIsReportOpen] = useState(false);

  const societyProfile = useSocietyProfile();
  const notifications = useNotifications(isManager);
  const vendors = useVendors();
  const openTicket = useTicket(openTicketId);
  const actions = useTicketActions();

  const setOpenTicketId = (id: string | undefined) =>
    navigate({ to: '.', search: (prev: Record<string, unknown>) => ({ ...prev, ticket: id }) });

  const shell: ShellContextValue = {
    isDarkMode,
    openTicket: (ticket) => setOpenTicketId(ticket.id),
  };

  return (
    <ShellContext.Provider value={shell}>
      <div
        className={`min-h-screen font-sans transition-colors ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}
      >
        <NavigationHeader
          activeTab={tabFor(pathname)}
          setActiveTab={(tab) => navigate({ to: TAB_PATHS[tab] })}
          societyName={societyProfile.data?.societyName || 'Your society'}
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          unreadNotifsCount={notifications.data?.length ?? 0}
          onOpenNotifs={() => setIsNotifsOpen(true)}
          onOpenReport={() => setIsReportOpen(true)}
          onRunFollowupCycle={() => actions.runFollowup.mutate()}
          isFollowupRunning={actions.runFollowup.isPending}
          user={user}
          inboxUnread={inbox.data?.unread ?? 0}
          onOpenInbox={() => setIsInboxOpen(true)}
        />

        <main className="pb-12">
          <Outlet />
        </main>

        {/* Keyed so the modal's form state resets when a different ticket opens. */}
        <TicketDetailModal
          key={openTicket.data?.id ?? 'none'}
          ticket={openTicket.data ?? null}
          vendors={vendors.data ?? []}
          onClose={() => setOpenTicketId(undefined)}
          isDarkMode={isDarkMode}
          onAssignVendor={(ticketId, vendorId) => actions.assign.mutate({ ticketId, vendorId })}
          onEscalateTicket={(ticketId, reason) => actions.escalate.mutate({ ticketId, reason })}
          onCloseTicket={(ticketId) => actions.close.mutate({ ticketId })}
        />

        {!isManager && (
          <InboxDrawer
            isOpen={isInboxOpen}
            onClose={() => setIsInboxOpen(false)}
            items={inbox.data?.notifications ?? []}
            onOpenTicket={(id) => (user?.role === 'worker' ? navigate({ to: '/worker' }) : setOpenTicketId(id))}
          />
        )}

        {isManager && (
          <>
            <AnalyticsReportModal
              isOpen={isReportOpen}
              onClose={() => setIsReportOpen(false)}
              isDarkMode={isDarkMode}
            />
            <NotificationsDrawer
              isOpen={isNotifsOpen}
              onClose={() => setIsNotifsOpen(false)}
              notifications={notifications.data ?? []}
              isDarkMode={isDarkMode}
            />
          </>
        )}
      </div>
    </ShellContext.Provider>
  );
}
