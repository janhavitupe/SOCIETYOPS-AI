import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { buildingKeys } from './buildingQueries';
import { keys } from './queries';

/** Join requests and invites, for managers. */

export interface JoinRequest {
  id: string;
  type: 'owner' | 'tenant' | 'family';
  createdAt: string;
  flat: { id: string; number: string };
  user: { id: string; name: string; phoneNumber: string | null };
}

export interface Invite {
  id: string;
  phone: string;
  name: string | null;
  role: 'manager' | 'committee' | 'resident';
  token: string;
  expiresAt: string;
  flat: { number: string } | null;
}

export interface NewInvite {
  phone: string;
  name?: string;
  role: Invite['role'];
  flatId?: string;
  occupantType?: string;
}

export const joinKeys = {
  requests: ['join-requests'] as const,
  invites: ['invites'] as const,
};

const send = <T>(path: string, method: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const useJoinRequests = () =>
  useQuery({
    queryKey: joinKeys.requests,
    queryFn: async () => (await api<{ requests: JoinRequest[] }>('/api/join-requests')).requests,
  });

export const useInvites = () =>
  useQuery({
    queryKey: joinKeys.invites,
    queryFn: async () => (await api<{ invites: Invite[] }>('/api/invites')).invites,
  });

export function useJoinActions() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: joinKeys.requests }),
      client.invalidateQueries({ queryKey: joinKeys.invites }),
      client.invalidateQueries({ queryKey: buildingKeys.allFlats }),
      client.invalidateQueries({ queryKey: ['occupants'] }),
      client.invalidateQueries({ queryKey: keys.residentProfiles }),
    ]);
  const options = { onSuccess: refresh };

  return {
    approve: useMutation({ mutationFn: (id: string) => send(`/api/join-requests/${id}/approve`, 'POST'), ...options }),
    reject: useMutation({ mutationFn: (id: string) => send(`/api/join-requests/${id}/reject`, 'POST'), ...options }),
    invite: useMutation({ mutationFn: (body: NewInvite) => send<Invite>('/api/invites', 'POST', body), ...options }),
    revoke: useMutation({ mutationFn: (id: string) => send(`/api/invites/${id}`, 'DELETE'), ...options }),
  };
}

/** The link the invited person opens. */
export const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;

/**
 * A wa.me link that opens WhatsApp with the invite message ready to send.
 * Residents in India expect invitations over WhatsApp rather than SMS.
 */
export function whatsAppInvite(invite: Invite, societyName: string): string {
  const digits = invite.phone.replace(/[^0-9]/g, '');
  const place = invite.flat ? ` for flat ${invite.flat.number}` : '';
  const text = `${invite.name ? `Hello ${invite.name}, you` : 'You'} have been invited to ${societyName}${place} on SocietyOps. Open this link to join: ${inviteLink(invite.token)}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
