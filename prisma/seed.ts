import 'dotenv/config';
import bcrypt from 'bcryptjs';
// Reuses the configured clients. Prisma 7 requires a driver adapter, so a bare
// `new PrismaClient()` here fails at construction.
import { DATABASE_SCHEMA, prisma, unscopedPrisma } from '../src/database/prisma';
import { requireSocietyId, withSociety } from '../src/requestContext';
import { canonicalPhone } from '../src/services/phone';
import { linkVendorAccount } from '../src/services/vendorAccounts';
import { seedPlaces } from './seedPlaces';

/**
 * Demo data: two societies, so tenant isolation can be seen and tested.
 *
 * Refuses to run over existing data unless SEED_RESET=true, which empties
 * every application table first. Never run that against production.
 */

const minAgo = (m: number) => new Date(Date.now() - m * 60000);

const APP_TABLES = [
  'TimelineEvent',
  'NotificationLog',
  'AgentActivityLog',
  'ChatMessage',
  'Ticket',
  'Asset',
  'CommonArea',
  'Invite',
  'FlatOccupant',
  'Flat',
  'Tower',
  'Vendor',
  'SocietyProfile',
  'Membership',
  'Session',
  'Account',
  'Verification',
  'User',
  'Society',
];

interface SeedUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  password: string;
}

async function createUser(u: SeedUser) {
  const phone = canonicalPhone(u.phone)!;
  await unscopedPrisma.user.create({
    data: {
      id: u.id,
      name: u.name,
      email: u.email,
      phoneNumber: phone,
      phoneNumberVerified: true,
      accounts: {
        create: {
          id: `acc_${u.id}`,
          accountId: u.id,
          providerId: 'credential',
          password: await bcrypt.hash(u.password, 12),
        },
      },
    },
  });
}

async function addMember(societyId: string, userId: string, role: string) {
  await unscopedPrisma.membership.create({ data: { societyId, userId, role, status: 'active' } });
}

/** Towers named in `towers`, floors 1..floors, perFloor flats each: A-101, A-102, ... */
async function createBuilding(towers: string[], floors: number, perFloor: number) {
  const flats: Record<string, string> = {};
  for (const [i, name] of towers.entries()) {
    const tower = await prisma.tower.create({
      data: { societyId: requireSocietyId(), name, kind: 'tower', floors, liftsCount: 2, sortOrder: i },
    });
    for (let floor = 1; floor <= floors; floor++) {
      for (let n = 1; n <= perFloor; n++) {
        const number = `${name}-${floor}${String(n).padStart(2, '0')}`;
        const flat = await prisma.flat.create({
          data: {
            societyId: requireSocietyId(),
            towerId: tower.id,
            number,
            floor,
            type: n % 2 ? '2BHK' : '3BHK',
            parkingSlots: 1,
          },
        });
        flats[number] = flat.id;
      }
    }
  }
  return flats;
}

async function occupy(flatId: string, userId: string) {
  await prisma.flatOccupant.create({
    data: {
      societyId: requireSocietyId(),
      flatId,
      userId,
      type: 'owner',
      status: 'active',
      moveInDate: minAgo(60 * 24 * 365),
    },
  });
}

async function seedShreeRam() {
  const societyId = 'society-main';
  await unscopedPrisma.society.create({
    data: {
      id: societyId,
      name: 'Shree Ram Enclave RWA, Powai',
      address: 'Hiranandani Gardens, Powai',
      city: 'Mumbai',
      pinCode: '400076',
      status: 'active',
      joinCode: 'SHREERAM',
    },
  });

  const users: (SeedUser & { role: string; flat?: string })[] = [
    {
      id: 'RES-001',
      name: 'Vikram Mehta',
      phone: '+91 98210 99887',
      email: 'vikram@example.com',
      password: 'vikram123',
      role: 'resident',
      flat: 'B-402',
    },
    {
      id: 'RES-002',
      name: 'Mrs. Ananya Sharma',
      phone: '+91 99870 11223',
      email: 'ananya@example.com',
      password: 'ananya123',
      role: 'resident',
      flat: 'A-101',
    },
    {
      id: 'RES-003',
      name: 'Mr. Arvind Sharma',
      phone: '+91 98765 11111',
      email: 'maintenance@srerwa.org',
      password: 'arvind123',
      role: 'manager',
    },
    {
      id: 'RES-004',
      name: 'Admin Desk',
      phone: '+91 98000 00000',
      email: 'admin@srerwa.org',
      password: 'admin123',
      role: 'society_admin',
    },
  ];
  for (const u of users) {
    await createUser(u);
    await addMember(societyId, u.id, u.role);
  }

  await withSociety(societyId, async () => {
    await prisma.societyProfile.create({
      data: {
        id: 'profile-main',
        societyId,
        societyName: 'Shree Ram Enclave RWA, Powai',
        address: 'Powai, Mumbai',
        tagline: 'AI-powered maintenance coordination for residents and managers',
        introText:
          'This society uses SocietyOps AI to keep maintenance simple, transparent, and fast. Residents can report issues in natural language, while the maintenance team manages vendors, tickets, and escalations from one place.',
        maintenanceContact: 'Mr. Arvind Sharma',
        maintenancePhone: '+91 98765 11111',
        maintenanceEmail: 'maintenance@srerwa.org',
        highlights: ['Resident complaint intake', 'Auto vendor dispatch', 'Escalations & SLA tracking'],
        lastUpdatedBy: 'Maintenance Team',
      },
    });

    const flats = await createBuilding(['A', 'B'], 5, 4);
    for (const u of users) if (u.flat) await occupy(flats[u.flat], u.id);

    const societyName = 'Shree Ram Enclave, Powai';
    const vendor = (v: Record<string, unknown>) => ({ societyId, societyName, activeJobsCount: 0, ...v }) as any;
    await prisma.vendor.createMany({
      data: [
        vendor({
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
        }),
        vendor({
          id: 'VND-02',
          name: 'Satish Electrician',
          category: 'Electrical',
          rating: 4.8,
          availability: 'Available',
          phone: '+91 98765 12345',
          avgResolutionTime: '35 mins',
          completedJobs: 198,
          activeJobsCount: 2,
          skills: ['MCB Tripping', 'Phase Outage', 'Fan Fitting', 'Short Circuit'],
        }),
        vendor({
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
        }),
        vendor({
          id: 'VND-04',
          name: 'Sharma Door & Lock Experts',
          category: 'Carpentry & Locks',
          rating: 4.7,
          availability: 'Available',
          phone: '+91 99304 55123',
          avgResolutionTime: '40 mins',
          completedJobs: 110,
          skills: ['Main Door Lock', 'Balcony Sliding Door', 'Cabinet Hinge'],
        }),
        vendor({
          id: 'VND-05',
          name: 'CoolBreeze AC & Geyser',
          category: 'AC & Appliances',
          rating: 4.6,
          availability: 'Available',
          phone: '+91 98220 77112',
          avgResolutionTime: '50 mins',
          completedJobs: 94,
          skills: ['Geyser Heating Coil', 'AC Gas Refill', 'Water Heater Leak'],
        }),
        vendor({
          id: 'VND-06',
          name: 'GreenPest & Society Hygiene',
          category: 'Cleaning & Pest',
          rating: 4.8,
          availability: 'Available',
          phone: '+91 97690 33441',
          avgResolutionTime: '30 mins',
          completedJobs: 78,
          skills: ['Termite Treatment', 'Water Tank Cleaning', 'Staircase Fogging'],
        }),
        vendor({
          id: 'VND-07',
          name: 'SecureComm Intercom Solutions',
          category: 'Security & Intercom',
          rating: 4.7,
          availability: 'Available',
          phone: '+91 98450 66789',
          avgResolutionTime: '30 mins',
          completedJobs: 65,
          skills: ['Intercom Wiring', 'Boom Barrier', 'CCTV DVR', 'MyGate Sync'],
        }),
      ],
    });

    const tickets = [
      {
        id: 'SOC-1042',
        flatNumber: 'B-402',
        flatId: flats['B-402'],
        residentId: 'RES-001',
        residentName: 'Vikram Mehta',
        residentPhone: '+91 98210 99887',
        issueCategory: 'Plumbing',
        description:
          'Bhaiya B-402 ke master bathroom mein flush pipe continuously leak kar raha hai. Paani floor par bhar gaya hai urgent please.',
        urgency: 'High',
        status: 'Vendor Assigned',
        assignedVendorId: 'VND-01',
        vendorId: 'VND-01',
        assignedVendorName: 'Ramesh Kumar Plumber',
        assignedVendorPhone: '+91 98201 44321',
        estimatedEta: '20 mins',
        images: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=600&q=80'],
        timeline: [
          {
            timestamp: minAgo(25),
            title: 'Complaint Registered',
            description: 'Intake Agent auto-extracted issue, flat B-402, urgency High.',
            actor: 'Intake Agent',
            type: 'created',
          },
          {
            timestamp: minAgo(24),
            title: 'Vendor Dispatched',
            description: 'Dispatcher Agent assigned Ramesh Kumar Plumber (4.9 stars) based on category and proximity.',
            actor: 'Dispatcher Agent',
            type: 'assigned',
          },
          {
            timestamp: minAgo(20),
            title: 'Resident Notified via WhatsApp',
            description: 'Communication Agent sent update in Hinglish with vendor details and 20 min ETA.',
            actor: 'Communication Agent',
            type: 'notified',
          },
        ],
      },
      {
        id: 'SOC-1041',
        flatNumber: 'A-101',
        flatId: flats['A-101'],
        residentId: 'RES-002',
        residentName: 'Mrs. Ananya Sharma',
        residentPhone: '+91 99870 11223',
        issueCategory: 'Security & Intercom',
        description: 'Main gate intercom is not ringing when visitors arrive.',
        urgency: 'Medium',
        status: 'Resolved',
        assignedVendorId: 'VND-07',
        vendorId: 'VND-07',
        assignedVendorName: 'SecureComm Intercom Solutions',
        assignedVendorPhone: '+91 98450 66789',
        resolvedAt: minAgo(15),
        images: [],
        timeline: [
          {
            timestamp: minAgo(120),
            title: 'Ticket Created',
            description: 'Intercom fault registered.',
            actor: 'Intake Agent',
            type: 'created',
          },
          {
            timestamp: minAgo(110),
            title: 'Vendor Assigned',
            description: 'SecureComm Technician assigned.',
            actor: 'Dispatcher Agent',
            type: 'assigned',
          },
          {
            timestamp: minAgo(15),
            title: 'Work Completed & Verified',
            description: 'Wiring repaired at junction box. Resident confirmed resolution.',
            actor: 'Resident',
            type: 'closed',
          },
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
        vendorId: 'VND-03',
        assignedVendorName: 'Otis Elevator Care (Rajesh)',
        assignedVendorPhone: '+91 98112 88990',
        estimatedEta: '10 mins',
        escalationReason: 'Emergency lift entrapment requiring priority technician dispatch & RWA President SMS alert.',
        images: [],
        timeline: [
          {
            timestamp: minAgo(15),
            title: 'EMERGENCY TICKET RAISED',
            description: 'Lift entrapment detected. High Urgency marked.',
            actor: 'Intake Agent',
            type: 'created',
          },
          {
            timestamp: minAgo(14),
            title: 'AUTO-ESCALATION TRIGGERED',
            description: 'Follow-up Agent auto-escalated ticket & alerted RWA President + Otis Rapid Response team.',
            actor: 'Follow-up Agent',
            type: 'escalated',
          },
        ],
      },
      {
        id: 'SOC-1039',
        flatNumber: 'A-305',
        flatId: flats['A-305'],
        residentName: 'Sanjay Kapoor',
        residentPhone: '+91 97110 54321',
        issueCategory: 'Electrical',
        description: '3rd floor corridor light near A-305 is flickering violently.',
        urgency: 'Low',
        status: 'Open',
        images: [],
        timeline: [
          {
            timestamp: minAgo(45),
            title: 'Ticket Created',
            description: 'Corridor lighting ticket registered.',
            actor: 'Intake Agent',
            type: 'created',
          },
        ],
      },
    ];

    for (const { timeline, ...t } of tickets) {
      await prisma.ticket.create({
        data: {
          ...t,
          societyId,
          societyName,
          createdAt: timeline[0].timestamp,
          updatedAt: timeline[timeline.length - 1].timestamp,
          // No ticketId here: a nested create takes the foreign key from the parent row.
          timeline: { create: timeline },
        },
      });
    }

    const notifications = [
      {
        ticketId: 'SOC-1042',
        recipientType: 'resident',
        recipientName: 'Vikram Mehta',
        phone: '+91 98210 99887',
        message:
          'Namaste Vikram ji! Ticket #SOC-1042 created. Ramesh Plumber (4.9 stars) has been assigned and will arrive in approx 20 mins.',
        channel: 'WhatsApp',
        language: 'Hinglish',
        status: 'Delivered',
        timestamp: minAgo(20),
      },
      {
        ticketId: 'SOC-1042',
        recipientType: 'vendor',
        recipientName: 'Ramesh Kumar Plumber',
        phone: '+91 98201 44321',
        message: 'NEW JOB ASSIGNED: Ticket #SOC-1042 at Flat B-402.',
        channel: 'WhatsApp',
        language: 'English',
        status: 'Read',
        timestamp: minAgo(22),
      },
      {
        ticketId: 'SOC-1040',
        recipientType: 'facility_manager',
        recipientName: 'RWA President Mr. Verma',
        phone: '+91 98000 11111',
        message: 'URGENT ESCALATION: Ticket #SOC-1040 - Tower B Lift B2 stuck.',
        channel: 'Push Notification',
        language: 'English',
        status: 'Delivered',
        timestamp: minAgo(14),
      },
    ];
    for (const n of notifications) await prisma.notificationLog.create({ data: { ...n, societyId } });

    const logs = [
      {
        agentName: 'Intake Agent',
        action: 'Extracted Complaint Metadata',
        details: 'Parsed Hinglish text from Vikram Mehta (B-402). Extracted Urgency: High, Category: Plumbing.',
        timestamp: minAgo(25),
        ticketId: 'SOC-1042',
      },
      {
        agentName: 'Dispatcher Agent',
        action: 'Matched Best Vendor',
        details: 'Evaluated 3 plumbers. Selected Ramesh Kumar (Rating: 4.9, Active Jobs: 1, ETA: 20 mins).',
        timestamp: minAgo(24),
        ticketId: 'SOC-1042',
      },
      {
        agentName: 'Follow-up Agent',
        action: 'Auto-Escalation Execution',
        details: 'Detected Lift entrapment keyword. Bumped status to Escalated and notified RWA safety committee.',
        timestamp: minAgo(14),
        ticketId: 'SOC-1040',
      },
    ];
    for (const l of logs) await prisma.agentActivityLog.create({ data: { ...l, societyId } });
  });
}

/** A second, smaller society: the other side of every tenant-isolation test. */
async function seedGreenValley() {
  const societyId = 'society-green';
  await unscopedPrisma.society.create({
    data: {
      id: societyId,
      name: 'Green Valley Residency',
      address: 'Baner Road',
      city: 'Pune',
      pinCode: '411045',
      status: 'active',
      joinCode: 'GREENVAL',
    },
  });

  const manager = {
    id: 'GV-001',
    name: 'Priya Nair',
    phone: '+91 99000 11111',
    email: 'priya@greenvalley.example',
    password: 'priya123',
  };
  const resident = {
    id: 'GV-002',
    name: 'Rohan Desai',
    phone: '+91 99000 22222',
    email: 'rohan@example.com',
    password: 'rohan123',
  };
  await createUser(manager);
  await createUser(resident);
  await addMember(societyId, manager.id, 'manager');
  await addMember(societyId, resident.id, 'resident');

  await withSociety(societyId, async () => {
    await prisma.societyProfile.create({
      data: {
        id: 'profile-green',
        societyId,
        societyName: 'Green Valley Residency',
        address: 'Baner, Pune',
        tagline: 'Maintenance, sorted',
        introText: 'Report any problem in your flat or the common areas through the assistant.',
        maintenanceContact: 'Priya Nair',
        maintenancePhone: '+91 99000 11111',
        maintenanceEmail: 'office@greenvalley.example',
        highlights: [],
        lastUpdatedBy: 'Priya Nair',
      },
    });

    const flats = await createBuilding(['G'], 3, 2);
    await occupy(flats['G-201'], resident.id);

    await prisma.vendor.create({
      data: {
        id: 'VND-G1',
        societyId,
        name: 'GV Plumbing Co',
        category: 'Plumbing',
        rating: 4.5,
        availability: 'Available',
        phone: '+91 99000 33333',
        avgResolutionTime: '45 mins',
        completedJobs: 12,
        skills: ['Pipe Leakage'],
        societyName: 'Green Valley Residency',
      },
    });

    await prisma.ticket.create({
      data: {
        id: 'SOC-2001',
        societyId,
        flatId: flats['G-201'],
        flatNumber: 'G-201',
        residentId: resident.id,
        residentName: resident.name,
        residentPhone: canonicalPhone(resident.phone)!,
        issueCategory: 'Plumbing',
        description: 'Kitchen sink drain is blocked.',
        urgency: 'Medium',
        status: 'Open',
        images: [],
        societyName: 'Green Valley Residency',
        timeline: {
          create: {
            title: 'Ticket Created',
            description: 'Sink blockage registered.',
            actor: 'Intake Agent',
            type: 'created',
          },
        },
      },
    });
  });
}

/**
 * Every vendor gets the login it would get from the Vendors page. Two have a
 * password, so the vendor screen can be tried without an OTP.
 */
async function seedVendorAccounts() {
  await createUser({
    id: 'VEN-01',
    name: 'Ramesh Kumar',
    phone: '+91 98201 44321',
    email: 'ramesh@vendors.example',
    password: 'ramesh123',
  });
  await createUser({
    id: 'VEN-G1',
    name: 'Sunil Patil',
    phone: '+91 99000 33333',
    email: 'sunil@vendors.example',
    password: 'sunil123',
  });

  for (const vendor of await unscopedPrisma.vendor.findMany()) {
    const phone = canonicalPhone(vendor.phone)!;
    await unscopedPrisma.vendor.update({ where: { id: vendor.id }, data: { phone } });
    await linkVendorAccount({ ...vendor, phone });
  }
}

async function main() {
  if ((await unscopedPrisma.society.count()) > 0) {
    if (process.env.SEED_RESET !== 'true') {
      console.log('Database already has societies; not seeding. Set SEED_RESET=true to wipe it and seed again.');
      return;
    }
    // Qualified with the schema as well as relying on search_path: an
    // unqualified TRUNCATE once emptied the wrong schema.
    const tables = APP_TABLES.map((t) => `"${DATABASE_SCHEMA}"."${t}"`).join(', ');
    await unscopedPrisma.$executeRawUnsafe(`TRUNCATE ${tables} CASCADE`);
    console.log(`Existing data removed from schema "${DATABASE_SCHEMA}" (SEED_RESET=true)`);
  }

  await seedShreeRam();
  await seedGreenValley();
  await seedVendorAccounts();
  await seedPlaces();
  console.log('Seed completed successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await unscopedPrisma.$disconnect();
  });
