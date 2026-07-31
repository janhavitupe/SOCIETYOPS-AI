import React, { useState } from 'react';
import { Ticket, Vendor } from '../types';
import { X, Clock, ShieldAlert, Wrench, CheckCircle2, Phone, AlertTriangle, User, Calendar, MessageSquare, Send } from 'lucide-react';

interface TicketDetailModalProps {
  ticket: Ticket | null;
  vendors: Vendor[];
  onClose: () => void;
  isDarkMode: boolean;
  onAssignVendor: (ticketId: string, vendorId: string) => void;
  onEscalateTicket: (ticketId: string, reason: string) => void;
  onCloseTicket: (ticketId: string) => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  vendors,
  onClose,
  isDarkMode,
  onAssignVendor,
  onEscalateTicket,
  onCloseTicket,
}) => {
  if (!ticket) return null;

  const [selectedVendorId, setSelectedVendorId] = useState(ticket.assignedVendorId || '');
  const [escalationReason, setEscalationReason] = useState('');
  const [showEscalateForm, setShowEscalateForm] = useState(false);

  const handleAssign = () => {
    if (selectedVendorId) {
      onAssignVendor(ticket.id, selectedVendorId);
    }
  };

  const handleEscalate = () => {
    if (escalationReason.trim()) {
      onEscalateTicket(ticket.id, escalationReason);
      setShowEscalateForm(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div
        className={`w-full max-w-3xl max-h-[90vh] rounded-lg border shadow-2xl overflow-hidden flex flex-col ${
          isDarkMode ? 'bg-[#181817] border-[#2D2D2A] text-slate-100' : 'bg-white border-[#E5E5E1] text-[#1A1A1A]'
        }`}
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-[#E5E5E1] dark:border-[#2D2D2A] bg-[#FBFBFA] dark:bg-[#1C1C1B] flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono font-bold text-base tracking-tight text-[#6366F1]">
                Ticket #{ticket.id}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  ticket.urgency === 'High'
                    ? 'bg-rose-100 text-[#EF4444]'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {ticket.urgency} Urgency
              </span>
              <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#1A1A1A] text-white">
                {ticket.status}
              </span>
            </div>
            <p className="text-xs text-[#71716A] dark:text-slate-400 mt-1 uppercase font-semibold tracking-wider">
              Society: {ticket.societyName} | Logged: {new Date(ticket.createdAt).toLocaleString()}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded text-[#888888] hover:text-[#1A1A1A] dark:hover:text-white hover:bg-[#F0F0EE] dark:hover:bg-[#222220] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* Main Info Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Resident Details */}
            <div className={`p-4 rounded border ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-slate-200 mb-2 flex items-center space-x-1">
                <User className="w-3.5 h-3.5 text-[#6366F1] mr-1" /> Resident Details
              </h3>
              <div className="space-y-1 text-[#71716A] dark:text-slate-400">
                <div className="flex justify-between">
                  <span>Resident Name:</span>
                  <span className="font-bold text-[#1A1A1A] dark:text-white">{ticket.residentName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Flat Number:</span>
                  <span className="font-mono font-bold text-[#6366F1]">{ticket.flatNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span>Phone Number:</span>
                  <span className="font-bold text-[#1A1A1A] dark:text-slate-200">{ticket.residentPhone}</span>
                </div>
              </div>
            </div>

            {/* Vendor Details */}
            <div className={`p-4 rounded border ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-slate-200 mb-2 flex items-center space-x-1">
                <Wrench className="w-3.5 h-3.5 text-[#6366F1] mr-1" /> Vendor Dispatch
              </h3>
              {ticket.assignedVendorName ? (
                <div className="space-y-1 text-[#71716A] dark:text-slate-400">
                  <div className="flex justify-between">
                    <span>Assigned Vendor:</span>
                    <span className="font-bold text-[#1A1A1A] dark:text-white">{ticket.assignedVendorName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vendor Contact:</span>
                    <span className="font-semibold">{ticket.assignedVendorPhone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Estimated ETA:</span>
                    <span className="font-bold text-[#10B981]">{ticket.estimatedEta || '25 mins'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-amber-600 font-semibold italic">No vendor assigned yet. Use control below to dispatch.</p>
              )}
            </div>

          </div>

          {/* Complaint Description */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-1.5">Complaint Description</h3>
            <div className={`p-3.5 rounded border font-sans leading-relaxed text-xs ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
              {ticket.description}
            </div>
          </div>

          {/* Attached Images */}
          {ticket.images && ticket.images.length > 0 && (
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wider text-[#888888] mb-1.5">Attached Photos</h3>
              <div className="flex gap-2">
                {ticket.images.map((img, idx) => (
                  <img key={idx} src={img} alt="Attached" className="w-32 h-32 object-cover rounded border border-[#E5E5E1]" />
                ))}
              </div>
            </div>
          )}

          {/* Timeline Audit Log */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white mb-2 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-[#6366F1] mr-1" /> Multi-Agent Audit Log & Timeline
            </h3>
            <div className="space-y-2 border-l-2 border-[#6366F1] pl-4 ml-2">
              {ticket.timeline.map((event) => (
                <div key={event.id} className="relative pb-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#1A1A1A] dark:text-slate-100">{event.title}</span>
                    <span className="text-[10px] text-[#888888]">{new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-[#71716A] dark:text-slate-400 mt-0.5">{event.description}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#F0F0EE] dark:bg-[#222220] text-[#6366F1]">
                    By: {event.actor}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Assign Vendor / Reassign Controls */}
          <div className={`p-4 rounded border space-y-3 ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
            <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white">Manager Dispatch Control</h3>
            <div className="flex items-center space-x-2">
              <select
                value={selectedVendorId}
                onChange={(e) => setSelectedVendorId(e.target.value)}
                className={`flex-1 p-2 rounded border text-xs font-semibold outline-none ${
                  isDarkMode ? 'bg-[#181817] border-[#2D2D2A] text-white' : 'bg-white border-[#E5E5E1] text-[#1A1A1A]'
                }`}
              >
                <option value="">Select Vendor to Dispatch...</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category}) — {v.rating} stars [{v.availability}]
                  </option>
                ))}
              </select>

              <button
                onClick={handleAssign}
                disabled={!selectedVendorId}
                className="px-4 py-2 bg-[#6366F1] hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider rounded disabled:opacity-50 cursor-pointer"
              >
                Dispatch Vendor
              </button>
            </div>
          </div>

          {/* Escalation Form */}
          {showEscalateForm ? (
            <div className="p-4 rounded border border border-rose-300 bg-rose-50 dark:bg-rose-950/50 space-y-2">
              <h4 className="font-bold text-xs uppercase tracking-wider text-rose-800 dark:text-rose-200">Escalate Ticket to RWA Committee</h4>
              <input
                type="text"
                value={escalationReason}
                onChange={(e) => setEscalationReason(e.target.value)}
                placeholder="Reason for priority escalation (e.g. Lift trapped, Vendor un-responsive)..."
                className="w-full p-2 border rounded text-xs bg-white dark:bg-[#121211] text-[#1A1A1A] dark:text-white"
              />
              <div className="flex justify-end space-x-2">
                <button onClick={() => setShowEscalateForm(false)} className="px-3 py-1 bg-slate-200 rounded text-xs">Cancel</button>
                <button onClick={handleEscalate} className="px-3 py-1 bg-[#EF4444] text-white font-bold text-xs uppercase tracking-wider rounded">Confirm Escalation</button>
              </div>
            </div>
          ) : (
            ticket.status !== 'Escalated' && ticket.status !== 'Closed' && (
              <div className="flex justify-between items-center">
                <button
                  onClick={() => setShowEscalateForm(true)}
                  className="px-4 py-2 bg-rose-50 text-[#EF4444] border border-rose-200 rounded text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-rose-100"
                >
                  Trigger Emergency Escalation
                </button>

                <button
                  onClick={() => {
                    onCloseTicket(ticket.id);
                    onClose();
                  }}
                  className="px-4 py-2 bg-[#10B981] text-white font-bold text-xs uppercase tracking-wider rounded cursor-pointer hover:bg-emerald-600"
                >
                  Mark Closed
                </button>
              </div>
            )
          )}

        </div>
      </div>
    </div>
  );
};
