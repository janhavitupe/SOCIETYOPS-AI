import React, { useEffect, useState } from 'react';
import { Ticket, Vendor, AgentActivityLog, IssueCategory, UrgencyLevel, TicketStatus, SocietyProfile, ResidentProfile, DailyReport } from '../types';
import { Wrench, Clock, CheckCircle2, AlertTriangle, Search, Filter, ShieldAlert, ArrowUpRight, UserCheck, RefreshCw, Zap, Eye, MoreHorizontal, ChevronRight, BarChart3, Radio, Building2, KeyRound, Sparkles, Users2 } from 'lucide-react';

interface ManagerDashboardProps {
  tickets: Ticket[];
  vendors: Vendor[];
  agentLogs: AgentActivityLog[];
  societyProfile: SocietyProfile | null;
  residentProfiles: ResidentProfile[];
  analytics: DailyReport | null;
  onTicketSelect: (ticket: Ticket) => void;
  onRefresh: () => void;
  isDarkMode: boolean;
  onAssignVendor: (ticketId: string, vendorId: string) => void;
  onEscalateTicket: (ticketId: string, reason: string) => void;
  onCloseTicket: (ticketId: string) => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  tickets,
  vendors,
  agentLogs,
  societyProfile,
  residentProfiles,
  analytics,
  onTicketSelect,
  onRefresh,
  isDarkMode,
  onAssignVendor,
  onEscalateTicket,
  onCloseTicket,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedUrgency, setSelectedUrgency] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);
  const [targetVendorId, setTargetVendorId] = useState<string>('');
  const [introText, setIntroText] = useState(societyProfile?.introText || '');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  useEffect(() => {
    setIntroText(societyProfile?.introText || '');
  }, [societyProfile?.introText]);

  // Statistics calculation
  const totalOpen = tickets.filter(t => t.status === 'Open').length;
  const inProgress = tickets.filter(t => t.status === 'Vendor Assigned' || t.status === 'In Progress').length;
  const resolvedToday = tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
  const highPriority = tickets.filter(t => t.urgency === 'High' || t.status === 'Escalated').length;

  // Filtered tickets
  const filteredTickets = tickets.filter(t => {
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !searchQuery ||
      t.id.toLowerCase().includes(q) ||
      t.flatNumber.toLowerCase().includes(q) ||
      t.residentName.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      (t.assignedVendorName && t.assignedVendorName.toLowerCase().includes(q));

    const matchesCategory = selectedCategory === 'All' || t.issueCategory === selectedCategory;
    const matchesUrgency = selectedUrgency === 'All' || t.urgency === selectedUrgency;
    const matchesStatus = selectedStatus === 'All' || t.status === selectedStatus;

    return matchesQuery && matchesCategory && matchesUrgency && matchesStatus;
  });

  const categories = ['All', 'Plumbing', 'Electrical', 'Lift & Elevator', 'Carpentry & Locks', 'AC & Appliances', 'Cleaning & Pest', 'Security & Intercom'];
  const urgencies = ['All', 'High', 'Medium', 'Low'];
  const statuses = ['All', 'Open', 'Vendor Assigned', 'In Progress', 'Escalated', 'Resolved', 'Closed'];

  const handleExecuteAssign = (ticketId: string) => {
    if (!targetVendorId) return;
    onAssignVendor(ticketId, targetVendorId);
    setAssigningTicketId(null);
    setTargetVendorId('');
  };

  const handleSaveProfile = async () => {
    if (!societyProfile) return;
    setIsSavingProfile(true);
    try {
      const res = await fetch('/api/society-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...societyProfile, introText, lastUpdatedBy: 'Maintenance Team' }),
      });
      if (res.ok) {
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to save society profile:', err);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleIssueToken = async (profileId: string) => {
    try {
      await fetch(`/api/resident-profiles/${profileId}/token`, { method: 'POST' });
      await onRefresh();
    } catch (err) {
      console.error('Failed to issue token:', err);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Top Banner & Control Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-[#E5E5E1] dark:border-[#2D2D2A]">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-light uppercase tracking-tighter leading-none text-[#1A1A1A] dark:text-white">
            Operations<br />
            <span className="text-[#6366F1] font-normal">Manager Control</span>
          </h1>
          <p className="text-xs text-[#71716A] dark:text-slate-400 mt-2 font-medium uppercase tracking-wider">
            Real-time Maintenance Operations & Autonomous AI Vendor Dispatch
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="text-right hidden sm:block mr-2">
            <div className="text-[10px] uppercase tracking-wider text-[#888888] font-bold">Active Society</div>
            <div className="text-sm font-bold text-[#1A1A1A] dark:text-white">Shree Ram Enclave RWA</div>
          </div>
          <button
            onClick={onRefresh}
            className={`px-3.5 py-2 rounded border text-xs font-bold uppercase tracking-wider flex items-center space-x-1.5 transition-all cursor-pointer ${
              isDarkMode ? 'bg-[#222220] border-[#2D2D2A] text-slate-200 hover:bg-[#2A2A28]' : 'bg-white border-[#E5E5E1] text-[#1A1A1A] hover:bg-[#F8F8F7] shadow-2xs'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#6366F1]" />
            <span>Sync Data</span>
          </button>
        </div>
      </div>

      {/* Society Intro / Maintainer Profile Panel */}
      <div className={`rounded-lg border p-4 space-y-4 ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center space-x-2 text-[#6366F1] font-bold text-[10px] uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5" /> Society Profile
            </div>
            <h2 className="text-xl font-semibold text-[#1A1A1A] dark:text-white mt-1">{societyProfile?.societyName || 'Society Profile'}</h2>
            <p className="text-sm text-[#71716A] dark:text-slate-400 mt-1">{societyProfile?.tagline || 'Maintenance operations profile managed by the society maintainer.'}</p>
          </div>
          <div className="text-right text-xs text-[#888888]">
            <div className="font-semibold">Managed by</div>
            <div className="text-[#1A1A1A] dark:text-white">{societyProfile?.maintenanceContact || 'Maintenance Team'}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-[1.2fr_0.8fr] gap-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-wider font-bold text-[#888888]">Introduction message</label>
            <textarea
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              rows={4}
              className={`w-full rounded border px-3 py-2 text-sm outline-none ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A] text-white' : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A]'}`}
            />
            <button
              onClick={handleSaveProfile}
              disabled={isSavingProfile}
              className="px-3 py-2 rounded bg-[#6366F1] text-white text-xs font-bold uppercase tracking-wider disabled:opacity-60"
            >
              {isSavingProfile ? 'Saving...' : 'Save Society Intro'}
            </button>
          </div>

          <div className={`rounded-lg border p-3 space-y-2 ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
            <div className="flex items-center space-x-2 text-[#6366F1] font-bold text-[10px] uppercase tracking-wider">
              <KeyRound className="w-3.5 h-3.5" /> Admin access overview
            </div>
            <div className="text-sm text-[#1A1A1A] dark:text-white">{societyProfile?.address || 'Powai, Mumbai'}</div>
            <div className="text-xs text-[#71716A] dark:text-slate-400">{societyProfile?.maintenancePhone || '+91 98765 11111'} • {societyProfile?.maintenanceEmail || 'maintenance@srerwa.org'}</div>
            <div className="flex flex-wrap gap-2 pt-2">
              {societyProfile?.highlights?.map((item) => (
                <span key={item} className="px-2 py-1 rounded-full bg-indigo-50 text-[#6366F1] text-[10px] font-semibold">{item}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className={`p-4 rounded-lg border transition-all ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#888888]">Open Queue</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-[#1A1A1A] dark:text-white">{totalOpen}</div>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
            Requires Dispatch
          </p>
        </div>

        <div className={`p-4 rounded-lg border transition-all ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#888888]">In Progress</span>
            <Wrench className="w-4 h-4 text-[#6366F1]" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-[#1A1A1A] dark:text-white">{inProgress}</div>
          <p className="text-[11px] text-[#6366F1] font-semibold mt-1">
            Vendors Active
          </p>
        </div>

        <div className={`p-4 rounded-lg border transition-all ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#888888]">Escalated / High</span>
            <ShieldAlert className="w-4 h-4 text-[#EF4444]" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-[#EF4444]">{highPriority}</div>
          <p className="text-[11px] text-[#EF4444] font-semibold mt-1">
            Priority Action
          </p>
        </div>

        <div className={`p-4 rounded-lg border transition-all ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-[10px] uppercase tracking-widest font-bold text-[#888888]">Resolved Today</span>
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
          </div>
          <div className="text-3xl font-semibold tracking-tight text-[#10B981]">{resolvedToday}</div>
          <p className="text-[11px] text-[#10B981] font-semibold mt-1">
            Avg: 18m response
          </p>
        </div>

      </div>

      {/* Resident Access & Admin Token Panel */}
      <div className={`rounded-lg border p-4 ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="flex items-center space-x-2 text-[#6366F1] font-bold text-[10px] uppercase tracking-wider">
              <Users2 className="w-3.5 h-3.5" /> Residents & access tokens
            </div>
            <h3 className="text-lg font-semibold text-[#1A1A1A] dark:text-white mt-1">Resident profiles and token registry</h3>
          </div>
          <div className="text-right text-[10px] uppercase tracking-wider text-[#888888]">
            <div>Active residents</div>
            <div className="text-base font-semibold text-[#1A1A1A] dark:text-white">{residentProfiles.length}</div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`border-b ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A] text-[#888888]' : 'bg-[#F9F9F8] border-[#E5E5E1] text-[#71716A]'}`}>
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Flat</th>
                <th className="p-2">Role</th>
                <th className="p-2">Token</th>
                <th className="p-2">Generated</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {residentProfiles.map((profile) => (
                <tr key={profile.id} className="border-b border-[#F0F0EE] dark:border-[#222220]">
                  <td className="p-2 font-semibold text-[#1A1A1A] dark:text-white">{profile.name}</td>
                  <td className="p-2">{profile.flatNumber}</td>
                  <td className="p-2 capitalize">{profile.role}</td>
                  <td className="p-2 font-mono text-[#6366F1]">{profile.accessToken}</td>
                  <td className="p-2">{profile.tokensGenerated}</td>
                  <td className="p-2">
                    <button
                      onClick={() => handleIssueToken(profile.id)}
                      className="px-2 py-1 rounded bg-[#F0F0EE] dark:bg-[#222220] text-[#1A1A1A] dark:text-slate-200 text-[10px] font-bold uppercase tracking-wider"
                    >
                      Issue New
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Main Table + Live Agent Feed Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Tickets Table (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Filters & Search */}
          <div className={`p-4 rounded-lg border space-y-3 ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-[#888888]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by Ticket ID, Flat, Resident, Vendor..."
                  className={`w-full pl-9 pr-4 py-2 rounded text-xs border outline-none ${
                    isDarkMode ? 'bg-[#121211] border-[#2D2D2A] text-white focus:border-[#6366F1]' : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A] focus:border-[#6366F1]'
                  }`}
                />
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#888888] font-bold text-[10px] uppercase tracking-wider mr-1 flex items-center">
                <Filter className="w-3 h-3 mr-1 text-[#6366F1]" /> Category:
              </span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className={`px-2.5 py-1 rounded border text-xs font-medium outline-none ${
                  isDarkMode ? 'bg-[#222220] border-[#2D2D2A] text-slate-200' : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A]'
                }`}
              >
                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>

              <span className="text-[#888888] font-bold text-[10px] uppercase tracking-wider ml-2 mr-1">Urgency:</span>
              <select
                value={selectedUrgency}
                onChange={(e) => setSelectedUrgency(e.target.value)}
                className={`px-2.5 py-1 rounded border text-xs font-medium outline-none ${
                  isDarkMode ? 'bg-[#222220] border-[#2D2D2A] text-slate-200' : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A]'
                }`}
              >
                {urgencies.map(u => <option key={u} value={u}>{u}</option>)}
              </select>

              <span className="text-[#888888] font-bold text-[10px] uppercase tracking-wider ml-2 mr-1">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className={`px-2.5 py-1 rounded border text-xs font-medium outline-none ${
                  isDarkMode ? 'bg-[#222220] border-[#2D2D2A] text-slate-200' : 'bg-[#FAFAF9] border-[#E5E5E1] text-[#1A1A1A]'
                }`}
              >
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Tickets Table */}
          <div className={`rounded-lg border overflow-hidden ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
            <div className="p-4 border-b border-[#E5E5E1] dark:border-[#2D2D2A] bg-[#FBFBFA] dark:bg-[#1E1E1C] flex items-center justify-between">
              <h2 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white flex items-center space-x-2">
                <span>Real-Time Maintenance Queue ({filteredTickets.length})</span>
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`border-b ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A] text-[#888888]' : 'bg-[#F9F9F8] border-[#E5E5E1] text-[#71716A]'}`}>
                  <tr className="text-[10px] font-bold uppercase tracking-wider">
                    <th className="p-3">ID</th>
                    <th className="p-3">ISSUE / UNIT</th>
                    <th className="p-3">URGENCY</th>
                    <th className="p-3">STATUS</th>
                    <th className="p-3">VENDOR</th>
                    <th className="p-3 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0EE] dark:divide-[#222220]">
                  {filteredTickets.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-[#888888]">
                        No maintenance tickets matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-[#F9F9F8] dark:hover:bg-[#1E1E1C] transition-colors">
                        
                        {/* Ticket ID */}
                        <td className="p-3 font-mono font-bold text-[#6366F1]">
                          #{t.id}
                        </td>

                        {/* Flat & Issue */}
                        <td className="p-3">
                          <div className="font-bold text-[#1A1A1A] dark:text-slate-100">{t.description.length > 35 ? t.description.slice(0, 35) + '...' : t.description}</div>
                          <div className="text-[11px] text-[#71716A] dark:text-slate-400">
                            Block {t.flatNumber} — {t.residentName}
                          </div>
                        </td>

                        {/* Urgency */}
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              t.urgency === 'High'
                                ? 'text-[#EF4444] font-black'
                                : t.urgency === 'Medium'
                                ? 'text-amber-600 font-bold'
                                : 'text-slate-500 font-semibold'
                            }`}
                          >
                            {t.urgency}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              t.status === 'Escalated'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : t.status === 'Open'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : t.status === 'Vendor Assigned' || t.status === 'In Progress'
                                ? 'bg-[#ECFDF5] text-[#059669] dark:bg-emerald-950/80 dark:text-emerald-300'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>

                        {/* Vendor */}
                        <td className="p-3">
                          {t.assignedVendorName ? (
                            <div>
                              <div className="font-bold text-[#1A1A1A] dark:text-slate-200">{t.assignedVendorName}</div>
                              <div className="text-[10px] text-[#6366F1]">ETA: {t.estimatedEta || '25m'}</div>
                            </div>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 italic text-[11px]">Unassigned</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            
                            {/* Details modal trigger */}
                            <button
                              onClick={() => onTicketSelect(t)}
                              className="p-1.5 rounded text-slate-500 hover:text-[#6366F1] hover:bg-[#F0F0EE] dark:hover:bg-[#222220] cursor-pointer"
                              title="View Detailed Audit Log"
                            >
                              <Eye className="w-4 h-4" />
                            </button>

                            {/* Assign Vendor button */}
                            {assigningTicketId === t.id ? (
                              <div className="flex items-center space-x-1">
                                <select
                                  value={targetVendorId}
                                  onChange={(e) => setTargetVendorId(e.target.value)}
                                  className="text-[11px] p-1 border rounded bg-white text-black"
                                >
                                  <option value="">Vendor...</option>
                                  {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name} ({v.rating} stars)</option>
                                  ))}
                                </select>
                                <button
                                  onClick={() => handleExecuteAssign(t.id)}
                                  className="px-2 py-1 bg-[#1A1A1A] text-white rounded text-[10px] font-bold uppercase"
                                >
                                  Save
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setAssigningTicketId(t.id)}
                                className="px-2 py-1 bg-[#F0F0EE] dark:bg-[#222220] text-[#1A1A1A] dark:text-slate-200 rounded hover:bg-[#6366F1] hover:text-white text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-colors"
                              >
                                {t.assignedVendorId ? 'Reassign' : 'Assign'}
                              </button>
                            )}

                            {/* Escalate button */}
                            {t.status !== 'Escalated' && t.status !== 'Closed' && (
                              <button
                                onClick={() => onEscalateTicket(t.id, 'Manager Priority Escalation')}
                                className="px-2 py-1 bg-rose-50 text-[#EF4444] rounded hover:bg-rose-100 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                              >
                                Escalate
                              </button>
                            )}

                            {/* Close button */}
                            {t.status !== 'Closed' && (
                              <button
                                onClick={() => onCloseTicket(t.id)}
                                className="px-2 py-1 bg-emerald-50 text-[#059669] rounded hover:bg-emerald-100 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                              >
                                Close
                              </button>
                            )}

                          </div>
                        </td>

                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* Right Column: AI Agent Activity Feed (1 col) */}
        <div className="space-y-4">
          
          <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'}`}>
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E5E1] dark:border-[#2D2D2A] mb-3">
              <h2 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white flex items-center space-x-2">
                <Radio className="w-4 h-4 text-[#6366F1] animate-pulse" />
                <span>Autonomous Agent Feed</span>
              </h2>
            </div>

            {analytics && (
              <div className={`mb-3 rounded border p-3 text-xs space-y-2 ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                <div className="flex items-center space-x-2 text-[#6366F1] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> Daily summary
                </div>
                <div className="font-semibold text-[#1A1A1A] dark:text-white">{analytics.summaryText}</div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="px-2 py-1 rounded bg-amber-50 text-amber-700">SLA at risk: {analytics.slaAtRiskCount || 0}</span>
                  <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700">Top category: {analytics.frequentCategory}</span>
                </div>
              </div>
            )}

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {agentLogs.length === 0 ? (
                <p className="text-xs text-[#888888]">No recent agent activity logs.</p>
              ) : (
                agentLogs.map((log) => (
                  <div key={log.id} className={`p-3 rounded border text-xs space-y-1 ${
                    isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] uppercase tracking-wider text-[#6366F1]">
                        [{log.agentName}]
                      </span>
                      <span className="text-[10px] text-[#888888]">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="font-bold text-[#1A1A1A] dark:text-slate-200">
                      {log.action} {log.ticketId && `#${log.ticketId}`}
                    </div>

                    <p className="text-[11px] text-[#71716A] dark:text-slate-400 leading-relaxed">
                      {log.details}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
