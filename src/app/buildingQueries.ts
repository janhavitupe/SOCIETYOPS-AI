import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { keys } from './queries';

/** Data for managing a society's buildings, residents and vendors. */

export interface Tower {
  id: string;
  name: string;
  kind: 'tower' | 'wing' | 'block' | 'lane';
  floors: number | null;
  liftsCount: number;
  flatCount: number;
}

export interface OccupantUser {
  id: string;
  name: string;
  phoneNumber: string | null;
}

export interface Occupant {
  id: string;
  flatId: string;
  type: 'owner' | 'tenant' | 'family';
  status: 'pending' | 'active' | 'ended' | 'rejected';
  moveInDate: string | null;
  moveOutDate: string | null;
  user: OccupantUser;
}

export interface Flat {
  id: string;
  number: string;
  floor: number | null;
  type: string | null;
  carpetAreaSqft: number | null;
  parkingSlots: number;
  towerId: string | null;
  tower: { id: string; name: string } | null;
  occupants: Occupant[];
}

export const buildingKeys = {
  towers: ['towers'] as const,
  flats: (towerId?: string) => ['flats', towerId ?? 'all'] as const,
  allFlats: ['flats'] as const,
  occupants: (flatId: string) => ['occupants', flatId] as const,
};

const send = <T>(path: string, method: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const useTowers = () =>
  useQuery({
    queryKey: buildingKeys.towers,
    queryFn: async () => (await api<{ towers: Tower[] }>('/api/towers')).towers,
  });

export const useFlats = (towerId?: string) =>
  useQuery({
    queryKey: buildingKeys.flats(towerId),
    queryFn: async () =>
      (await api<{ flats: Flat[] }>(`/api/flats${towerId ? `?towerId=${encodeURIComponent(towerId)}` : ''}`)).flats,
  });

export const useFlatOccupants = (flatId: string | undefined) =>
  useQuery({
    queryKey: buildingKeys.occupants(flatId ?? ''),
    queryFn: () => api<{ occupants: Occupant[] }>(`/api/flats/${flatId}/occupants`).then((r) => r.occupants),
    enabled: !!flatId,
  });

/** Everything that changes when buildings or residents change. */
function useInvalidateBuildings() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: buildingKeys.towers }),
      client.invalidateQueries({ queryKey: buildingKeys.allFlats }),
      client.invalidateQueries({ queryKey: ['occupants'] }),
      client.invalidateQueries({ queryKey: keys.residentProfiles }),
    ]);
}

export function useBuildingActions() {
  const invalidate = useInvalidateBuildings();
  const options = { onSuccess: invalidate };

  return {
    addTower: useMutation({
      mutationFn: (body: { name: string; kind: Tower['kind']; liftsCount?: number }) =>
        send<Tower>('/api/towers', 'POST', body),
      ...options,
    }),
    deleteTower: useMutation({ mutationFn: (id: string) => send(`/api/towers/${id}`, 'DELETE'), ...options }),
    generateFlats: useMutation({
      mutationFn: ({ towerId, ...body }: GenerateFlatsInput & { towerId: string }) =>
        send<{ created: string[]; skipped: string[]; dryRun: boolean }>(
          `/api/towers/${towerId}/flats/generate`,
          'POST',
          body,
        ),
      onSuccess: (result) => (result.dryRun ? undefined : invalidate()),
    }),
    addFlat: useMutation({
      mutationFn: (body: Partial<Flat> & { number: string }) => send<Flat>('/api/flats', 'POST', body),
      ...options,
    }),
    updateFlat: useMutation({
      mutationFn: ({ id, ...body }: Partial<Flat> & { id: string }) => send<Flat>(`/api/flats/${id}`, 'PATCH', body),
      ...options,
    }),
    deleteFlat: useMutation({ mutationFn: (id: string) => send(`/api/flats/${id}`, 'DELETE'), ...options }),
    addOccupant: useMutation({
      mutationFn: ({ flatId, ...body }: { flatId: string; name: string; phone: string; type: Occupant['type'] }) =>
        send<Occupant & { isNewAccount: boolean }>(`/api/flats/${flatId}/occupants`, 'POST', body),
      ...options,
    }),
    moveOut: useMutation({
      mutationFn: (occupantId: string) => send(`/api/occupants/${occupantId}/move-out`, 'POST', {}),
      ...options,
    }),
  };
}

export interface GenerateFlatsInput {
  fromFloor: number;
  toFloor: number;
  perFloor: number;
  prefix?: string;
  separator?: string;
  type?: string;
  parkingSlots?: number;
  dryRun?: boolean;
}

export interface VendorInput {
  name: string;
  category: string;
  phone: string;
  skills: string[];
  availability: 'Available' | 'Offline';
  avgResolutionTime: string;
  rating: number;
}

/** Jobs a vendor change moved off a busy vendor's queue (routes/vendors). */
export interface Reassignment {
  ticketId: string;
  fromVendorName: string;
  toVendorName: string;
  estimatedEta: string;
}

type VendorResult = { id: string; name: string; reassigned?: Reassignment[] };

export function useVendorActions() {
  const client = useQueryClient();
  // Adding or freeing a vendor can move tickets between vendors.
  const options = {
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: keys.vendors }),
        client.invalidateQueries({ queryKey: keys.tickets }),
        client.invalidateQueries({ queryKey: keys.notifications }),
      ]),
  };
  return {
    add: useMutation({
      mutationFn: (body: VendorInput) => send<VendorResult>('/api/vendors', 'POST', body),
      ...options,
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }: Partial<VendorInput> & { id: string }) =>
        send<VendorResult>(`/api/vendors/${id}`, 'PATCH', body),
      ...options,
    }),
    remove: useMutation({
      mutationFn: (id: string) => send<{ reassigned: Reassignment[] }>(`/api/vendors/${id}`, 'DELETE'),
      ...options,
    }),
  };
}
