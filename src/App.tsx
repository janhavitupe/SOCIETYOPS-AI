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
import { Ticket, Vendor, NotificationLog, AgentActivityLog, SocietyProfile, ResidentProfile, DailyReport } from './types';

export default function App() {
  const { user, isAuthenticated } = useAuth();
  const role = user?.role || 'guest';
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
    fetchInitialData();
  }, []);

  // Enforce tab restrictions for residents
  useEffect(() => {
    if (role === 'resident') {
      setActiveTab('resident');
    }
  }, [role]);

  const fetchInitialData = async () => {
    try {
      const [ticketsRes, vendorsRes, notifsRes, logsRes, profileRes, residentsRes, analyticsRes] = await Promise.all([
        fetch('/api/tickets'),
        fetch('/api/vendors'),
        fetch('/api/notifications'),
        fetch('/api/logs'),
        fetch('/api/society-profile'),
        fetch('/api/resident-profiles'),
        fetch('/api/analytics'),
      ]);

      const ticketsData = await ticketsRes.json();
      const vendorsData = await vendorsRes.json();
      const notifsData = await notifsRes.json();
      const logsData = await logsRes.json();
      const profileData = await profileRes.json();
      const residentsData = await residentsRes.json();
      const analyticsData = await analyticsRes.json();

      if (ticketsData.tickets) setTickets(ticketsData.tickets);
      if (vendorsData.vendors) setVendors(vendorsData.vendors);
      if (notifsData.notifications) setNotifications(notifsData.notifications);
      if (logsData.logs) setAgentLogs(logsData.logs);
      if (profileData) setSocietyProfile(profileData);
      if (residentsData.residents) setResidentProfiles(residentsData.residents);
      if (analyticsData) setAnalytics(analyticsData);
    } catch (err) {
      console.error('Failed to fetch backend data:', err);
    }
  };

  const handleRunFollowupCycle = async () => {
    setIsFollowupRunning(true);
    try {
      await fetch('/api/followup/run', { method: 'POST' });
      await fetchInitialData();
    } catch (err) {
      console.error('Failed to run followup cycle:', err);
    } finally {
      setIsFollowupRunning(false);
    }
  };

  const handleAssignVendor = async (ticketId: string, vendorId: string) => {
    try {
      await fetch(`/api/tickets/${ticketId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, estimatedEta: '25 mins' }),
      });
      await fetchInitialData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        const updatedRes = await fetch(`/api/tickets/${ticketId}`);
        const updated = await updatedRes.json();
        setSelectedTicket(updated);
      }
    } catch (err) {
      console.error('Error assigning vendor:', err);
    }
  };

  const handleEscalateTicket = async (ticketId: string, reason: string) => {
    try {
      await fetch(`/api/tickets/${ticketId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      await fetchInitialData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        const updatedRes = await fetch(`/api/tickets/${ticketId}`);
        const updated = await updatedRes.json();
        setSelectedTicket(updated);
      }
    } catch (err) {
      console.error('Error escalating ticket:', err);
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    try {
      await fetch(`/api/tickets/${ticketId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback: 'Resolved by Manager/Resident' }),
      });
      await fetchInitialData();
      if (selectedTicket && selectedTicket.id === ticketId) {
        const updatedRes = await fetch(`/api/tickets/${ticketId}`);
        const updated = await updatedRes.json();
        setSelectedTicket(updated);
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

  // If not authenticated, redirect to login (but allow access to auth pages)
  if (!isAuthenticated && pathname !== '/login' && pathname !== '/register') {
    // For backward compatibility, we'll still show the app but show a login prompt
    // In a production app, we'd redirect to /login here
    // But to maintain backward compatibility as requested, we'll show the app with a login banner
    return (
      <>
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-4 text-center">Please Log In</h2>
            <p className="mb-4 text-center">To access SocietyOps AI features, please log in or create an account.</p>
            <div className="space-y-3">
              <button
                onClick={() => {
                  window.history.pushState({}, '', '/login');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
                className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                Log In
              </button>
              <button
                onClick={() => {
                  window.history.pushState({}, '', '/register');
                  window.dispatchEvent(new PopStateEvent('popstate'));
                }}
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
        <main className="pb-12">
          {activeTab === 'resident' && (
            <ResidentChat
              onTicketSelect={(t) => setSelectedTicket(t)}
              isDarkMode={isDarkMode}
              onRefreshTickets={fetchInitialData}
            />
          )}

          {role !== 'resident' && activeTab === 'manager' && (
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

          {role !== 'resident' && activeTab === 'vendors' && (
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
        {role !== 'resident' && (
          <AnalyticsReportModal
            isOpen={isReportOpen}
            onClose={() => setIsReportOpen(false)}
            isDarkMode={isDarkMode}
          />
        )}

        {/* Notifications Drawer - managers only */}
        {role !== 'resident' && (
          <NotificationsDrawer
            isOpen={isNotifsOpen}
            onClose={() => setIsNotifsOpen(false)}
            notifications={notifications}
            isDarkMode={isDarkMode}
          />
        )}
      </>
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