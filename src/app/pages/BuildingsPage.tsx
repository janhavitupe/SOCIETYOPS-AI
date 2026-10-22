import { useEffect, useMemo, useState } from 'react';
import { Building2, FileSpreadsheet, Plus, Trash2, Users, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';
import {
  useBuildingActions,
  useFlatOccupants,
  useFlats,
  useTowers,
  type Flat,
  type Occupant,
  type Tower,
} from '../buildingQueries';
import { FormError } from './AuthPages';
import { InviteLinkBox, JoinRequestsCard } from '../JoinWidgets';
import { CommonAreasCard } from '../CommonAreasCard';
import { RegisterImportDialog } from '../RegisterImportDialog';
import { useJoinActions, type Invite } from '../joinQueries';

const FLAT_TYPES = ['1RK', '1BHK', '2BHK', '3BHK', '4BHK', '5BHK', 'villa', 'shop', 'office', 'other'];
const KIND_LABEL: Record<Tower['kind'], string> = { tower: 'Tower', wing: 'Wing', block: 'Block', lane: 'Lane' };

/**
 * Managers describe the society's buildings here: towers (or wings, blocks,
 * lanes), their flats, and who lives in each flat.
 */
export function BuildingsPage() {
  const towers = useTowers();
  const [towerId, setTowerId] = useState<string | undefined>();
  const [addingTower, setAddingTower] = useState(false);
  const [importing, setImporting] = useState(false);

  // Select the first tower once they load, and keep a valid selection after deletes.
  useEffect(() => {
    if (!towers.data) return;
    if (!towerId || !towers.data.some((t) => t.id === towerId)) setTowerId(towers.data[0]?.id);
  }, [towers.data, towerId]);

  const tower = towers.data?.find((t) => t.id === towerId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Buildings & residents</h1>
          <p className="text-sm text-muted-foreground">
            Towers, their flats and who lives in each one, and the common areas and assets everyone shares.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <FileSpreadsheet /> Import / export
          </Button>
          <Button onClick={() => setAddingTower(true)}>
            <Plus /> Add tower or wing
          </Button>
        </div>
      </div>

      <JoinRequestsCard />

      {towers.data && towers.data.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No buildings yet. Add your first tower, wing, block or lane, or import your flat register from Excel.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="Towers" className="grid content-start gap-1">
            {towers.data?.map((t) => (
              <button
                key={t.id}
                onClick={() => setTowerId(t.id)}
                className={cn(
                  'flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  t.id === towerId ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent',
                )}
              >
                <span className="flex items-center gap-2">
                  <Building2 className="size-4 text-muted-foreground" />
                  {KIND_LABEL[t.kind]} {t.name}
                </span>
                <span className="text-xs text-muted-foreground">{t.flatCount} flats</span>
              </button>
            ))}
          </nav>
          {tower && <TowerPanel tower={tower} />}
        </div>
      )}

      <CommonAreasCard />

      <AddTowerDialog open={addingTower} onOpenChange={setAddingTower} onAdded={setTowerId} />
      <RegisterImportDialog open={importing} onOpenChange={setImporting} />
    </div>
  );
}

function TowerPanel({ tower }: { tower: Tower }) {
  const flats = useFlats(tower.id);
  const actions = useBuildingActions();
  const [filter, setFilter] = useState('');
  const [generating, setGenerating] = useState(false);
  const [addingFlat, setAddingFlat] = useState(false);
  const [managing, setManaging] = useState<Flat | null>(null);

  const shown = useMemo(
    () => (flats.data ?? []).filter((f) => f.number.toLowerCase().includes(filter.trim().toLowerCase())),
    [flats.data, filter],
  );

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>
          {KIND_LABEL[tower.kind]} {tower.name}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {tower.flatCount} flats{tower.floors ? ` · ${tower.floors} floors` : ''}
          </span>
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setGenerating(true)}>
            <Wand2 /> Generate flats
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddingFlat(true)}>
            <Plus /> Add flat
          </Button>
          {tower.flatCount === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => confirm(`Delete ${tower.name}?`) && actions.deleteTower.mutate(tower.id)}
            >
              <Trash2 /> Delete
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {tower.flatCount > 0 && (
          <Input
            placeholder="Find a flat"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
            aria-label="Find a flat"
          />
        )}
        {flats.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tower.flatCount === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No flats yet. Use <span className="font-medium text-foreground">Generate flats</span> to create them from a
            floor pattern, or add them one by one.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2">Flat</th>
                  <th className="p-2">Floor</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Residents</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((flat) => (
                  <tr key={flat.id} className="border-b last:border-0">
                    <td className="p-2 font-medium">{flat.number}</td>
                    <td className="p-2">{flat.floor === 0 ? 'G' : (flat.floor ?? '—')}</td>
                    <td className="p-2">{flat.type ?? '—'}</td>
                    <td className="p-2">
                      {flat.occupants.length ? (
                        flat.occupants.map((o) => o.user.name).join(', ')
                      ) : (
                        <span className="text-muted-foreground">Vacant</span>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setManaging(flat)}>
                        <Users /> Residents
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <GenerateFlatsDialog tower={tower} open={generating} onOpenChange={setGenerating} />
      <AddFlatDialog tower={tower} open={addingFlat} onOpenChange={setAddingFlat} />
      <OccupantsDialog flat={managing} onClose={() => setManaging(null)} />
    </Card>
  );
}

function AddTowerDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (towerId: string) => void;
}) {
  const { addTower } = useBuildingActions();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Tower['kind']>('tower');
  const [lifts, setLifts] = useState('0');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addTower.mutate(
      { name, kind, liftsCount: Number(lifts) || 0 },
      {
        onSuccess: (tower) => {
          onAdded(tower.id);
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
          <DialogTitle>Add a building</DialogTitle>
          <DialogDescription>Row houses and villas can use blocks or lanes instead of towers.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="tower-kind">Kind</Label>
              <NativeSelect id="tower-kind" value={kind} onChange={(e) => setKind(e.target.value as Tower['kind'])}>
                {Object.entries(KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tower-name">Name</Label>
              <Input
                id="tower-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="A"
                required
                maxLength={40}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="tower-lifts">Lifts</Label>
            <Input
              id="tower-lifts"
              type="number"
              min={0}
              max={50}
              value={lifts}
              onChange={(e) => setLifts(e.target.value)}
              className="w-24"
            />
          </div>
          <FormError message={addTower.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={addTower.isPending}>
              {addTower.isPending ? 'Adding…' : 'Add'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateFlatsDialog({
  tower,
  open,
  onOpenChange,
}: {
  tower: Tower;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { generateFlats } = useBuildingActions();
  const [form, setForm] = useState({
    fromFloor: '1',
    toFloor: '',
    perFloor: '4',
    prefix: tower.name,
    separator: '-',
    type: '',
  });
  const [preview, setPreview] = useState<{ created: string[]; skipped: string[] } | null>(null);
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, prefix: tower.name }));
      setPreview(null);
      setDone(null);
      generateFlats.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when the dialog opens
  }, [open, tower.id]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [key]: e.target.value });
    setPreview(null);
  };

  const payload = (dryRun: boolean) => ({
    towerId: tower.id,
    fromFloor: Number(form.fromFloor),
    toFloor: Number(form.toFloor),
    perFloor: Number(form.perFloor),
    prefix: form.prefix,
    separator: form.separator,
    ...(form.type ? { type: form.type } : {}),
    dryRun,
  });

  const runPreview = (e: React.FormEvent) => {
    e.preventDefault();
    generateFlats.mutate(payload(true), { onSuccess: setPreview });
  };

  const create = () =>
    generateFlats.mutate(payload(false), {
      onSuccess: (result) => {
        setDone(result.created.length);
        setPreview(null);
      },
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate flats for {tower.name}</DialogTitle>
          <DialogDescription>
            For example floors 1 to 14 with 4 flats each gives {tower.name}-101 to {tower.name}-1404. Floor 0 is the
            ground floor (G). Flats that already exist are left alone.
          </DialogDescription>
        </DialogHeader>

        {done !== null ? (
          <div className="grid gap-4">
            <p className="text-sm">
              Created <span className="font-medium">{done}</span> flats in {tower.name}.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={runPreview}>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="gen-from">First floor</Label>
                <Input
                  id="gen-from"
                  type="number"
                  min={0}
                  max={200}
                  value={form.fromFloor}
                  onChange={set('fromFloor')}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gen-to">Last floor</Label>
                <Input
                  id="gen-to"
                  type="number"
                  min={0}
                  max={200}
                  value={form.toFloor}
                  onChange={set('toFloor')}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gen-per">Flats per floor</Label>
                <Input
                  id="gen-per"
                  type="number"
                  min={1}
                  max={50}
                  value={form.perFloor}
                  onChange={set('perFloor')}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="gen-prefix">Prefix</Label>
                <Input id="gen-prefix" value={form.prefix} onChange={set('prefix')} maxLength={20} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gen-sep">Separator</Label>
                <Input id="gen-sep" value={form.separator} onChange={set('separator')} maxLength={3} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="gen-type">Type (optional)</Label>
                <NativeSelect id="gen-type" value={form.type} onChange={set('type')}>
                  <option value="">—</option>
                  {FLAT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>

            {preview && (
              <div className="rounded-md border bg-muted/50 p-3 text-sm">
                {preview.created.length ? (
                  <>
                    Will create <span className="font-medium">{preview.created.length}</span> flats:{' '}
                    {preview.created.slice(0, 3).join(', ')}
                    {preview.created.length > 4 ? ' … ' : preview.created.length === 4 ? ', ' : ''}
                    {preview.created.length > 3 ? preview.created[preview.created.length - 1] : ''}
                  </>
                ) : (
                  'Every flat in that range already exists.'
                )}
                {preview.skipped.length > 0 && (
                  <div className="text-muted-foreground">
                    {preview.skipped.length} already exist and will be skipped.
                  </div>
                )}
              </div>
            )}

            <FormError message={generateFlats.error?.message ?? null} />
            <DialogFooter>
              <Button type="submit" variant="outline" disabled={generateFlats.isPending}>
                Preview
              </Button>
              <Button
                type="button"
                onClick={create}
                disabled={!preview || preview.created.length === 0 || generateFlats.isPending}
              >
                {generateFlats.isPending ? 'Working…' : `Create ${preview?.created.length ?? ''} flats`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddFlatDialog({
  tower,
  open,
  onOpenChange,
}: {
  tower: Tower;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addFlat } = useBuildingActions();
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [type, setType] = useState('');
  const [parking, setParking] = useState('0');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    addFlat.mutate(
      {
        number,
        towerId: tower.id,
        floor: floor === '' ? null : Number(floor),
        type: type || null,
        parkingSlots: Number(parking) || 0,
      },
      {
        onSuccess: () => {
          setNumber('');
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a flat to {tower.name}</DialogTitle>
          <DialogDescription>For one-off units: a shop, an office, a penthouse.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="flat-number">Flat number</Label>
              <Input
                id="flat-number"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={`${tower.name}-1501`}
                required
                maxLength={30}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="flat-floor">Floor</Label>
              <Input
                id="flat-floor"
                type="number"
                min={0}
                max={200}
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="flat-type">Type</Label>
              <NativeSelect id="flat-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">—</option>
                {FLAT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="flat-parking">Parking slots</Label>
              <Input
                id="flat-parking"
                type="number"
                min={0}
                max={10}
                value={parking}
                onChange={(e) => setParking(e.target.value)}
              />
            </div>
          </div>
          <FormError message={addFlat.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={addFlat.isPending}>
              {addFlat.isPending ? 'Adding…' : 'Add flat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TYPE_LABEL: Record<Occupant['type'], string> = { owner: 'Owner', tenant: 'Tenant', family: 'Family member' };

function OccupantsDialog({ flat, onClose }: { flat: Flat | null; onClose: () => void }) {
  const occupants = useFlatOccupants(flat?.id);
  const actions = useBuildingActions();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<Occupant['type']>('owner');
  const [notice, setNotice] = useState<string | null>(null);
  const { invite } = useJoinActions();
  const [madeInvite, setMadeInvite] = useState<Invite | null>(null);

  useEffect(() => {
    setNotice(null);
    setMadeInvite(null);
    invite.reset();
    actions.addOccupant.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when a different flat opens
  }, [flat?.id]);

  const current = occupants.data?.filter((o) => o.status === 'active') ?? [];
  const past = occupants.data?.filter((o) => o.status === 'ended') ?? [];

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flat) return;
    actions.addOccupant.mutate(
      { flatId: flat.id, name, phone, type },
      {
        onSuccess: (o) => {
          setNotice(
            o.isNewAccount
              ? `${o.user.name} was added. They can sign in with a one-time code sent to ${o.user.phoneNumber}.`
              : `${o.user.name} already had an account and was added to ${flat.number}.`,
          );
          setName('');
          setPhone('');
        },
      },
    );
  };

  // The alternative to adding someone directly: a link they open and accept.
  const sendInvite = () => {
    if (!flat) return;
    setNotice(null);
    invite.mutate(
      { phone, name: name || undefined, role: 'resident', flatId: flat.id, occupantType: type },
      { onSuccess: setMadeInvite },
    );
  };

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

  return (
    <Dialog open={!!flat} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Residents of {flat?.number}</DialogTitle>
          <DialogDescription>
            Owners, tenants and family members. Moving someone out keeps the flat’s history.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {occupants.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : current.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody lives here yet.</p>
          ) : (
            current.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">{o.user.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {TYPE_LABEL[o.type]} · {o.user.phoneNumber} · since {date(o.moveInDate)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actions.moveOut.isPending}
                  onClick={() => confirm(`Move ${o.user.name} out of ${flat?.number}?`) && actions.moveOut.mutate(o.id)}
                >
                  Move out
                </Button>
              </div>
            ))
          )}
          {past.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Previous residents ({past.length})</summary>
              <ul className="mt-2 grid gap-1 text-muted-foreground">
                {past.map((o) => (
                  <li key={o.id}>
                    {o.user.name} ({TYPE_LABEL[o.type].toLowerCase()}), {date(o.moveInDate)} – {date(o.moveOutDate)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <form className="grid gap-3 border-t pt-4" onSubmit={add}>
          <div className="text-sm font-medium">Add a resident</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="occ-name">Name</Label>
              <Input id="occ-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="occ-phone">Mobile number</Label>
              <Input
                id="occ-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98200 12345"
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="occ-type">Lives here as</Label>
            <NativeSelect
              id="occ-type"
              value={type}
              onChange={(e) => setType(e.target.value as Occupant['type'])}
              className="sm:w-48"
            >
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <FormError
            message={
              actions.addOccupant.error?.message ?? actions.moveOut.error?.message ?? invite.error?.message ?? null
            }
          />
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {madeInvite && <InviteLinkBox invite={madeInvite} />}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={invite.isPending || !phone} onClick={sendInvite}>
              {invite.isPending ? 'Creating…' : 'Send invite link instead'}
            </Button>
            <Button type="submit" disabled={actions.addOccupant.isPending}>
              {actions.addOccupant.isPending ? 'Adding…' : 'Add resident'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
