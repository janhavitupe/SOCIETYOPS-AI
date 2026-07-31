import React from 'react';
import { Building2, MessageSquare, LayoutDashboard, ShieldCheck, Zap, Bell, Sun, Moon, Users } from 'lucide-react';

interface NavigationHeaderProps {
  activeTab: 'resident' | 'manager' | 'vendors';
  setActiveTab: (tab: 'resident' | 'manager' | 'vendors') => void;
  societyName: string;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  unreadNotifsCount: number;
  onOpenNotifs: () => void;
  onOpenReport: () => void;
  onRunFollowupCycle: () => void;
  isFollowupRunning: boolean;
}

export const NavigationHeader: React.FC<NavigationHeaderProps> = ({
  activeTab,
  setActiveTab,
  societyName,
  isDarkMode,
  setIsDarkMode,
  unreadNotifsCount,
  onOpenNotifs,
  onOpenReport,
  onRunFollowupCycle,
  isFollowupRunning,
}) => {
  return (
    <header className={`border-b sticky top-0 z-30 transition-colors ${isDarkMode ? 'bg-[#181817] border-[#2D2D2A] text-slate-100' : 'bg-white border-[#E5E5E1] text-[#1A1A1A]'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Society Name */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-black font-black text-xl leading-none">SO</span>
              <span className="font-bold text-base tracking-tight text-black uppercase font-mono">
                SOCIETYOPS <span className="text-black">AI</span>
              </span>
            </div>
            <div className="hidden sm:block h-4 w-px bg-[#E5E5E1] dark:bg-[#2D2D2A]" />
            <div className="hidden sm:flex items-center space-x-1.5">
              <span className="text-xs text-[#71716A] dark:text-slate-400 font-medium">
                {societyName}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-[#6366F1] dark:bg-indigo-950/80 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <ShieldCheck className="w-3 h-3 mr-1" /> Autonomous Agent
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center space-x-1 bg-[#F0F0EE] dark:bg-[#222220] p-1 rounded-md border border-[#E5E5E1] dark:border-[#2D2D2A]">
            <button
              onClick={() => setActiveTab('resident')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'resident'
                  ? 'bg-white dark:bg-[#181817] text-[#6366F1] shadow-2xs'
                  : 'text-[#666660] dark:text-slate-400 hover:text-[#1A1A1A] dark:hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Resident Chat</span>
            </button>

            <button
              onClick={() => setActiveTab('manager')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'manager'
                  ? 'bg-white dark:bg-[#181817] text-[#6366F1] shadow-2xs'
                  : 'text-[#666660] dark:text-slate-400 hover:text-[#1A1A1A] dark:hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('vendors')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === 'vendors'
                  ? 'bg-white dark:bg-[#181817] text-[#6366F1] shadow-2xs'
                  : 'text-[#666660] dark:text-slate-400 hover:text-[#1A1A1A] dark:hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Vendors</span>
            </button>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Auto-Pilot Trigger Button */}
            <button
              onClick={onRunFollowupCycle}
              disabled={isFollowupRunning}
              title="Trigger Follow-up Agent autonomous ticket monitoring"
              className="hidden lg:flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900 transition-all cursor-pointer"
            >
              <Zap className={`w-3.5 h-3.5 text-amber-600 ${isFollowupRunning ? 'animate-spin' : ''}`} />
              <span>{isFollowupRunning ? 'Checking...' : 'Run Agent Follow-up'}</span>
            </button>

            {/* Daily Report Button */}
            <button
              onClick={onOpenReport}
              className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-[#1A1A1A] text-white dark:bg-white dark:text-[#1A1A1A] hover:bg-black dark:hover:bg-slate-100 transition-all cursor-pointer shadow-2xs"
            >
              <span>Daily AI Report</span>
            </button>

            {/* Notification Drawer Button */}
            <button
              onClick={onOpenNotifs}
              className="relative p-2 rounded text-[#666660] dark:text-slate-300 hover:bg-[#F0F0EE] dark:hover:bg-[#222220] transition-all cursor-pointer border border-transparent hover:border-[#E5E5E1]"
              title="Dispatch Communication Logs"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifsCount > 0 && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-[#EF4444] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifsCount > 9 ? '9+' : unreadNotifsCount}
                </span>
              )}
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded text-[#666660] dark:text-slate-300 hover:bg-[#F0F0EE] dark:hover:bg-[#222220] transition-all cursor-pointer border border-transparent hover:border-[#E5E5E1]"
              title="Toggle Theme"
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>

        </div>

        {/* Mobile Sub-Nav */}
        <div className="md:hidden flex items-center justify-around py-2 border-t border-[#E5E5E1] dark:border-[#2D2D2A]">
          <button
            onClick={() => setActiveTab('resident')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
              activeTab === 'resident'
                ? 'bg-[#1A1A1A] text-white'
                : 'text-[#666660] dark:text-slate-400'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('manager')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
              activeTab === 'manager'
                ? 'bg-[#1A1A1A] text-white'
                : 'text-[#666660] dark:text-slate-400'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab('vendors')}
            className={`flex items-center space-x-1 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider ${
              activeTab === 'vendors'
                ? 'bg-[#1A1A1A] text-white'
                : 'text-[#666660] dark:text-slate-400'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Vendors</span>
          </button>
        </div>

      </div>
    </header>
  );
};
