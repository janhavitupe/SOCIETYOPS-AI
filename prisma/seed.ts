import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth/authUtils';

const prisma = new PrismaClient();

async function main() {
  const minAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

  await prisma.societyProfile.create({
    data: {
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
    },
  });

  await prisma.vendor.createMany({
    data: [
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
      },
    ],
  });

  const residents = [
    { id: 'RES-001', name: 'Vikram Mehta', flatNumber: 'B-402', role: 'resident', phone: '+91 98210 99887', email: 'vikram@example.com', password: 'vikram123' },
    { id: 'RES-002', name: 'Mrs. Ananya Sharma', flatNumber: 'A-101', role: 'resident', phone: '+91 99870 11223', email: 'ananya@example.com', password: 'ananya123' },
    { id: 'RES-003', name: 'Mr. Arvind Sharma', flatNumber: 'Maintenance Office', role: 'maintenance', phone: '+91 98765 11111', email: 'maintenance@srerwa.org', password: 'arvind123' },
    { id: 'RES-004', name: 'Admin Desk', flatNumber: 'Admin', role: 'admin', phone: '+91 98000 00000', email: 'admin@srerwa.org', password: 'admin123' },
  ];

  for (const r of residents) {
    const hashed = await hashPassword(r.password);
    await prisma.residentProfile.create({
      data: {
        id: r.id,
        name: r.name,
        flatNumber: r.flatNumber,
        role: r.role,
        phone: r.phone,
        email: r.email || '',
        status: 'active',
        accessToken: `TOK-${r.role.toUpperCase()}-100${r.id.split('-')[1]}`,
        tokensGenerated: parseInt(r.id.split('-')[1]),
        lastActiveAt: minAgo(parseInt(r.id.split('-')[1])),
        createdAt: minAgo(parseInt(r.id.split('-')[1]) * 50),
        passwordHashes: { create: { hash: hashed } },
      },
    });
  }

  const tickets = [
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
      images: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'],
      societyName: 'Shree Ram Enclave, Powai',
      timeline: [
        { id: 'TL-1', timestamp: minAgo(25), title: 'Complaint Registered', description: 'Intake Agent auto-extracted issue, flat B-402, urgency High.', actor: 'Intake Agent', type: 'created' },
        { id: 'TL-2', timestamp: minAgo(24), title: 'Vendor Dispatched', description: 'Dispatcher Agent assigned Ramesh Kumar Plumber (4.9 stars) based on category and proximity.', actor: 'Dispatcher Agent', type: 'assigned' },
        { id: 'TL-3', timestamp: minAgo(20), title: 'Resident Notified via WhatsApp', description: 'Communication Agent sent update in Hinglish with vendor details and 20 min ETA.', actor: 'Communication Agent', type: 'notified' },
      ],
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
      resolvedAt: minAgo(15),
      images: [],
      societyName: 'Shree Ram Enclave, Powai',
      timeline: [
        { id: 'TL-10', timestamp: minAgo(120), title: 'Ticket Created', description: 'Intercom fault registered.', actor: 'Intake Agent', type: 'created' },
        { id: 'TL-11', timestamp: minAgo(110), title: 'Vendor Assigned', description: 'SecureComm Technician assigned.', actor: 'Dispatcher Agent', type: 'assigned' },
        { id: 'TL-12', timestamp: minAgo(15), title: 'Work Completed & Verified', description: 'Wiring repaired at junction box. Resident confirmed resolution.', actor: 'Resident', type: 'closed' },
      ],
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
      escalationReason: 'Emergency lift entrapment requiring priority technician dispatch & RWA President SMS alert.',
      images: [],
      societyName: 'Shree Ram Enclave, Powai',
      timeline: [
        { id: 'TL-20', timestamp: minAgo(15), title: 'EMERGENCY TICKET RAISED', description: 'Lift entrapment detected. High Urgency marked.', actor: 'Intake Agent', type: 'created' },
        { id: 'TL-21', timestamp: minAgo(14), title: 'AUTO-ESCALATION TRIGGERED', description: 'Follow-up Agent auto-escalated ticket & alerted RWA President + Otis Rapid Response team.', actor: 'Follow-up Agent', type: 'escalated' },
      ],
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
      images: [],
      societyName: 'Shree Ram Enclave, Powai',
      timeline: [
        { id: 'TL-30', timestamp: minAgo(45), title: 'Ticket Created', description: 'Corridor lighting ticket registered.', actor: 'Intake Agent', type: 'created' },
      ],
    },
  ];

  for (const t of tickets) {
    await prisma.ticket.create({
      data: {
        ...t,
        createdAt: t.timeline[0].timestamp,
        updatedAt: t.timeline[t.timeline.length - 1].timestamp,
        timeline: {
          create: t.timeline.map((e) => ({
            ...e,
            ticketId: t.id,
          })),
        },
      },
    });
  }

  const notifications = [
    { ticketId: 'SOC-1042', recipientType: 'resident', recipientName: 'Vikram Mehta', phone: '+91 98210 99887', message: 'Namaste Vikram ji! Ticket #SOC-1042 created. Ramesh Plumber (4.9 stars) has been assigned and will arrive in approx 20 mins.', channel: 'WhatsApp', language: 'Hinglish', status: 'Delivered', timestamp: minAgo(20) },
    { ticketId: 'SOC-1042', recipientType: 'vendor', recipientName: 'Ramesh Kumar Plumber', phone: '+91 98201 44321', message: 'NEW JOB ASSIGNED: Ticket #SOC-1042 at Flat B-402.', channel: 'WhatsApp', language: 'English', status: 'Read', timestamp: minAgo(22) },
    { ticketId: 'SOC-1040', recipientType: 'facility_manager', recipientName: 'RWA President Mr. Verma', phone: '+91 98000 11111', message: 'URGENT ESCALATION: Ticket #SOC-1040 - Tower B Lift B2 stuck.', channel: 'Push Notification', language: 'English', status: 'Delivered', timestamp: minAgo(14) },
  ];

  for (const n of notifications) {
    await prisma.notificationLog.create({ data: { id: `NTF-${Date.now()}-${n.ticketId}`, ...n } });
  }

  const logs = [
    { id: 'LOG-1', agentName: 'Intake Agent', action: 'Extracted Complaint Metadata', details: 'Parsed Hinglish text from Vikram Mehta (B-402). Extracted Urgency: High, Category: Plumbing.', timestamp: minAgo(25), ticketId: 'SOC-1042' },
    { id: 'LOG-2', agentName: 'Dispatcher Agent', action: 'Matched Best Vendor', details: 'Evaluated 3 plumbers. Selected Ramesh Kumar (Rating: 4.9, Active Jobs: 1, ETA: 20 mins).', timestamp: minAgo(24), ticketId: 'SOC-1042' },
    { id: 'LOG-3', agentName: 'Follow-up Agent', action: 'Auto-Escalation Execution', details: 'Detected Lift entrapment keyword. Bumped status to Escalated and notified RWA safety committee.', timestamp: minAgo(14), ticketId: 'SOC-1040' },
  ];

  for (const l of logs) {
    await prisma.agentActivityLog.create({ data: l });
  }

  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
