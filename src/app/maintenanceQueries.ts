import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Preventive maintenance (routes/maintenance). */

export type Unit = 'days' | 'weeks' | 'months';

export interface Schedule {
  id: string;
  title: string;
  category: string;
  assetId: string | null;
  commonAreaId: string | null;
  vendorId: string | null;
  asset: { id: string; name: string } | null;
  commonArea: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
  every: number;
  unit: Unit;
  nextDueOn: string;
  leadDays: number;
  checklist: string[];
  active: boolean;
}

export interface ScheduleInput {
  title: string;
  category: string;
  assetId: string | null;
  commonAreaId: string | null;
  vendorId: string | null;
  every: number;
  unit: Unit;
  nextDueOn: string;
  leadDays: number;
  checklist: string[];
}

export interface Licence {
  id: string;
  name: string;
  assetId: string | null;
  asset: { id: string; name: string } | null;
  expiresOn: string;
  notes: string | null;
}

export interface UpcomingItem {
  date: string;
  kind: 'visit' | 'licence' | 'amc';
  title: string;
  detail: string;
  overdue: boolean;
  scheduleId?: string;
  ticketId?: string;
}

const send = <T>(path: string, method: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const useSchedules = () =>
  useQuery({
    queryKey: ['maintenance', 'schedules'],
    queryFn: async () => (await api<{ schedules: Schedule[] }>('/api/maintenance/schedules')).schedules,
  });

export const useLicences = () =>
  useQuery({
    queryKey: ['maintenance', 'licences'],
    queryFn: async () => (await api<{ licences: Licence[] }>('/api/maintenance/licences')).licences,
  });

export const useUpcoming = (days: number) =>
  useQuery({
    queryKey: ['maintenance', 'upcoming', days],
    queryFn: async () => (await api<{ items: UpcomingItem[] }>(`/api/maintenance/upcoming?days=${days}`)).items,
  });

export function useMaintenanceActions() {
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['maintenance'] }),
      client.invalidateQueries({ queryKey: ['tickets'] }),
    ]);
  const options = { onSuccess: refresh };
  return {
    addSchedule: useMutation({
      mutationFn: (body: ScheduleInput) => send('/api/maintenance/schedules', 'POST', body),
      ...options,
    }),
    updateSchedule: useMutation({
      mutationFn: ({ id, ...body }: Partial<ScheduleInput> & { id: string; active?: boolean }) =>
        send(`/api/maintenance/schedules/${id}`, 'PATCH', body),
      ...options,
    }),
    removeSchedule: useMutation({
      mutationFn: (id: string) => send(`/api/maintenance/schedules/${id}`, 'DELETE'),
      ...options,
    }),
    raise: useMutation({
      mutationFn: (id: string) => send<{ id: string }>(`/api/maintenance/schedules/${id}/raise`, 'POST', {}),
      ...options,
    }),
    addLicence: useMutation({
      mutationFn: (body: { name: string; expiresOn: string; notes: string | null; assetId: string | null }) =>
        send('/api/maintenance/licences', 'POST', body),
      ...options,
    }),
    renewLicence: useMutation({
      mutationFn: ({ id, expiresOn }: { id: string; expiresOn: string }) =>
        send(`/api/maintenance/licences/${id}`, 'PATCH', { expiresOn }),
      ...options,
    }),
    removeLicence: useMutation({
      mutationFn: (id: string) => send(`/api/maintenance/licences/${id}`, 'DELETE'),
      ...options,
    }),
  };
}
