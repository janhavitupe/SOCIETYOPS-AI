export type UrgencyLevel = 'High' | 'Medium' | 'Low';

export type TicketStatus = 'Open' | 'Vendor Assigned' | 'In Progress' | 'Escalated' | 'Resolved' | 'Closed';

export type IssueCategory =
  | 'Plumbing'
  | 'Electrical'
  | 'Lift & Elevator'
  | 'Carpentry & Locks'
  | 'AC & Appliances'
  | 'Cleaning & Pest'
  | 'Security & Intercom'
  | 'General Repairs';

export interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  description: string;
  actor:
    | 'Intake Agent'
    | 'Dispatcher Agent'
    | 'Follow-up Agent'
    | 'Communication Agent'
    | 'Resident'
    | 'Facility Manager'
    | 'Vendor';
  type: 'created' | 'assigned' | 'status_change' | 'escalated' | 'notified' | 'note' | 'closed';
}

export interface Ticket {
  id: string; // e.g. SOC-1042
  flatNumber: string; // e.g. A-402, or "Lift B2, Tower B Lobby"
  /** Where it is: a flat, or a common area and optionally an asset in it. */
  flatId?: string | null;
  commonAreaId?: string | null;
  assetId?: string | null;
  /** Others who reported the same common-area problem while it was open. */
  alsoReportedBy?: string[];
  residentName: string;
  residentPhone: string;
  issueCategory: IssueCategory;
  description: string;
  urgency: UrgencyLevel;
  status: TicketStatus;
  assignedVendorId?: string;
  assignedVendorName?: string;
  assignedVendorPhone?: string;
  estimatedEta?: string; // e.g. "30 mins"
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  images: string[];
  timeline: TimelineEvent[];
  societyName: string;
  lastFollowupAt?: string;
  escalationReason?: string;
  /** Where the job stands in the assigned vendor's queue (single-ticket reads). */
  vendorQueue?: { position: number; total: number } | null;
}

/** On duty ('Available') or not; set by the manager. */
export type VendorAvailability = 'Available' | 'Offline';

/** What the vendor is doing now, from their open tickets. */
export type VendorStatus = 'Available' | 'Busy' | 'Offline';

export interface Vendor {
  id: string;
  name: string;
  category: IssueCategory;
  rating: number; // e.g. 4.8
  availability: VendorAvailability;
  phone: string;
  avgResolutionTime: string; // e.g. "45 mins"
  completedJobs: number;
  activeJobsCount: number;
  /** Live: Busy while they have open jobs. */
  status: VendorStatus;
  /** Open jobs right now, counted from tickets. */
  openJobs: number;
  skills: string[];
  societyName: string;
  avatarUrl?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  role: 'resident' | 'facility_manager';
  flatNumber: string;
  phone: string;
  societyName: string;
}

export interface NotificationLog {
  id: string;
  ticketId: string;
  recipientType: 'resident' | 'vendor' | 'facility_manager';
  recipientName: string;
  phone: string;
  message: string;
  channel: 'WhatsApp' | 'SMS' | 'Push Notification';
  timestamp: string;
  language: 'English' | 'Hindi' | 'Hinglish';
  status: 'Sent' | 'Delivered' | 'Read';
}

export interface AgentActivityLog {
  id: string;
  agentName: 'Intake Agent' | 'Dispatcher Agent' | 'Follow-up Agent' | 'Communication Agent' | 'Analytics Agent';
  action: string;
  details: string;
  timestamp: string;
  ticketId?: string;
}

export interface DailyReport {
  date: string;
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedToday: number;
  escalatedCount: number;
  avgResponseTimeMinutes: number;
  frequentCategory: string;
  topPerformingVendor: string;
  summaryText: string;
  recommendations: string[];
  slaAtRiskCount?: number;
}

export interface SocietyProfile {
  id: string;
  societyName: string;
  address: string;
  tagline: string;
  introText: string;
  maintenanceContact: string;
  maintenancePhone: string;
  maintenanceEmail: string;
  highlights: string[];
  lastUpdatedBy: string;
  updatedAt: string;
}

/** A member of the society, as GET /api/resident-profiles lists them. */
export interface ResidentProfile {
  id: string;
  name: string;
  phone: string | null;
  roles: string[];
  role: 'society_admin' | 'manager' | 'committee' | 'resident';
  flats: string[];
  flatNumber: string;
  status: 'invited' | 'pending' | 'active';
  createdAt: string;
}

export interface AgentThoughtStep {
  agentName: 'Intake Agent' | 'Dispatcher Agent' | 'Follow-up Agent' | 'Communication Agent' | 'Analytics Agent';
  toolCalled?: string;
  args?: Record<string, any>;
  resultSummary?: string;
  explanation: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  timestamp: string;
  images?: string[];
  ticketId?: string;
  thoughtSteps?: AgentThoughtStep[];
  ticketCreated?: Ticket;
  suggestedAction?: string;
}
