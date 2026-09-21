import React, { useState, useEffect } from 'react';
import { NavigationHeader } from './components/NavigationHeader';
import { ResidentChat } from './components/ResidentChat';
import { ManagerDashboard } from './components/ManagerDashboard';
import { VendorDirectory } from './components/VendorDirectory';
import { TicketDetailModal } from './components/TicketDetailModal';
import { AnalyticsReportModal } from './components/AnalyticsReportModal';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { LoginPage } from './components/LoginPage';
import { RegisterPage } from './components/RegisterPage';
import { useAuth } from './context/AuthContext';
import { api } from './lib/api';
import { Ticket, Vendor, NotificationLog, AgentActivityLog, SocietyProfile, ResidentProfile, DailyReport } from './types';

export default function App() {
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const role = user?.role || 'guest';
  const isManager = role === 'maintenance' || role === 'admin';
  const [activeTab, setActiveTab] = useState<'resident' | 'manager' | 'vendors'>('resident');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [agentLogs, setAgentLogs] = useState<AgentActivityLog[]>([]);
  const [societyProfile, setSocietyProfile] = useState<SocietyProfile | null>(null);
  const [residentProfiles, setResidentProfiles] = useState<ResidentProfile[]>([]);
  const [analytics, setAnalytics] = useState<DailyReport | null>(null);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isNotifsOpen, setIsNotifsOpen] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isFollowupRunning, setIsFollowupRunning] = useState(false);

  // Get current path for route handling
  const [pathname, setPathname] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (isAuthenticated) fetchInitialData();
  }, [isAuthenticated, isManager]);

  // Enforce tab restrictions for residents
  useEffect(() => {
    if (role === 'resident') {
      setActiveTab('resident');
    }
  }, [role]);

  const fetchInitialData = async () => {
    try {
      // Available to any signed-in user. The server scopes the ticket list to
      // the caller's own flat unless they are maintenance staff or an admin.
      const [ticketsData, vendorsData, profileData] = await Promise.all([
        api('/api/tickets'),
        api('/api/vendors'),
        api('/api/society-profile'),
      ]);

      if (ticketsData.tickets) setTickets(ticketsData.tickets);
      if (vendorsData.vendors) setVendors(vendorsData.vendors);
      if (profileData) setSocietyProfile(profileData);

      // Manager-only endpoints. Requesting them as a resident would just 403,
      // so they are skipped rather than failing the whole load.
      if (!isManager) return;

      const [notifsData, logsData, residentsData, analyticsData] = await Promise.all([
        api('/api/notifications'),
        api('/api/logs'),
        api('/api/resident-profiles'),
        api('/api/analytics'),
      ]);

      if (notifsData.notifications) setNotifications(notifsData.notifications);
      if (logsData.logs) setAgentLogs(logsData.logs);
      if (residentsData.residents) setResidentProfiles(residentsData.residents);
      if (analyticsData) setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to fetch backend data:', err);
    }
  };

  const handleRunFollowupCycle = async () => {
    setIsFollowupRunning(true);
    try {
      await api('/api/followup/run', { method: 'POST' });
      await fetchInitialData();
    } catch (err) {
      console.error('Failed to run followup cycle:', err);
    } finally {
      setIsFollowupRunning(false);
    }
  };

  const handleAssignVendor = async (ticketId: string, vendorId: string) => {
    try {
      await api(`/api/tickets/${ticketId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ vendorId, estimatedEta: '25 mins' }),
      });
      await fetchInitialData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(await api(`/api/tickets/${ticketId}`));
      }
    } catch (err) {
      console.error('Error assigning vendor:', err);
    }
  };

  const handleEscalateTicket = async (ticketId: string, reason: string) => {
    try {
      await api(`/api/tickets/${ticketId}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await fetchInitialData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(await api(`/api/tickets/${ticketId}`));
      }
    } catch (err) {
      console.error('Error escalating ticket:', err);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    try {
      await api(`/api/tickets/${ticketId}/close`, {
        method: 'POST',
        body: JSON.stringify({ feedback: 'Resolved by Manager/Resident' }),
      });
      await fetchInitialData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket(await api(`/api/tickets/${ticketId}`));
      }
    } catch (err) {
      console.error('Error closing ticket:', err);
    }
  };

  const handleAssignVendorToOpenTicket = (vendorId: string) => {
    const openTicket = tickets.find(t => t.status === 'Open');
    if (openTicket) {
      handleAssignVendor(openTicket.id, vendorId);
      setActiveTab('manager');
    } else {
      alert('No unassigned open ticket found right now. All open tickets are dispatched!');
    }
  };

  // Show login/register pages when on those paths
  if (pathname === '/login') {
    return <LoginPage />;
  }

  if (pathname === '/register') {
    return <RegisterPage />;
  }

  // Everything past this point needs a session. The API rejects anonymous
  // requests now, so rendering the dashboard behind a prompt would show empty
  // panels and a wall of 401s rather than anything useful.
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500">
        Checking your session...
      </div>
    );
  }

  if (!isAuthenticated) {
    const goTo = (path: string) => {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
          <h2 className="text-2xl font-bold mb-4 text-center">Please Log In</h2>
          <p className="mb-4 text-center text-slate-600">To access SocietyOps AI features, please log in or create an account.</p>
          <div className="space-y-3">
            <button
              onClick={() => goTo('/login')}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            >
              Log In
            </button>
            <button
              onClick={() => goTo('/register')}
              className="w-full px-4 py-2 rounded-lg border border-indigo-600 hover:border-indigo-700 text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Create Account
            </button>
          </div>
          <p className="mt-4 text-center text-sm text-slate-500">
            Demo Accounts: {' '}
            Vikram/<span className="text-blue-500 font-mono">vikram123</span>, {' '}
            Ananya/<span className="text-blue-500 font-mono">ananya123</span>, {' '}
            Arvind/<span className="text-blue-500 font-mono">arvind123</span>, {' '}
            Admin/<span className="text-blue-500 font-mono">admin123</span>
          </p>
        </div>
      </div>
    );
  }

  // Authenticated app
  return (
    <>
      {/* Auth Provider Wrapper - handled by index.tsx */}

      <div className={`min-h-screen font-sans transition-colors ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

        {/* Top Header */}
        <NavigationHeader
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          societyName="Shree Ram Enclave RWA, Powai"
          isDarkMode={isDarkMode}
          setIsDarkMode={setIsDarkMode}
          unreadNotifsCount={notifications.length}
          onOpenNotifs={() => setIsNotifsOpen(true)}
          onOpenReport={() => setIsReportOpen(true)}
          onRunFollowupCycle={handleRunFollowupCycle}
          isFollowupRunning={isFollowupRunning}
          user={user}
        />

        {/* Main Content Body */}
        <main className="pb-12">
          {activeTab === 'resident' && (
            <ResidentChat
              onTicketSelect={(t) => setSelectedTicket(t)}
              isDarkMode={isDarkMode}
              onRefreshTickets={fetchInitialData}
            />
          )}

          {activeTab === 'manager' && (
            <ManagerDashboard
              tickets={tickets}
              vendors={vendors}
              agentLogs={agentLogs}
              societyProfile={societyProfile}
              residentProfiles={residentProfiles}
              analytics={analytics}
              onTicketSelect={(t) => setSelectedTicket(t)}
              onRefresh={fetchInitialData}
              isDarkMode={isDarkMode}
              onAssignVendor={handleAssignVendor}
              onEscalateTicket={handleEscalateTicket}
              onCloseTicket={handleCloseTicket}
            />
          )}

          {activeTab === 'vendors' && (
            <VendorDirectory
              vendors={vendors}
              isDarkMode={isDarkMode}
              onAssignVendorToOpenTicket={handleAssignVendorToOpenTicket}
            />
          )}
        </main>

        {/* Ticket Detail Modal */}
        <TicketDetailModal
          ticket={selectedTicket}
          vendors={vendors}
          onClose={() => setSelectedTicket(null)}
          isDarkMode={isDarkMode}
          onAssignVendor={handleAssignVendor}
          onEscalateTicket={handleEscalateTicket}
          onCloseTicket={handleCloseTicket}
        />

        {/* Daily Report Modal */}
        <AnalyticsReportModal
          isOpen={isReportOpen}
          onClose={() => setIsReportOpen(false)}
          isDarkMode={isDarkMode}
        />

        {/* Notifications Drawer */}
        <NotificationsDrawer
          isOpen={isNotifsOpen}
          onClose={() => setIsNotifsOpen(false)}
          notifications={notifications}
          isDarkMode={isDarkMode}
        />
      </div>
    </>
  );
}