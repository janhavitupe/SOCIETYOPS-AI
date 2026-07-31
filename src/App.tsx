import React, { useState, useEffect } from 'react';
import { NavigationHeader } from './components/NavigationHeader';
import { ResidentChat } from './components/ResidentChat';
import { ManagerDashboard } from './components/ManagerDashboard';
import { VendorDirectory } from './components/VendorDirectory';
import { TicketDetailModal } from './components/TicketDetailModal';
import { AnalyticsReportModal } from './components/AnalyticsReportModal';
import { NotificationsDrawer } from './components/NotificationsDrawer';
import { Ticket, Vendor, NotificationLog, AgentActivityLog, SocietyProfile, ResidentProfile, DailyReport } from './types';

export default function App() {
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

  useEffect(() => {
    fetchInitialData();
  }, []);

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

  return (
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
  );
}
