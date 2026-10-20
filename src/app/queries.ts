import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  AgentActivityLog,
  DailyReport,
  NotificationLog,
  ResidentProfile,
  SocietyProfile,
  Ticket,
  Vendor,
} from '@/types';

/**
 * Server state for the whole frontend. Each screen asks for what it shows;
 * App.tsx used to fetch everything for every role into one block of useState.
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // A 401 or 403 will not fix itself on retry.
      retry: (failureCount, error: any) => !(error?.status >= 400 && error?.status < 500) && failureCount < 2,
    },
  },
});

export const keys = {
  tickets: ['tickets'] as const,
  ticket: (id: string) => ['tickets', id] as const,
  vendors: ['vendors'] as const,
  societyProfile: ['society-profile'] as const,
  notifications: ['notifications'] as const,
  agentLogs: ['logs'] as const,
  residentProfiles: ['resident-profiles'] as const,
  analytics: ['analytics'] as const,
};

export const useTickets = () =>
  useQuery({
    queryKey: keys.tickets,
    queryFn: async () => (await api<{ tickets: Ticket[] }>('/api/tickets')).tickets,
  });

export const useTicket = (id: string | undefined) =>
  useQuery({
    queryKey: keys.ticket(id ?? ''),
    queryFn: () => api<Ticket>(`/api/tickets/${encodeURIComponent(id!)}`),
    enabled: !!id,
  });

export const useVendors = () =>
  useQuery({
    queryKey: keys.vendors,
    queryFn: async () => (await api<{ vendors: Vendor[] }>('/api/vendors')).vendors,
  });

export const useSocietyProfile = () =>
  useQuery({
    queryKey: keys.societyProfile,
    queryFn: () => api<SocietyProfile | null>('/api/society-profile'),
  });

// Manager-only endpoints: callers pass enabled=false for other roles rather
// than collecting a 403.

export const useNotifications = (enabled: boolean) =>
  useQuery({
    queryKey: keys.notifications,
    queryFn: async () => (await api<{ notifications: NotificationLog[] }>('/api/notifications')).notifications,
    enabled,
  });

export const useAgentLogs = (enabled = true) =>
  useQuery({
    queryKey: keys.agentLogs,
    queryFn: async () => (await api<{ logs: AgentActivityLog[] }>('/api/logs')).logs,
    enabled,
  });

export const useResidentProfiles = (enabled = true) =>
  useQuery({
    queryKey: keys.residentProfiles,
    queryFn: async () => (await api<{ residents: ResidentProfile[] }>('/api/resident-profiles')).residents,
    enabled,
  });

export const useAnalytics = (enabled = true) =>
  useQuery({
    queryKey: keys.analytics,
    queryFn: () => api<DailyReport>('/api/analytics'),
    enabled,
  });

/** Everything a change to a ticket can affect. */
function useInvalidateTicketViews() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: keys.tickets }),
      client.invalidateQueries({ queryKey: keys.vendors }),
      client.invalidateQueries({ queryKey: keys.notifications }),
      client.invalidateQueries({ queryKey: keys.agentLogs }),
      client.invalidateQueries({ queryKey: keys.analytics }),
    ]);
}

const post = (path: string, body?: unknown) =>
  api(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export function useTicketActions() {
  const invalidate = useInvalidateTicketViews();
  // The server refuses some transitions (closing unstarted work, for example);
  // say why rather than leaving the button looking like it did nothing.
  const options = { onSuccess: invalidate, onError: (err: Error) => window.alert(err.message) };

  return {
    assign: useMutation({
      mutationFn: ({ ticketId, vendorId }: { ticketId: string; vendorId: string }) =>
        post(`/api/tickets/${ticketId}/assign`, { vendorId, estimatedEta: '25 mins' }),
      ...options,
    }),
    escalate: useMutation({
      mutationFn: ({ ticketId, reason }: { ticketId: string; reason: string }) =>
        post(`/api/tickets/${ticketId}/escalate`, { reason }),
      ...options,
    }),
    close: useMutation({
      mutationFn: ({ ticketId }: { ticketId: string }) => post(`/api/tickets/${ticketId}/close`, {}),
      ...options,
    }),
    runFollowup: useMutation({
      mutationFn: () => post('/api/followup/run'),
      ...options,
    }),
  };
}

/** Refetches everything on screen; used after the chat files a ticket. */
export function useRefreshAll() {
  const client = useQueryClient();
  return () => client.invalidateQueries();
}
