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

// --- Auth ---

export const registerBody = z.object({
  name: text(100),
  flatNumber: text(30),
  phone,
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

export const loginBody = z.object({
  flatNumber: text(30),
  phone,
  password: z.string().min(1).max(128),
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
  flatNumber: text(30).optional(),
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
