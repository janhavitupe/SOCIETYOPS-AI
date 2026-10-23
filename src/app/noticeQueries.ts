import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Notices from the society office (routes/notices). */

export interface Notice {
  id: string;
  title: string;
  body: string;
  urgent: boolean;
  pinned: boolean;
  publishAt: string;
  expiresAt: string | null;
  read: boolean;
  pollOptions: string[];
  myVote: number | null;
  results: number[] | null;
}

export interface ManagedNotice extends Omit<Notice, 'read' | 'myVote'> {
  audience: 'all' | 'towers' | 'flats';
  towerIds: string[];
  flatIds: string[];
  state: 'scheduled' | 'live' | 'expired';
  audienceCount: number;
  readCount: number;
}

export interface NoticeInput {
  title: string;
  body: string;
  audience: 'all' | 'towers' | 'flats';
  towerIds: string[];
  flatIds: string[];
  urgent: boolean;
  pinned: boolean;
  publishAt?: string | null;
  expiresAt?: string | null;
  pollOptions: string[];
}

const MINE = ['notices', 'mine'] as const;
const MANAGE = ['notices', 'manage'] as const;

const send = <T>(path: string, method: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const useMyNotices = () =>
  useQuery({
    queryKey: MINE,
    queryFn: () => api<{ unread: number; notices: Notice[] }>('/api/notices'),
    refetchInterval: 60_000,
  });

export const useManagedNotices = () =>
  useQuery({
    queryKey: MANAGE,
    queryFn: async () => (await api<{ notices: ManagedNotice[] }>('/api/notices/manage')).notices,
  });

export const useNoticeReads = (id: string | null) =>
  useQuery({
    queryKey: ['notices', 'reads', id],
    queryFn: () =>
      api<{ total: number; read: number; unread: { id: string; name: string; flats: string[] }[] }>(
        `/api/notices/${id}/reads`,
      ),
    enabled: !!id,
  });

export function useNoticeActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['notices'] });
  return {
    read: useMutation({ mutationFn: (id: string) => send(`/api/notices/${id}/read`, 'POST', {}), onSuccess: refresh }),
    vote: useMutation({
      mutationFn: ({ id, option }: { id: string; option: number }) =>
        send<{ results: number[] }>(`/api/notices/${id}/vote`, 'POST', { option }),
      onSuccess: refresh,
    }),
    create: useMutation({ mutationFn: (body: NoticeInput) => send('/api/notices', 'POST', body), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id: string) => send(`/api/notices/${id}`, 'DELETE'), onSuccess: refresh }),
    remind: useMutation({
      mutationFn: (id: string) => send<{ sent: number }>(`/api/notices/${id}/remind`, 'POST', {}),
      onSuccess: refresh,
    }),
  };
}
