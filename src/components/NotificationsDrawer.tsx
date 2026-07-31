import React from 'react';
import { NotificationLog } from '../types';
import { X, Bell, MessageSquare, Phone, CheckCheck, Send } from 'lucide-react';

interface NotificationsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationLog[];
  isDarkMode: boolean;
}

export const NotificationsDrawer: React.FC<NotificationsDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  isDarkMode,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-xs animate-fadeIn">
      <div
        className={`w-full max-w-md h-full shadow-2xl border-l flex flex-col ${
          isDarkMode ? 'bg-[#181817] border-[#2D2D2A] text-slate-100' : 'bg-white border-[#E5E5E1] text-[#1A1A1A]'
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#E5E5E1] dark:border-[#2D2D2A] bg-[#FBFBFA] dark:bg-[#1C1C1B] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-[#6366F1]" />
            <h2 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white">Communication Dispatch Logs</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#888888] hover:bg-[#F0F0EE] dark:hover:bg-[#222220] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Logs list */}
        <div className="p-4 overflow-y-auto flex-1 space-y-3 text-xs">
          {notifications.length === 0 ? (
            <p className="text-[#888888] text-center py-8">No notifications dispatched yet.</p>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-3.5 rounded border space-y-1.5 ${
                  isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[#6366F1] uppercase text-[11px] tracking-wider">
                    To: {notif.recipientName} ({notif.recipientType})
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-[#ECFDF5] text-[#059669]">
                    {notif.channel}
                  </span>
                </div>

                <p className="text-[#1A1A1A] dark:text-slate-300 leading-relaxed font-sans text-xs">{notif.message}</p>

                <div className="flex items-center justify-between text-[10px] text-[#888888] pt-1 border-t border-[#E5E5E1] dark:border-[#2D2D2A]">
                  <span>Ticket #{notif.ticketId} | Lang: {notif.language}</span>
                  <span className="flex items-center space-x-1 text-[#10B981] font-bold uppercase">
                    <CheckCheck className="w-3 h-3" />
                    <span>{notif.status}</span>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
