import { useState } from 'react';
import { Pencil, Plus, Trash2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useVendors } from './queries';
import { useTowers } from './buildingQueries';
import {
  daysLeft,
  usePlaceActions,
  usePlaces,
  type Asset,
  type AssetKind,
  type CommonArea,
  type CommonAreaKind,
} from './placeQueries';
import { FormError } from './pages/AuthPages';

const AREA_KINDS: Record<CommonAreaKind, string> = {
  lobby: 'Lobby',
  terrace: 'Terrace',
  parking: 'Parking',
  garden: 'Garden',
  clubhouse: 'Clubhouse',
  gym: 'Gym',
  pool: 'Pool',
  stp: 'STP',
  other: 'Other',
};

const ASSET_KINDS: Record<AssetKind, string> = {
  lift: 'Lift',
  water_pump: 'Water pump',
  dg_set: 'DG set',
  fire_panel: 'Fire panel',
  cctv: 'CCTV',
  other: 'Other',
};

/** Contracts this close to running out are flagged. */
const AMC_WARNING_DAYS = 30;

function AmcBadge({ asset }: { asset: Asset }) {
  const left = daysLeft(asset.amcExpiresOn);
  if (!asset.amcVendor && left === null) return <span className="text-xs text-muted-foreground">No AMC</span>;
  const until = asset.amcExpiresOn ? new Date(asset.amcExpiresOn).toLocaleDateString() : null;
  const tone =
    left !== null && left < 0
      ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
      : left !== null && left <= AMC_WARNING_DAYS
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>
      AMC{asset.amcVendor ? `: ${asset.amcVendor.name}` : ''}
      {until && (left! < 0 ? ` · expired ${until}` : ` · until ${until}`)}
    </span>
  );
}

/**
 * The society's common areas and the assets in them. Residents' reports about
 * them ("lift B2 stuck") are filed against these, and an asset's AMC vendor
 * gets its jobs first.
 */
export function CommonAreasCard() {
  const places = usePlaces();
  const { removeArea, removeAsset } = usePlaceActions();
  const [addingArea, setAddingArea] = useState(false);
  const [editing, setEditing] = useState<{ asset?: Asset; areaId: string | null } | null>(null);

  const areas = places.data?.commonAreas ?? [];
  const loose = places.data?.looseAssets ?? [];
  const error = removeArea.error?.message ?? removeAsset.error?.message ?? null;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Common areas & assets</CardTitle>
          <CardDescription>
            Lobbies, terraces and the lifts, pumps and panels in them. Residents can report problems with any of these,
            and an asset’s AMC vendor gets its jobs first.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditing({ areaId: null })}>
            <Wrench /> Add asset
          </Button>
          <Button onClick={() => setAddingArea(true)}>
            <Plus /> Add area
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <FormError message={error} />
        {places.data && !areas.length && !loose.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No common areas yet. Add the lobby, terrace or parking, then the lifts and pumps in them.
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {areas.map((area) => (
            <AreaBlock
              key={area.id}
              area={area}
              onAddAsset={() => setEditing({ areaId: area.id })}
              onEditAsset={(asset) => setEditing({ asset, areaId: area.id })}
              onRemove={() => confirm(`Remove ${area.name}?`) && removeArea.mutate(area.id)}
              onRemoveAsset={(asset) => confirm(`Remove ${asset.name}?`) && removeAsset.mutate(asset.id)}
            />
          ))}
          {loose.length > 0 && (
            <AreaBlock
              area={{ id: '', name: 'Not in an area', kind: 'other', towerId: null, assets: loose }}
              onEditAsset={(asset) => setEditing({ asset, areaId: null })}
              onRemoveAsset={(asset) => confirm(`Remove ${asset.name}?`) && removeAsset.mutate(asset.id)}
            />
          )}
        </div>
      </CardContent>

      <AddAreaDialog open={addingArea} onOpenChange={setAddingArea} />
      {editing && (
        <AssetDialog asset={editing.asset} areaId={editing.areaId} areas={areas} onClose={() => setEditing(null)} />
      )}
    </Card>
  );
}

function AreaBlock({
  area,
  onAddAsset,
  onEditAsset,
  onRemove,
  onRemoveAsset,
}: {
  area: CommonArea;
  onAddAsset?: () => void;
  onEditAsset: (asset: Asset) => void;
  onRemove?: () => void;
  onRemoveAsset: (asset: Asset) => void;
}) {
  return (
    <div className="grid content-start gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{area.name}</div>
          <div className="text-xs text-muted-foreground">
            {AREA_KINDS[area.kind]}
            {area.tower ? ` · ${area.tower.name}` : ''}
          </div>
        </div>
        <div className="flex">
          {onAddAsset && (
            <Button size="icon" variant="ghost" onClick={onAddAsset} aria-label={`Add asset to ${area.name}`}>
              <Plus />
            </Button>
          )}
          {onRemove && (
            <Button size="icon" variant="ghost" onClick={onRemove} aria-label={`Remove ${area.name}`}>
              <Trash2 />
            </Button>
          )}
        </div>
      </div>
      {area.assets.map((asset) => (
        <div
          key={asset.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 text-sm"
        >
          <div className="grid gap-0.5">
            <span>
              <span className="font-medium">{asset.name}</span>
              <span className="text-muted-foreground">
                {' '}
                · {ASSET_KINDS[asset.kind]}
                {asset.make ? ` · ${asset.make}` : ''}
              </span>
            </span>
            <AmcBadge asset={asset} />
          </div>
          <div className="flex">
            <Button size="icon" variant="ghost" onClick={() => onEditAsset(asset)} aria-label={`Edit ${asset.name}`}>
              <Pencil />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onRemoveAsset(asset)}
              aria-label={`Remove ${asset.name}`}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AddAreaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const towers = useTowers();
  const { addArea } = usePlaceActions();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CommonAreaKind>('lobby');
  const [towerId, setTowerId] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addArea.mutate(
      { name, kind, towerId: towerId || null },
      {
        onSuccess: () => {
          setName('');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a common area</DialogTitle>
          <DialogDescription>Give it the name residents use, like “Tower B Lobby” or “Terrace”.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="area-name">Name</Label>
            <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="area-kind">Kind</Label>
              <NativeSelect id="area-kind" value={kind} onChange={(e) => setKind(e.target.value as CommonAreaKind)}>
                {Object.entries(AREA_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="area-tower">Tower (optional)</Label>
              <NativeSelect id="area-tower" value={towerId} onChange={(e) => setTowerId(e.target.value)}>
                <option value="">Whole society</option>
                {towers.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <FormError message={addArea.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={addArea.isPending}>
              {addArea.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AssetDialog({
  asset,
  areaId,
  areas,
  onClose,
}: {
  asset?: Asset;
  areaId: string | null;
  areas: CommonArea[];
  onClose: () => void;
}) {
  const vendors = useVendors();
  const { addAsset, updateAsset } = usePlaceActions();
  const [name, setName] = useState(asset?.name ?? '');
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? 'lift');
  const [commonAreaId, setCommonAreaId] = useState(asset?.commonAreaId ?? areaId ?? '');
  const [make, setMake] = useState(asset?.make ?? '');
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber ?? '');
  const [amcVendorId, setAmcVendorId] = useState(asset?.amcVendorId ?? '');
  const [amcExpiresOn, setAmcExpiresOn] = useState(asset?.amcExpiresOn?.slice(0, 10) ?? '');
  const mutation = asset ? updateAsset : addAsset;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const area = areas.find((a) => a.id === commonAreaId);
    const body = {
      name,
      kind,
      commonAreaId: commonAreaId || null,
      // An asset in a tower's lobby belongs to that tower.
      towerId: area?.towerId ?? asset?.towerId ?? null,
      make: make || null,
      serialNumber: serialNumber || null,
      amcVendorId: amcVendorId || null,
      amcExpiresOn: amcExpiresOn || null,
    };
    const done = { onSuccess: onClose };
    if (asset) updateAsset.mutate({ id: asset.id, ...body }, done);
    else addAsset.mutate(body, done);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.name}` : 'Add an asset'}</DialogTitle>
          <DialogDescription>
            Name each one so residents can tell them apart, like “Lift B2”. Jobs on it go to its AMC vendor first.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid grid-cols-[1fr_9rem] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="asset-name">Name</Label>
              <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="asset-kind">Kind</Label>
              <NativeSelect id="asset-kind" value={kind} onChange={(e) => setKind(e.target.value as AssetKind)}>
                {Object.entries(ASSET_KINDS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="asset-area">Common area</Label>
            <NativeSelect id="asset-area" value={commonAreaId} onChange={(e) => setCommonAreaId(e.target.value)}>
              <option value="">Not in an area</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="asset-make">Make</Label>
              <Input id="asset-make" value={make} onChange={(e) => setMake(e.target.value)} maxLength={80} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="asset-serial">Serial number</Label>
              <Input
                id="asset-serial"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                maxLength={80}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="asset-amc">AMC vendor</Label>
              <NativeSelect id="asset-amc" value={amcVendorId} onChange={(e) => setAmcVendorId(e.target.value)}>
                <option value="">None</option>
                {vendors.data?.map((v: { id: string; name: string; category: string }) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.category})
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="asset-amc-until">AMC until</Label>
              <Input
                id="asset-amc-until"
                type="date"
                value={amcExpiresOn}
                onChange={(e) => setAmcExpiresOn(e.target.value)}
              />
            </div>
          </div>
          <FormError message={mutation.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : asset ? 'Save' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
