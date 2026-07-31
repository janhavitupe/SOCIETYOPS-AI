import React, { useState, useEffect } from 'react';
import { DailyReport } from '../types';
import { X, BarChart2, CheckCircle2, Clock, AlertTriangle, TrendingUp, Sparkles, ShieldCheck } from 'lucide-react';

interface AnalyticsReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
}

export const AnalyticsReportModal: React.FC<AnalyticsReportModalProps> = ({ isOpen, onClose, isDarkMode }) => {
  if (!isOpen) return null;

  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics');
      const data = await res.json();
      setReport(data);
    } catch (err) {
      console.error('Failed to fetch analytics report:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
      <div
        className={`w-full max-w-2xl rounded-lg border shadow-2xl overflow-hidden flex flex-col ${
          isDarkMode ? 'bg-[#181817] border-[#2D2D2A] text-slate-100' : 'bg-white border-[#E5E5E1] text-[#1A1A1A]'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#E5E5E1] dark:border-[#2D2D2A] bg-[#FBFBFA] dark:bg-[#1C1C1B] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-[#6366F1] text-white flex items-center justify-center font-bold text-xs">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white">Daily Society Analytics Report</h2>
              <p className="text-[11px] text-[#71716A] dark:text-slate-400">Automated Intelligence for RWA Management Committee</p>
            </div>
          </div>

          <button onClick={onClose} className="p-1.5 rounded text-[#888888] hover:bg-[#F0F0EE] dark:hover:bg-[#222220] cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh] text-xs">
          {loading || !report ? (
            <div className="py-12 text-center text-[#888888]">Loading AI Society Analytics...</div>
          ) : (
            <>
              {/* Summary Numbers Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className={`p-3.5 rounded border text-center ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">Total Tickets</span>
                  <div className="text-2xl font-semibold tracking-tight text-[#1A1A1A] dark:text-white mt-1">{report.totalTickets}</div>
                </div>

                <div className={`p-3.5 rounded border text-center ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">Resolved Today</span>
                  <div className="text-2xl font-semibold tracking-tight text-[#10B981] mt-1">{report.resolvedToday}</div>
                </div>

                <div className={`p-3.5 rounded border text-center ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">Avg Response Time</span>
                  <div className="text-2xl font-semibold tracking-tight text-[#6366F1] mt-1">{report.avgResponseTimeMinutes}m</div>
                </div>

                <div className={`p-3.5 rounded border text-center ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">Escalations</span>
                  <div className="text-2xl font-semibold tracking-tight text-[#EF4444] mt-1">{report.escalatedCount}</div>
                </div>
              </div>

              {/* AI Summary Text */}
              <div className={`p-4 rounded border ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-indigo-50/40 border-indigo-200'}`}>
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#6366F1] mb-1 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 mr-1" /> Executive Summary
                </h3>
                <p className="text-[#1A1A1A] dark:text-slate-300 leading-relaxed font-sans text-xs">
                  {report.summaryText}
                </p>
              </div>

              {/* Top Insights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className={`p-4 rounded border ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">Frequent Category</span>
                  <div className="text-sm font-bold text-[#1A1A1A] dark:text-white mt-1">{report.frequentCategory}</div>
                </div>

                <div className={`p-4 rounded border ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-[#FAFAF9] border-[#E5E5E1]'}`}>
                  <span className="text-[10px] font-bold text-[#888888] uppercase tracking-wider">Top Performing Vendor</span>
                  <div className="text-sm font-bold text-[#10B981] mt-1">{report.topPerformingVendor}</div>
                </div>
              </div>

              {/* Recommendations */}
              <div>
                <h3 className="font-bold text-xs uppercase tracking-wider text-[#1A1A1A] dark:text-white mb-2 flex items-center space-x-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#6366F1] mr-1" /> Recommendations for RWA Management Committee
                </h3>
                <ul className="space-y-2">
                  {report.recommendations.map((rec, idx) => (
                    <li key={idx} className={`p-3 rounded border flex items-start space-x-2 ${isDarkMode ? 'bg-[#121211] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1]'}`}>
                      <span className="w-4 h-4 rounded-full bg-[#1A1A1A] text-white font-mono font-bold flex items-center justify-center shrink-0 text-[10px] mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-[#1A1A1A] dark:text-slate-200 font-medium leading-relaxed text-xs">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
