import { dbStore } from '../database/store';
import { FunctionDeclaration, Type } from '@google/genai';
import { IssueCategory, UrgencyLevel, TicketStatus } from '../types';

// Tool Declarations for Gemini API
export const maintenanceToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'create_ticket',
    description: 'Create a new maintenance ticket after extracting flat number, issue category, urgency, and description from resident complaint.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        flatNumber: { type: Type.STRING, description: 'Flat or Tower number, e.g. "B-402" or "Tower A"' },
        residentName: { type: Type.STRING, description: 'Name of resident reporting issue' },
        residentPhone: { type: Type.STRING, description: 'Phone number of resident' },
        issueCategory: {
          type: Type.STRING,
          description: 'Category: Plumbing, Electrical, Lift & Elevator, Carpentry & Locks, AC & Appliances, Cleaning & Pest, Security & Intercom, General Repairs',
        },
        description: { type: Type.STRING, description: 'Detailed description of maintenance problem' },
        urgency: { type: Type.STRING, description: 'Urgency level: High, Medium, or Low' },
      },
      required: ['flatNumber', 'issueCategory', 'description', 'urgency'],
    },
  },
  {
    name: 'update_ticket',
    description: 'Update status or description of an existing maintenance ticket.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID e.g. "SOC-1042"' },
        status: { type: Type.STRING, description: 'Status: Open, Vendor Assigned, In Progress, Escalated, Resolved, Closed' },
        description: { type: Type.STRING, description: 'Updated note or description' },
        urgency: { type: Type.STRING, description: 'Updated urgency: High, Medium, Low' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'get_ticket',
    description: 'Fetch complete details and timeline of a ticket by Ticket ID.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID e.g. "SOC-1042"' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'search_ticket',
    description: 'Search tickets by keyword query, flat number, category, urgency or status.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Keyword query e.g. "leakage", "402", "Ramesh"' },
        category: { type: Type.STRING, description: 'Optional category filter' },
        urgency: { type: Type.STRING, description: 'Optional urgency filter' },
        status: { type: Type.STRING, description: 'Optional status filter' },
      },
    },
  },
  {
    name: 'assign_vendor',
    description: 'Assign a maintenance vendor to a ticket and set estimated response time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID e.g. "SOC-1042"' },
        vendorId: { type: Type.STRING, description: 'Vendor ID e.g. "VND-01"' },
        estimatedEta: { type: Type.STRING, description: 'Estimated arrival time e.g. "20 mins"' },
      },
      required: ['ticketId', 'vendorId'],
    },
  },
  {
    name: 'get_vendors',
    description: 'Get list of registered society vendors, optionally filtered by issue category.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: { type: Type.STRING, description: 'Optional category e.g. Plumbing, Electrical' },
      },
    },
  },
  {
    name: 'notify_resident',
    description: 'Send polite SMS/WhatsApp update to resident regarding ticket progress.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID' },
        message: { type: Type.STRING, description: 'Clear update message in English or Hinglish' },
      },
      required: ['ticketId', 'message'],
    },
  },
  {
    name: 'notify_vendor',
    description: 'Dispatch job notification to vendor with job location and resident contact.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID' },
        vendorId: { type: Type.STRING, description: 'Vendor ID' },
        message: { type: Type.STRING, description: 'Job detail message' },
      },
      required: ['ticketId', 'vendorId', 'message'],
    },
  },
  {
    name: 'followup_vendor',
    description: 'Send reminder ping to assigned vendor for pending or delayed job.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'escalate_ticket',
    description: 'Escalate urgent or unresolved complaint to RWA Facility Manager and Safety Committee.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID' },
        reason: { type: Type.STRING, description: 'Reason for escalation e.g. "Lift stuck with residents", "Vendor unresponsive for 2 hours"' },
      },
      required: ['ticketId', 'reason'],
    },
  },
  {
    name: 'close_ticket',
    description: 'Mark ticket resolved/closed after resident confirmation and optional rating.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        ticketId: { type: Type.STRING, description: 'Ticket ID' },
        feedback: { type: Type.STRING, description: 'Optional resident feedback or completion note' },
      },
      required: ['ticketId'],
    },
  },
  {
    name: 'generate_daily_report',
    description: 'Generate comprehensive society maintenance summary, open tickets count, response speeds and RWA recommendations.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
];

// Tool Implementation Handlers
export function executeToolCall(name: string, args: any) {
  switch (name) {
    case 'create_ticket': {
      const ticket = dbStore.createTicket({
        flatNumber: args.flatNumber,
        residentName: args.residentName || 'Resident',
        residentPhone: args.residentPhone || '+91 98000 00000',
        issueCategory: (args.issueCategory as IssueCategory) || 'General Repairs',
        description: args.description,
        urgency: (args.urgency as UrgencyLevel) || 'Medium',
      });

      // Auto assign best vendor
      const bestVendor = dbStore.findBestVendorForCategory(ticket.issueCategory);
      let assignedVendorInfo = null;
      if (bestVendor) {
        dbStore.assignVendor(ticket.id, bestVendor.id, bestVendor.avgResolutionTime);
        assignedVendorInfo = bestVendor;
      }

      return {
        success: true,
        ticket,
        assignedVendor: assignedVendorInfo,
        message: `Ticket #${ticket.id} created for Flat ${ticket.flatNumber}.${assignedVendorInfo ? ` Automatically dispatched vendor ${assignedVendorInfo.name} (${assignedVendorInfo.rating} stars).` : ''}`,
      };
    }

    case 'update_ticket': {
      const updated = dbStore.updateTicket(args.ticketId, {
        status: args.status as TicketStatus,
        description: args.description,
        urgency: args.urgency as UrgencyLevel,
      });
      return { success: !!updated, ticket: updated };
    }

    case 'get_ticket': {
      const ticket = dbStore.getTicketById(args.ticketId);
      return { success: !!ticket, ticket };
    }

    case 'search_ticket': {
      const tickets = dbStore.searchTickets(args.query || '', args.category, args.urgency, args.status);
      return { success: true, count: tickets.length, tickets };
    }

    case 'assign_vendor': {
      const ticket = dbStore.assignVendor(args.ticketId, args.vendorId, args.estimatedEta || '30 mins');
      return { success: !!ticket, ticket };
    }

    case 'get_vendors': {
      let vendors = dbStore.getVendors();
      if (args.category) {
        vendors = vendors.filter(v => v.category === args.category);
      }
      return { success: true, count: vendors.length, vendors };
    }

    case 'notify_resident': {
      const notif = dbStore.notifyResident(args.ticketId, args.message);
      return { success: !!notif, notification: notif };
    }

    case 'notify_vendor': {
      const notif = dbStore.notifyVendor(args.ticketId, args.vendorId, args.message);
      return { success: !!notif, notification: notif };
    }

    case 'followup_vendor': {
      const ticket = dbStore.getTicketById(args.ticketId);
      if (!ticket) return { success: false, message: 'Ticket not found' };
      if (!ticket.assignedVendorId) return { success: false, message: 'No vendor assigned to this ticket yet' };

      const notif = dbStore.notifyVendor(ticket.id, ticket.assignedVendorId, `Urgently follow up on ticket #${ticket.id} at Flat ${ticket.flatNumber}.`);
      return { success: true, message: `Follow-up ping sent to ${ticket.assignedVendorName}`, notification: notif };
    }

    case 'escalate_ticket': {
      const ticket = dbStore.escalateTicket(args.ticketId, args.reason);
      return { success: !!ticket, ticket };
    }

    case 'close_ticket': {
      const ticket = dbStore.updateTicket(args.ticketId, { status: 'Closed' });
      if (ticket) {
        ticket.timeline.push({
          id: `TL-${Date.now()}`,
          timestamp: new Date().toISOString(),
          title: 'Ticket Closed',
          description: `Ticket resolved & closed. Feedback: "${args.feedback || 'Satisfactory'}"`,
          actor: 'Resident',
          type: 'closed',
        });
        dbStore.notifyResident(ticket.id, `Dhanyawad! Ticket #${ticket.id} has been marked closed. Thank you for using SocietyOps AI.`);
      }
      return { success: !!ticket, ticket };
    }

    case 'generate_daily_report': {
      const report = dbStore.generateAnalyticsReport();
      return { success: true, report };
    }

    default:
      return { success: false, error: `Unknown tool name: ${name}` };
  }
}
