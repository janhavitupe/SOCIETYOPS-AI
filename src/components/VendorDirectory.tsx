import React, { useState } from 'react';
import { Vendor, IssueCategory } from '../types';
import { Star, Phone, Clock, CheckCircle, Wrench, Search, ShieldCheck } from 'lucide-react';

interface VendorDirectoryProps {
  vendors: Vendor[];
  isDarkMode: boolean;
  onAssignVendorToOpenTicket: (vendorId: string) => void;
}

export const VendorDirectory: React.FC<VendorDirectoryProps> = ({ vendors, isDarkMode, onAssignVendorToOpenTicket }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['All', 'Plumbing', 'Electrical', 'Lift & Elevator', 'Carpentry & Locks', 'AC & Appliances', 'Cleaning & Pest', 'Security & Intercom'];

  const filteredVendors = vendors.filter(v => {
    const matchesCategory = selectedCategory === 'All' || v.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery || v.name.toLowerCase().includes(q) || v.skills.some(s => s.toLowerCase().includes(q));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-[#E5E5E1] dark:border-[#2D2D2A]">
        <div>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-light uppercase tracking-tighter leading-none text-[#1A1A1A] dark:text-white">
            Vendor<br />
            <span className="text-[#6366F1] font-normal">Directory & SLA</span>
          </h1>
          <p className="text-xs text-[#71716A] dark:text-slate-400 mt-2 font-medium uppercase tracking-wider">
            RWA Empaneled Maintenance Vendors & Live Capacity
          </p>
        </div>

        {/* Category Pills */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider whitespace-nowrap border transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#1A1A1A] text-white border-[#1A1A1A] dark:bg-white dark:text-[#1A1A1A]'
                  : isDarkMode
                  ? 'bg-[#181817] border-[#2D2D2A] text-slate-300 hover:border-[#6366F1]'
                  : 'bg-white border-[#E5E5E1] text-[#1A1A1A] hover:border-[#6366F1] shadow-2xs'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Vendors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredVendors.map((vendor) => (
          <div
            key={vendor.id}
            className={`p-5 rounded-lg border transition-all ${
              isDarkMode ? 'bg-[#181817] border-[#2D2D2A]' : 'bg-white border-[#E5E5E1] shadow-2xs'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="font-bold text-base text-[#1A1A1A] dark:text-white">{vendor.name}</h3>
                  <ShieldCheck className="w-4 h-4 text-[#6366F1]" aria-label="RWA Verified" />
                </div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#6366F1]">{vendor.category}</p>
              </div>

              {/* Rating */}
              <div className="flex items-center space-x-1 bg-amber-50 dark:bg-amber-950/60 px-2.5 py-1 rounded border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{vendor.rating}</span>
              </div>
            </div>

            {/* Vendor Details */}
            <div className="space-y-2 text-xs text-[#71716A] dark:text-slate-400 mb-4">
              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1 font-medium">
                  <Phone className="w-3.5 h-3.5 text-[#888888]" />
                  <span>Phone:</span>
                </span>
                <span className="font-bold text-[#1A1A1A] dark:text-slate-200">{vendor.phone}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1 font-medium">
                  <Clock className="w-3.5 h-3.5 text-[#888888]" />
                  <span>Avg Resolution:</span>
                </span>
                <span className="font-bold text-[#1A1A1A] dark:text-slate-200">{vendor.avgResolutionTime}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="flex items-center space-x-1 font-medium">
                  <CheckCircle className="w-3.5 h-3.5 text-[#888888]" />
                  <span>Completed Jobs:</span>
                </span>
                <span className="font-bold text-[#10B981]">{vendor.completedJobs} jobs</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="font-medium">Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    vendor.availability === 'Available'
                      ? 'bg-[#ECFDF5] text-[#059669]'
                      : vendor.availability === 'On Job'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {vendor.availability} ({vendor.activeJobsCount} active)
                </span>
              </div>
            </div>

            {/* Skills Pills */}
            <div className="flex flex-wrap gap-1 mb-4">
              {vendor.skills.map((skill, idx) => (
                <span
                  key={idx}
                  className="text-[10px] px-2 py-0.5 rounded bg-[#F0F0EE] dark:bg-[#222220] text-[#1A1A1A] dark:text-slate-300 font-bold uppercase tracking-wider"
                >
                  {skill}
                </span>
              ))}
            </div>

            {/* Quick Dispatch */}
            <button
              onClick={() => onAssignVendorToOpenTicket(vendor.id)}
              className="w-full py-2 rounded bg-[#6366F1] hover:bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-2xs cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Dispatch for Open Ticket</span>
            </button>

          </div>
        ))}
      </div>

    </div>
  );
};
