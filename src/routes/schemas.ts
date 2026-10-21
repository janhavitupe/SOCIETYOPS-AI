import { z } from 'zod';
import { canonicalPhone } from '../services/phone';
import { TICKET_STATUSES } from '../services/ticketRules';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../services/storage';

/**
 * Request schemas, one per route. Object schemas strip unknown keys, so a
 * handler never sees (or writes) a field it did not ask for.
 */

export const ISSUE_CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Lift & Elevator',
  'Carpentry & Locks',
  'AC & Appliances',
  'Cleaning & Pest',
  'Security & Intercom',
  'General Repairs',
] as const;

export const URGENCIES = ['High', 'Medium', 'Low'] as const;

const text = (max: number) => z.string().trim().min(1).max(max);

const phone = z.string().transform((raw, ctx) => {
  const value = canonicalPhone(raw);
  if (!value) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid phone number' });
    return z.NEVER;
  }
  return value;
});

/** Storage keys from POST /api/uploads; ownership is checked in the route. */
const imageRefs = z.array(z.string().max(200)).max(4);

// --- Account ---

export const updateAccountBody = z
  .object({
    name: text(100).optional(),
    email: z.string().trim().toLowerCase().email().max(200).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').max(128).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'Nothing to update' });

export const activeSocietyBody = z.object({ societyId: text(64) });

// --- Societies ---

const pinCode = z
  .string()
  .trim()
  .regex(/^[1-9][0-9]{5}$/, 'Enter a 6-digit PIN code');

export const createSocietyBody = z.object({
  name: text(150),
  registrationNumber: z.string().trim().max(60).optional(),
  address: text(300),
  city: text(80),
  pinCode,
});

/** Society admins edit the society's own details; status and join code are not editable here. */
export const updateSocietyBody = z
  .object({
    name: text(150),
    registrationNumber: z.string().trim().max(60),
    address: text(300),
    city: text(80),
    pinCode,
    timezone: z.string().trim().max(60),
    /** A storage key from POST /api/uploads, or null to remove the logo. */
    logoKey: z.string().max(200).nullable(),
  })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'No updatable fields provided' });

// --- Vendors ---

/** On duty or not. Whether they are busy is worked out from their open tickets. */
export const VENDOR_AVAILABILITY = ['Available', 'Offline'] as const;

export const createVendorBody = z.object({
  name: text(120),
  category: z.enum(ISSUE_CATEGORIES),
  phone,
  skills: z.array(text(60)).max(20).default([]),
  availability: z.enum(VENDOR_AVAILABILITY).default('Available'),
  avgResolutionTime: text(30).default('45 mins'),
  /** A new vendor has no job history; this is the starting score the dispatcher uses. */
  rating: z.number().min(1).max(5).default(4),
});

export const updateVendorBody = z
  .object({
    name: text(120),
    category: z.enum(ISSUE_CATEGORIES),
    phone,
    skills: z.array(text(60)).max(20),
    availability: z.enum(VENDOR_AVAILABILITY),
    avgResolutionTime: text(30),
    rating: z.number().min(1).max(5),
  })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'No updatable fields provided' });

// --- Buildings ---

export const TOWER_KINDS = ['tower', 'wing', 'block', 'lane'] as const;
export const FLAT_TYPES = ['1RK', '1BHK', '2BHK', '3BHK', '4BHK', '5BHK', 'villa', 'shop', 'office', 'other'] as const;
export const OCCUPANT_TYPES = ['owner', 'tenant', 'family'] as const;

export const createTowerBody = z.object({
  name: text(40),
  kind: z.enum(TOWER_KINDS).default('tower'),
  floors: z.number().int().min(0).max(200).optional(),
  liftsCount: z.number().int().min(0).max(50).default(0),
});

export const updateTowerBody = z
  .object({
    name: text(40),
    kind: z.enum(TOWER_KINDS),
    floors: z.number().int().min(0).max(200).nullable(),
    liftsCount: z.number().int().min(0).max(50),
  })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'No updatable fields provided' });

export const generateFlatsBody = z
  .object({
    /** Defaults to the tower's name. */
    prefix: z.string().trim().max(20).optional(),
    separator: z.string().max(3).default('-'),
    fromFloor: z.number().int().min(0).max(200),
    toFloor: z.number().int().min(0).max(200),
    perFloor: z.number().int().min(1).max(50),
    type: z.enum(FLAT_TYPES).optional(),
    parkingSlots: z.number().int().min(0).max(10).optional(),
    /** Preview only: report what would be created without writing it. */
    dryRun: z.boolean().default(false),
  })
  .refine((b) => b.toFloor >= b.fromFloor, { message: 'The last floor must not be below the first', path: ['toFloor'] })
  .refine((b) => (b.toFloor - b.fromFloor + 1) * b.perFloor <= 2000, {
    message: 'That is more than 2,000 flats; generate them in smaller batches',
  });

const flatFields = {
  towerId: text(64).nullable(),
  number: text(30),
  floor: z.number().int().min(0).max(200).nullable(),
  type: z.enum(FLAT_TYPES).nullable(),
  carpetAreaSqft: z.number().int().min(50).max(100000).nullable(),
  parkingSlots: z.number().int().min(0).max(10),
};

export const createFlatBody = z.object(flatFields).partial().required({ number: true });

export const updateFlatBody = z
  .object(flatFields)
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'No updatable fields provided' });

export const listFlatsQuery = z.object({
  towerId: z.string().max(64).optional(),
  query: z.string().max(60).optional(),
});

export const addOccupantBody = z.object({
  name: text(100),
  phone,
  type: z.enum(OCCUPANT_TYPES),
  moveInDate: z.coerce.date().optional(),
});

export const moveOutBody = z.object({
  moveOutDate: z.coerce.date().optional(),
});

// --- Tickets ---

export const idParams = z.object({ id: text(64) });
export type IdParams = z.infer<typeof idParams>;

/** "All" is what the dashboard filters send for "no filter". */
const filter = z.string().max(50).optional();

export const listTicketsQuery = z.object({
  query: z.string().max(200).optional(),
  category: filter,
  urgency: filter,
  status: filter,
});

export const createTicketBody = z.object({
  issueCategory: z.enum(ISSUE_CATEGORIES),
  description: text(2000),
  urgency: z.enum(URGENCIES).default('Medium'),
  flatId: text(64).optional(),
  flatNumber: text(60).optional(),
  residentName: text(100).optional(),
  residentPhone: phone.optional(),
  images: imageRefs.default([]),
});

export const updateTicketBody = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    urgency: z.enum(URGENCIES).optional(),
    description: text(2000).optional(),
    issueCategory: z.enum(ISSUE_CATEGORIES).optional(),
    estimatedEta: text(50).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'No updatable fields provided' });

export const assignVendorBody = z.object({
  vendorId: text(64),
  estimatedEta: text(50).optional(),
});

export const escalateBody = z.object({
  reason: text(500).optional(),
});

export const closeBody = z.object({
  feedback: text(1000).optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

// --- Uploads ---

export const uploadBody = z.object({
  contentType: z.enum(Object.keys(ALLOWED_IMAGE_TYPES) as [string, ...string[]], {
    message: 'Photos must be JPEG, PNG or WebP',
  }),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES, 'Photos must be 5 MB or smaller'),
});

// --- Chat ---

export const chatBody = z.object({
  text: text(4000),
  images: imageRefs.default([]),
});

// --- Society ---

/** Every field optional; id, updatedAt and lastUpdatedBy are set by the server. */
export const societyProfileBody = z
  .object({
    societyName: text(150),
    address: text(300),
    tagline: z.string().trim().max(200),
    introText: z.string().trim().max(2000),
    maintenanceContact: z.string().trim().max(100),
    maintenancePhone: z.string().trim().max(30),
    maintenanceEmail: z.union([z.literal(''), z.string().trim().email().max(200)]),
    highlights: z.array(text(100)).max(10),
  })
  .partial()
  .refine((b) => Object.values(b).some((v) => v !== undefined), { message: 'No updatable fields provided' });
