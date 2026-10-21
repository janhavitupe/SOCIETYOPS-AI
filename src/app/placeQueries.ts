import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Common areas and the assets in them (routes/places). */

export type CommonAreaKind =
  'lobby' | 'terrace' | 'parking' | 'garden' | 'clubhouse' | 'gym' | 'pool' | 'stp' | 'other';
export type AssetKind = 'lift' | 'water_pump' | 'dg_set' | 'fire_panel' | 'cctv' | 'other';

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  commonAreaId: string | null;
  towerId: string | null;
  make?: string | null;
  serialNumber?: string | null;
  amcVendorId?: string | null;
  amcVendor?: { id: string; name: string } | null;
  amcExpiresOn?: string | null;
}

export interface CommonArea {
  id: string;
  name: string;
  kind: CommonAreaKind;
  towerId: string | null;
  tower?: { id: string; name: string } | null;
  assets: Asset[];
}

export interface AssetInput {
  name: string;
  kind: AssetKind;
  commonAreaId: string | null;
  towerId: string | null;
  make: string | null;
  serialNumber: string | null;
  amcVendorId: string | null;
  amcExpiresOn: string | null;
}

const KEY = ['common-areas'] as const;

const send = <T>(path: string, method: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const usePlaces = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => api<{ commonAreas: CommonArea[]; looseAssets: Asset[] }>('/api/common-areas'),
  });

export function usePlaceActions() {
  const client = useQueryClient();
  const options = { onSuccess: () => client.invalidateQueries({ queryKey: KEY }) };
  return {
    addArea: useMutation({
      mutationFn: (body: { name: string; kind: CommonAreaKind; towerId: string | null }) =>
        send<CommonArea>('/api/common-areas', 'POST', body),
      ...options,
    }),
    removeArea: useMutation({ mutationFn: (id: string) => send(`/api/common-areas/${id}`, 'DELETE'), ...options }),
    addAsset: useMutation({ mutationFn: (body: AssetInput) => send<Asset>('/api/assets', 'POST', body), ...options }),
    updateAsset: useMutation({
      mutationFn: ({ id, ...body }: Partial<AssetInput> & { id: string }) =>
        send<Asset>(`/api/assets/${id}`, 'PATCH', body),
      ...options,
    }),
    removeAsset: useMutation({ mutationFn: (id: string) => send(`/api/assets/${id}`, 'DELETE'), ...options }),
  };
}

/** Days until a contract runs out; negative once it has. */
export function daysLeft(isoDate: string | null | undefined, now = new Date()): number | null {
  if (!isoDate) return null;
  return Math.ceil((new Date(isoDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
}
