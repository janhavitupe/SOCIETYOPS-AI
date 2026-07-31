import { Ticket, Vendor, NotificationLog, AgentActivityLog, DailyReport, UrgencyLevel, TicketStatus, IssueCategory, SocietyProfile, ResidentProfile } from '../types';

class SocietyDatabase {
  private tickets: Ticket[] = [];
  private vendors: Vendor[] = [];
  private notifications: NotificationLog[] = [];
  private agentLogs: AgentActivityLog[] = [];
  private societyProfile: SocietyProfile;
  private residentProfiles: ResidentProfile[] = [];

  constructor() {
    this.societyProfile = {
      id: 'society-main',
      societyName: 'Shree Ram Enclave RWA, Powai',
      address: 'Powai, Mumbai',
      tagline: 'AI-powered maintenance coordination for residents and managers',
      introText: 'This society uses SocietyOps AI to keep maintenance simple, transparent, and fast. Residents can report issues in natural language, while the maintenance team manages vendors, tickets, and escalations from one place.',
      maintenanceContact: 'Mr. Arvind Sharma',
      maintenancePhone: '+91 98765 11111',
      maintenanceEmail: 'maintenance@srerwa.org',
      highlights: ['Resident complaint intake', 'Auto vendor dispatch', 'Escalations & SLA tracking', 'Admin access tokens'],
      lastUpdatedBy: 'Maintenance Team',
      updatedAt: new Date().toISOString(),
    };
    this.seedInitialData();
  }

  private seedInitialData() {
    this.vendors = [
      {
        id: 'VND-01',
        name: 'Ramesh Kumar Plumber',
        category: 'Plumbing',
        rating: 4.9,
        availability: 'Available',
        phone: '+91 98201 44321',
        avgResolutionTime: '25 mins',
        completedJobs: 142,
        activeJobsCount: 1,
        skills: ['Pipe Leakage', 'Flush Valves', 'Tap Replacement', 'Overhead Tank'],
        societyName: 'Shree Ram Enclave, Powai',
      },
      {
        id: 'VND-02',
        name: 'Satish Electrician',
        category: 'Electrical',
        rating: 4.8,
        availability: 'On Job',
        phone: '+91 98765 12345',
        avgResolutionTime: '35 mins',
        completedJobs: 198,
        activeJobsCount: 2,
        skills: ['MCB Tripping', 'Phase Outage', 'Fan Fitting', 'Short Circuit'],
        societyName: 'Shree Ram Enclave, Powai',
      },
      {
        id: 'VND-03',
        name: 'Otis Elevator Care (Rajesh)',
        category: 'Lift & Elevator',
        rating: 4.9,
        availability: 'Available',
        phone: '+91 98112 88990',
        avgResolutionTime: '20 mins',
        completedJobs: 86,
        activeJobsCount: 1,
        skills: ['Lift Rescue', 'Door Sensor', 'ARD Battery', 'Leveling Issue'],
        societyName: 'Shree Ram Enclave, Powai',
      },
      {
        id: 'VND-04',
        name: 'Sharma Door & Lock Experts',
        category: 'Carpentry & Locks',
        rating: 4.7,
        availability: 'Available',
        phone: '+91 99304 55123',
        avgResolutionTime: '40 mins',
        completedJobs: 110,
        activeJobsCount: 0,
        skills: ['Main Door Lock', 'Balcony Sliding Door', 'Cabinet Hinge'],
        societyName: 'Shree Ram Enclave, Powai',
      },
      {
        id: 'VND-05',
        name: 'CoolBreeze AC & Geyser',
        category: 'AC & Appliances',
        rating: 4.6,
        availability: 'Available',
        phone: '+91 98220 77112',
        avgResolutionTime: '50 mins',
        completedJobs: 94,
        activeJobsCount: 0,
        skills: ['Geyser Heating Coil', 'AC Gas Refill', 'Water Heater Leak'],
        societyName: 'Shree Ram Enclave, Powai',
      },
      {
        id: 'VND-06',
        name: 'GreenPest & Society Hygiene',
        category: 'Cleaning & Pest',
        rating: 4.8,
        availability: 'Available',
        phone: '+91 97690 33441',
        avgResolutionTime: '30 mins',
        completedJobs: 78,
        activeJobsCount: 0,
        skills: ['Termite Treatment', 'Water Tank Cleaning', 'Staircase Fogging'],
        societyName: 'Shree Ram Enclave, Powai',
      },
      {
        id: 'VND-07',
        name: 'SecureComm Intercom Solutions',
        category: 'Security & Intercom',
        rating: 4.7,
        availability: 'Available',
        phone: '+91 98450 66789',
        avgResolutionTime: '30 mins',
        completedJobs: 65,
        activeJobsCount: 0,
        skills: ['Intercom Wiring', 'Boom Barrier', 'CCTV DVR', 'MyGate Sync'],
        societyName: 'Shree Ram Enclave, Powai',
      }
    ];

    const now = new Date();
    const minAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();

    this.tickets = [
      {
        id: 'SOC-1042',
        flatNumber: 'B-402',
        residentName: 'Vikram Mehta',
        residentPhone: '+91 98210 99887',
        issueCategory: 'Plumbing',
        description: 'Bhaiya B-402 ke master bathroom mein flush pipe continuously leak kar raha hai. Paani floor par bhar gaya hai urgent please.',
        urgency: 'High',
        status: 'Vendor Assigned',
        assignedVendorId: 'VND-01',
        assignedVendorName: 'Ramesh Kumar Plumber',
        assignedVendorPhone: '+91 98201 44321',
        estimatedEta: '20 mins',
        createdAt: minAgo(25),
        updatedAt: minAgo(20),
        images: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'],
        societyName: 'Shree Ram Enclave, Powai',
        timeline: [
          {
            id: 'TL-1',
            timestamp: minAgo(25),
            title: 'Complaint Registered',
            description: 'Intake Agent auto-extracted issue, flat B-402, urgency High.',
            actor: 'Intake Agent',
            type: 'created'
          },
          {
            id: 'TL-2',
            timestamp: minAgo(24),
            title: 'Vendor Dispatched',
            description: 'Dispatcher Agent assigned Ramesh Kumar Plumber (4.9 stars) based on category and proximity.',
            actor: 'Dispatcher Agent',
            type: 'assigned'
          },
          {
            id: 'TL-3',
            timestamp: minAgo(20),
            title: 'Resident Notified via WhatsApp',
            description: 'Communication Agent sent update in Hinglish with vendor details and 20 min ETA.',
            actor: 'Communication Agent',
            type: 'notified'
          }
        ]
      },
      {
        id: 'SOC-1041',
        flatNumber: 'A-101',
        residentName: 'Mrs. Ananya Sharma',
        residentPhone: '+91 99870 11223',
        issueCategory: 'Security & Intercom',
        description: 'Main gate intercom is not ringing when visitors arrive.',
        urgency: 'Medium',
        status: 'Resolved',
        assignedVendorId: 'VND-07',
        assignedVendorName: 'SecureComm Intercom Solutions',
        assignedVendorPhone: '+91 98450 66789',
        createdAt: minAgo(120),
        updatedAt: minAgo(15),
        resolvedAt: minAgo(15),
        images: [],
        societyName: 'Shree Ram Enclave, Powai',
        timeline: [
          {
            id: 'TL-10',
            timestamp: minAgo(120),
            title: 'Ticket Created',
            description: 'Intercom fault registered.',
            actor: 'Intake Agent',
            type: 'created'
          },
          {
            id: 'TL-11',
            timestamp: minAgo(110),
            title: 'Vendor Assigned',
            description: 'SecureComm Technician assigned.',
            actor: 'Dispatcher Agent',
            type: 'assigned'
          },
          {
            id: 'TL-12',
            timestamp: minAgo(15),
            title: 'Work Completed & Verified',
            description: 'Wiring repaired at junction box. Resident confirmed resolution.',
            actor: 'Resident',
            type: 'closed'
          }
        ]
      },
      {
        id: 'SOC-1040',
        flatNumber: 'Tower B',
        residentName: 'Security Guard Rakesh',
        residentPhone: '+91 98234 56789',
        issueCategory: 'Lift & Elevator',
        description: 'Tower B Passenger Lift B2 stuck between 3rd and 4th floor! 2 residents inside.',
        urgency: 'High',
        status: 'Escalated',
        assignedVendorId: 'VND-03',
        assignedVendorName: 'Otis Elevator Care (Rajesh)',
        assignedVendorPhone: '+91 98112 88990',
        estimatedEta: '10 mins',
        createdAt: minAgo(15),
        updatedAt: minAgo(5),
        escalationReason: 'Emergency lift entrapment requiring priority technician dispatch & RWA President SMS alert.',
        images: [],
        societyName: 'Shree Ram Enclave, Powai',
        timeline: [
          {
            id: 'TL-20',
            timestamp: minAgo(15),
            title: 'EMERGENCY TICKET RAISED',
            description: 'Lift entrapment detected. High Urgency marked.',
            actor: 'Intake Agent',
            type: 'created'
          },
          {
            id: 'TL-21',
            timestamp: minAgo(14),
            title: 'AUTO-ESCALATION TRIGGERED',
            description: 'Follow-up Agent auto-escalated ticket & alerted RWA President + Otis Rapid Response team.',
            actor: 'Follow-up Agent',
            type: 'escalated'
          }
        ]
      },
      {
        id: 'SOC-1039',
        flatNumber: 'A-305',
        residentName: 'Sanjay Kapoor',
        residentPhone: '+91 97110 54321',
        issueCategory: 'Electrical',
        description: '3rd floor corridor light near A-305 is flickering violently.',
        urgency: 'Low',
        status: 'Open',
        createdAt: minAgo(45),
        updatedAt: minAgo(45),
        images: [],
        societyName: 'Shree Ram Enclave, Powai',
        timeline: [
          {
            id: 'TL-30',
            timestamp: minAgo(45),
            title: 'Ticket Created',
            description: 'Corridor lighting ticket registered.',
            actor: 'Intake Agent',
            type: 'created'
          }
        ]
      }
    ];

    this.notifications = [
      {
        id: 'NTF-1',
        ticketId: 'SOC-1042',
        recipientType: 'resident',
        recipientName: 'Vikram Mehta',
        phone: '+91 98210 99887',
        message: 'Namaste Vikram ji! Ticket #SOC-1042 created. Ramesh Plumber (4.9 stars) has been assigned and will arrive in approx 20 mins. Track status live in app.',
        channel: 'WhatsApp',
        timestamp: minAgo(20),
        language: 'Hinglish',
        status: 'Delivered'
      },
      {
        id: 'NTF-2',
        ticketId: 'SOC-1042',
        recipientType: 'vendor',
        recipientName: 'Ramesh Kumar Plumber',
        phone: '+91 98201 44321',
        message: 'NEW JOB ASSIGNED: Ticket #SOC-1042 at Flat B-402, Shree Ram Enclave. Master bathroom flush leak. Contact resident at +91 98210 99887.',
        channel: 'WhatsApp',
        timestamp: minAgo(22),
        language: 'English',
        status: 'Read'
      },
      {
        id: 'NTF-3',
        ticketId: 'SOC-1040',
        recipientType: 'facility_manager',
        recipientName: 'RWA President Mr. Verma',
        phone: '+91 98000 11111',
        message: 'URGENT ESCALATION: Ticket #SOC-1040 - Tower B Lift B2 stuck with passengers. Otis Technician dispatched.',
        channel: 'Push Notification',
        timestamp: minAgo(14),
        language: 'English',
        status: 'Delivered'
      }
    ];

    this.residentProfiles = [
      {
        id: 'RES-001',
        name: 'Vikram Mehta',
        flatNumber: 'B-402',
        role: 'resident',
        phone: '+91 98210 99887',
        email: 'vikram@example.com',
        status: 'active',
        accessToken: 'TOK-RES-1001',
        tokensGenerated: 3,
        lastActiveAt: minAgo(10),
        createdAt: minAgo(180),
      },
      {
        id: 'RES-002',
        name: 'Mrs. Ananya Sharma',
        flatNumber: 'A-101',
        role: 'resident',
        phone: '+91 99870 11223',
        email: 'ananya@example.com',
        status: 'active',
        accessToken: 'TOK-RES-1002',
        tokensGenerated: 2,
        lastActiveAt: minAgo(45),
        createdAt: minAgo(200),
      },
      {
        id: 'RES-003',
        name: 'Mr. Arvind Sharma',
        flatNumber: 'Maintenance Office',
        role: 'maintenance',
        phone: '+91 98765 11111',
        email: 'maintenance@srerwa.org',
        status: 'active',
        accessToken: 'TOK-MNT-1001',
        tokensGenerated: 8,
        lastActiveAt: minAgo(5),
        createdAt: minAgo(300),
      },
      {
        id: 'RES-004',
        name: 'Admin Desk',
        flatNumber: 'Admin',
        role: 'admin',
        phone: '+91 98000 00000',
        email: 'admin@srerwa.org',
        status: 'active',
        accessToken: 'TOK-ADM-1001',
        tokensGenerated: 12,
        lastActiveAt: minAgo(2),
        createdAt: minAgo(400),
      }
    ];

    this.agentLogs = [
      {
        id: 'LOG-1',
        agentName: 'Intake Agent',
        action: 'Extracted Complaint Metadata',
        details: 'Parsed Hinglish text from Vikram Mehta (B-402). Extracted Urgency: High, Category: Plumbing.',
        timestamp: minAgo(25),
        ticketId: 'SOC-1042'
      },
      {
        id: 'LOG-2',
        agentName: 'Dispatcher Agent',
        action: 'Matched Best Vendor',
        details: 'Evaluated 3 plumbers. Selected Ramesh Kumar (Rating: 4.9, Active Jobs: 1, ETA: 20 mins).',
        timestamp: minAgo(24),
        ticketId: 'SOC-1042'
      },
      {
        id: 'LOG-3',
        agentName: 'Follow-up Agent',
        action: 'Auto-Escalation Execution',
        details: 'Detected Lift entrapment keyword. Bumped status to Escalated and notified RWA safety committee.',
        timestamp: minAgo(14),
        ticketId: 'SOC-1040'
      }
    ];
  }

  // --- TICKET METHODS ---
  public getTickets(): Ticket[] {
    return [...this.tickets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getTicketById(id: string): Ticket | undefined {
    return this.tickets.find(t => t.id === id);
  }

  public createTicket(data: {
    flatNumber: string;
    residentName: string;
    residentPhone?: string;
    issueCategory: IssueCategory;
    description: string;
    urgency: UrgencyLevel;
    images?: string[];
  }): Ticket {
    const nextNum = 1043 + this.tickets.length - 4;
    const ticketId = `SOC-${nextNum}`;
    const now = new Date().toISOString();

    const newTicket: Ticket = {
      id: ticketId,
      flatNumber: data.flatNumber || 'Unknown Flat',
      residentName: data.residentName || 'Resident',
      residentPhone: data.residentPhone || '+91 98000 00000',
      issueCategory: data.issueCategory,
      description: data.description,
      urgency: data.urgency,
      status: 'Open',
      createdAt: now,
      updatedAt: now,
      images: data.images || [],
      societyName: 'Shree Ram Enclave, Powai',
      timeline: [
        {
          id: `TL-${Date.now()}`,
          timestamp: now,
          title: 'Ticket Created',
          description: `Intake Agent registered complaint: "${data.description.substring(0, 80)}..."`,
          actor: 'Intake Agent',
          type: 'created'
        }
      ]
    };

    this.tickets.unshift(newTicket);
    this.logAgentActivity('Intake Agent', 'Created Ticket', `Generated ${ticketId} for ${newTicket.flatNumber}`, ticketId);
    return newTicket;
  }

  public updateTicket(id: string, updates: Partial<Ticket>): Ticket | undefined {
    const index = this.tickets.findIndex(t => t.id === id);
    if (index === -1) return undefined;

    const oldTicket = this.tickets[index];
    const now = new Date().toISOString();

    const updatedTicket = {
      ...oldTicket,
      ...updates,
      updatedAt: now
    };

    if (updates.status === 'Resolved' || updates.status === 'Closed') {
      updatedTicket.resolvedAt = now;
    }

    this.tickets[index] = updatedTicket;
    return updatedTicket;
  }

  public assignVendor(ticketId: string, vendorId: string, estimatedEta: string = '30 mins'): Ticket | undefined {
    const ticket = this.getTicketById(ticketId);
    const vendor = this.getVendorById(vendorId);

    if (!ticket || !vendor) return undefined;

    const now = new Date().toISOString();
    ticket.assignedVendorId = vendor.id;
    ticket.assignedVendorName = vendor.name;
    ticket.assignedVendorPhone = vendor.phone;
    ticket.estimatedEta = estimatedEta;
    ticket.status = 'Vendor Assigned';
    ticket.updatedAt = now;

    ticket.timeline.push({
      id: `TL-${Date.now()}`,
      timestamp: now,
      title: 'Vendor Assigned',
      description: `Dispatcher Agent assigned ${vendor.name} (${vendor.rating} stars). ETA: ${estimatedEta}`,
      actor: 'Dispatcher Agent',
      type: 'assigned'
    });

    vendor.activeJobsCount += 1;

    this.logAgentActivity('Dispatcher Agent', 'Assigned Vendor', `Assigned ${vendor.name} to ticket ${ticketId}`, ticketId);
    this.notifyResident(ticketId, `Namaste! ${vendor.name} (+91 ${vendor.phone}) has been assigned to your ticket #${ticketId}. Estimated arrival: ${estimatedEta}.`);
    this.notifyVendor(ticketId, vendor.id, `New maintenance dispatch #${ticketId} at ${ticket.flatNumber}. Issue: ${ticket.description}.`);

    return ticket;
  }

  public escalateTicket(ticketId: string, reason: string): Ticket | undefined {
    const ticket = this.getTicketById(ticketId);
    if (!ticket) return undefined;

    const now = new Date().toISOString();
    ticket.status = 'Escalated';
    ticket.urgency = 'High';
    ticket.escalationReason = reason;
    ticket.updatedAt = now;

    ticket.timeline.push({
      id: `TL-${Date.now()}`,
      timestamp: now,
      title: 'Ticket Escalated',
      description: `Follow-up Agent escalated ticket. Reason: ${reason}`,
      actor: 'Follow-up Agent',
      type: 'escalated'
    });

    this.logAgentActivity('Follow-up Agent', 'Escalated Ticket', `Escalated ${ticketId}: ${reason}`, ticketId);
    
    // Notify facility manager
    this.addNotification({
      ticketId,
      recipientType: 'facility_manager',
      recipientName: 'RWA Management',
      phone: '+91 98000 11111',
      message: `ESCALATION ALERT: Ticket #${ticketId} (${ticket.flatNumber}) escalated: ${reason}`,
      channel: 'Push Notification',
      language: 'English'
    });

    return ticket;
  }

  public searchTickets(query: string, category?: string, urgency?: string, status?: string): Ticket[] {
    return this.tickets.filter(t => {
      const q = query.toLowerCase();
      const matchesQuery = !query || 
        t.id.toLowerCase().includes(q) || 
        t.flatNumber.toLowerCase().includes(q) || 
        t.residentName.toLowerCase().includes(q) || 
        t.description.toLowerCase().includes(q) ||
        (t.assignedVendorName && t.assignedVendorName.toLowerCase().includes(q));

      const matchesCat = !category || category === 'All' || t.issueCategory === category;
      const matchesUrg = !urgency || urgency === 'All' || t.urgency === urgency;
      const matchesStat = !status || status === 'All' || t.status === status;

      return matchesQuery && matchesCat && matchesUrg && matchesStat;
    });
  }

  // --- VENDOR METHODS ---
  public getVendors(): Vendor[] {
    return [...this.vendors];
  }

  public getVendorById(id: string): Vendor | undefined {
    return this.vendors.find(v => v.id === id);
  }

  public findBestVendorForCategory(category: IssueCategory): Vendor | undefined {
    const matching = this.vendors.filter(v => v.category === category);
    if (matching.length === 0) return undefined;

    // Prefer Available over On Job, then highest rating
    return matching.sort((a, b) => {
      if (a.availability === 'Available' && b.availability !== 'Available') return -1;
      if (a.availability !== 'Available' && b.availability === 'Available') return 1;
      return b.rating - a.rating;
    })[0];
  }

  // --- NOTIFICATION METHODS ---
  public addNotification(data: {
    ticketId: string;
    recipientType: 'resident' | 'vendor' | 'facility_manager';
    recipientName: string;
    phone: string;
    message: string;
    channel?: 'WhatsApp' | 'SMS' | 'Push Notification';
    language?: 'English' | 'Hindi' | 'Hinglish';
  }): NotificationLog {
    const notif: NotificationLog = {
      id: `NTF-${Date.now()}`,
      ticketId: data.ticketId,
      recipientType: data.recipientType,
      recipientName: data.recipientName,
      phone: data.phone,
      message: data.message,
      channel: data.channel || 'WhatsApp',
      language: data.language || 'Hinglish',
      timestamp: new Date().toISOString(),
      status: 'Sent'
    };
    this.notifications.unshift(notif);
    return notif;
  }

  public notifyResident(ticketId: string, message: string): NotificationLog | undefined {
    const ticket = this.getTicketById(ticketId);
    if (!ticket) return undefined;

    return this.addNotification({
      ticketId,
      recipientType: 'resident',
      recipientName: ticket.residentName,
      phone: ticket.residentPhone,
      message,
      channel: 'WhatsApp',
      language: 'Hinglish'
    });
  }

  public notifyVendor(ticketId: string, vendorId: string, message: string): NotificationLog | undefined {
    const vendor = this.getVendorById(vendorId);
    if (!vendor) return undefined;

    return this.addNotification({
      ticketId,
      recipientType: 'vendor',
      recipientName: vendor.name,
      phone: vendor.phone,
      message,
      channel: 'WhatsApp',
      language: 'English'
    });
  }

  public getNotifications(): NotificationLog[] {
    return [...this.notifications];
  }

  // --- AGENT LOGS & ANALYTICS ---
  public logAgentActivity(agentName: AgentActivityLog['agentName'], action: string, details: string, ticketId?: string) {
    this.agentLogs.unshift({
      id: `LOG-${Date.now()}`,
      agentName,
      action,
      details,
      timestamp: new Date().toISOString(),
      ticketId
    });
  }

  public getAgentLogs(): AgentActivityLog[] {
    return [...this.agentLogs];
  }

  public generateAnalyticsReport(): DailyReport {
    const openTickets = this.tickets.filter(t => t.status === 'Open' || t.status === 'Vendor Assigned' || t.status === 'In Progress').length;
    const inProgressTickets = this.tickets.filter(t => t.status === 'Vendor Assigned' || t.status === 'In Progress').length;
    const resolvedToday = this.tickets.filter(t => t.status === 'Resolved' || t.status === 'Closed').length;
    const escalatedCount = this.tickets.filter(t => t.status === 'Escalated').length;
    const slaAtRiskCount = this.tickets.filter(t => t.urgency === 'High' && (t.status === 'Open' || t.status === 'Vendor Assigned')).length;

    // Frequent category count
    const catMap: Record<string, number> = {};
    this.tickets.forEach(t => {
      catMap[t.issueCategory] = (catMap[t.issueCategory] || 0) + 1;
    });
    let topCat = 'Plumbing';
    let maxCount = 0;
    Object.entries(catMap).forEach(([cat, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        topCat = cat;
      }
    });

    return {
      date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      totalTickets: this.tickets.length,
      openTickets,
      inProgressTickets,
      resolvedToday,
      escalatedCount,
      avgResponseTimeMinutes: 18,
      frequentCategory: topCat,
      topPerformingVendor: 'Ramesh Kumar Plumber (4.9 stars)',
      summaryText: `SocietyOps AI managed ${this.tickets.length} total tickets with an average first-response speed of 18 minutes. ${resolvedToday} tickets successfully closed today. ${topCat} remains the most requested category.`,
      recommendations: [
        'Schedule preventive maintenance check for Tower B Elevator ARD battery',
        'Stock extra master bathroom flush valves in RWA inventory',
        'Add 1 backup Electrician vendor for weekend evening slots'
      ],
      slaAtRiskCount,
    };
  }

  public getSocietyProfile(): SocietyProfile {
    return this.societyProfile;
  }

  public updateSocietyProfile(updates: Partial<SocietyProfile>): SocietyProfile {
    this.societyProfile = { ...this.societyProfile, ...updates, updatedAt: new Date().toISOString() };
    return this.societyProfile;
  }

  public getResidentProfiles(): ResidentProfile[] {
    return [...this.residentProfiles];
  }

  public issueAccessToken(profileId: string): ResidentProfile | undefined {
    const profile = this.residentProfiles.find(p => p.id === profileId);
    if (!profile) return undefined;

    profile.tokensGenerated += 1;
    profile.lastActiveAt = new Date().toISOString();
    profile.accessToken = `TOK-${profile.role.toUpperCase()}-${Date.now().toString().slice(-4)}`;
    return profile;
  }

  // --- AUTOMATED FOLLOWUP AGENT ENGINE ---
  public runFollowupAgentCheck(): { checkedCount: number; escalatedTickets: Ticket[]; remindersSent: number } {
    let remindersSent = 0;
    const escalatedTickets: Ticket[] = [];

    this.tickets.forEach(ticket => {
      if (ticket.status === 'Open') {
        // Auto assign best vendor if open
        const vendor = this.findBestVendorForCategory(ticket.issueCategory);
        if (vendor) {
          this.assignVendor(ticket.id, vendor.id, '25 mins');
          remindersSent++;
        }
      } else if (ticket.status === 'Vendor Assigned') {
        // Simulate check: if ticket description contains urgent keywords like stuck lift or severe leak, auto escalate
        const isEmergency = ticket.description.toLowerCase().includes('stuck') || 
                            ticket.description.toLowerCase().includes('gas') || 
                            ticket.description.toLowerCase().includes('sewage');
        
        if (isEmergency && ticket.urgency === 'High') {
          const updated = this.escalateTicket(ticket.id, 'Urgent life-safety keyword auto-detected during Follow-up Agent cycle');
          if (updated) escalatedTickets.push(updated);
        } else {
          // Send polite ping to vendor
          if (ticket.assignedVendorId) {
            this.addNotification({
              ticketId: ticket.id,
              recipientType: 'vendor',
              recipientName: ticket.assignedVendorName || 'Vendor',
              phone: ticket.assignedVendorPhone || '',
              message: `REMINDER: Please confirm arrival at ${ticket.flatNumber} for ticket #${ticket.id}. Resident is waiting.`,
              channel: 'WhatsApp',
              language: 'English'
            });
            remindersSent++;
          }
        }
      }
    });

    this.logAgentActivity(
      'Follow-up Agent',
      'Autonomous Cycle Completed',
      `Checked ${this.tickets.length} tickets. Sent ${remindersSent} vendor pings, auto-escalated ${escalatedTickets.length} emergency tickets.`
    );

    return {
      checkedCount: this.tickets.length,
      escalatedTickets,
      remindersSent
    };
  }
}

export const dbStore = new SocietyDatabase();
