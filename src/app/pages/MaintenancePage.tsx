import { useState } from 'react';
import { CalendarClock, FileBadge, Pause, Play, Plus, Trash2, Wrench, Zap } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useShell } from '../AppShell';
import { usePlaces } from '../placeQueries';
import { useVendors } from '../queries';
import {
  useLicences,
  useMaintenanceActions,
  useSchedules,
  useUpcoming,
  type Unit,
  type UpcomingItem,
} from '../maintenanceQueries';
import { FormError } from './AuthPages';

/**
 * Preventive maintenance for managers: what is coming up, the schedules that
 * raise visits, and the licences and contracts that must be renewed.
 */

const CATEGORIES = [
  'Lift & Elevator',
  'Plumbing',
  'Electrical',
  'Cleaning & Pest',
  'Security & Intercom',
  'AC & Appliances',
  'Carpentry & Locks',
  'General Repairs',
];

const KIND: Record<UpcomingItem['kind'], { label: string; style: string }> = {
  visit: { label: 'Visit', style: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' },
  licence: { label: 'Licence', style: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' },
  amc: { label: 'AMC', style: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300' },
};

const day = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const every = (n: number, unit: Unit) => (n === 1 ? `Every ${unit.slice(0, -1)}` : `Every ${n} ${unit}`);
const toDateInput = (iso: string) => iso.slice(0, 10);

type Tab = 'calendar' | 'schedules' | 'licences';

export function MaintenancePage() {
  const [tab, setTab] = useState<Tab>('calendar');
  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1>
        <p className="text-sm text-muted-foreground">
          Planned visits are raised as tickets a few days before they are due and sent to the AMC vendor. Licences and
          contracts remind you 30 and 7 days before they run out.
        </p>
      </div>
      <div className="flex gap-1 rounded-md border bg-muted/50 p-1 text-sm" role="tablist">
        {(
          [
            ['calendar', 'Calendar', CalendarClock],
            ['schedules', 'Schedules', Wrench],
            ['licences', 'Licences', FileBadge],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 font-medium',
              tab === id ? 'bg-background shadow-xs' : 'text-muted-foreground',
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'schedules' && <SchedulesTab />}
      {tab === 'licences' && <LicencesTab />}
    </div>
  );
}

function CalendarTab() {
  const [days, setDays] = useState(90);
  const upcoming = useUpcoming(days);
  const { openTicket } = useShell();
  const items = upcoming.data ?? [];

  // Grouped by month, as people plan.
  const months = new Map<string, UpcomingItem[]>();
  for (const item of items) {
    const key = new Date(item.date).toLocaleDateString([], { month: 'long', year: 'numeric' });
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  const overdue = items.filter((i) => i.overdue).length;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className={overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}>
          {overdue ? `${overdue} overdue` : 'Nothing overdue.'}
        </span>
        <NativeSelect
          value={String(days)}
          onChange={(e) => setDays(Number(e.target.value))}
          aria-label="How far ahead"
          className="w-40"
        >
          <option value="30">Next 30 days</option>
          <option value="90">Next 3 months</option>
          <option value="180">Next 6 months</option>
          <option value="365">Next year</option>
        </NativeSelect>
      </div>
      {upcoming.data && !items.length && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing planned. Add schedules for lift servicing, tank cleaning and pest control, and licences such as the
            lift licence and fire NOC.
          </CardContent>
        </Card>
      )}
      {[...months.entries()].map(([month, list]) => (
        <section key={month} className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{month}</h2>
          {list.map((item, i) => (
            <button
              key={`${item.title}-${item.date}-${i}`}
              type="button"
              disabled={!item.ticketId}
              onClick={() => item.ticketId && openTicket({ id: item.ticketId })}
              className={cn(
                'flex items-center gap-3 rounded-md border bg-card px-3 py-2 text-left text-sm text-card-foreground',
                item.overdue && 'border-destructive/60 bg-destructive/5',
                item.ticketId && 'hover:bg-accent',
              )}
            >
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{day(item.date)}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${KIND[item.kind].style}`}>
                {KIND[item.kind].label}
              </span>
              <span className="flex-1">
                <span className="font-medium">{item.title}</span>
                {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
              </span>
              {item.overdue && <span className="text-xs font-semibold text-destructive">Overdue</span>}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function SchedulesTab() {
  const schedules = useSchedules();
  const { updateSchedule, removeSchedule, raise } = useMaintenanceActions();
  const [adding, setAdding] = useState(false);
  const [raised, setRaised] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Schedules</CardTitle>
          <CardDescription>Each one raises a ticket before its visit is due, with its checklist.</CardDescription>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus /> Add schedule
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2">
        {raised && <p className="text-sm text-emerald-700 dark:text-emerald-300">{raised}</p>}
        <FormError message={raise.error?.message ?? updateSchedule.error?.message ?? null} />
        {schedules.data && !schedules.data.length && (
          <p className="py-6 text-center text-sm text-muted-foreground">No schedules yet.</p>
        )}
        {schedules.data?.map((s) => (
          <div key={s.id} className={cn('grid gap-1 rounded-md border px-3 py-2 text-sm', !s.active && 'opacity-60')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground">
                  {every(s.every, s.unit)} · next {day(s.nextDueOn)} ·{' '}
                  {s.asset?.name ?? s.commonArea?.name ?? 'Society'}
                  {' · '}
                  {s.vendor?.name ?? 'AMC vendor or next free'}
                  {s.checklist.length > 0 && ` · ${s.checklist.length} checks`}
                  {!s.active && ' · paused'}
                </div>
              </div>
              <div className="flex">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={raise.isPending || !s.active}
                  onClick={() => raise.mutate(s.id, { onSuccess: (t) => setRaised(`Raised ticket #${t.id}.`) })}
                >
                  <Zap /> Raise now
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={s.active ? `Pause ${s.title}` : `Resume ${s.title}`}
                  onClick={() => updateSchedule.mutate({ id: s.id, active: !s.active })}
                >
                  {s.active ? <Pause /> : <Play />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${s.title}`}
                  onClick={() => confirm(`Remove the schedule “${s.title}”?`) && removeSchedule.mutate(s.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
      {adding && <ScheduleDialog onClose={() => setAdding(false)} />}
    </Card>
  );
}

function ScheduleDialog({ onClose }: { onClose: () => void }) {
  const places = usePlaces();
  const vendors = useVendors();
  const { addSchedule } = useMaintenanceActions();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [where, setWhere] = useState(''); // "asset:<id>" or "area:<id>"
  const [vendorId, setVendorId] = useState('');
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState<Unit>('months');
  const [nextDueOn, setNextDueOn] = useState(toDateInput(new Date(Date.now() + 7 * 86400000).toISOString()));
  const [leadDays, setLeadDays] = useState('3');
  const [checklist, setChecklist] = useState('');

  const areas = places.data?.commonAreas ?? [];
  const assets = [...areas.flatMap((a) => a.assets), ...(places.data?.looseAssets ?? [])];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const [kind, id] = where.split(':');
    addSchedule.mutate(
      {
        title,
        category,
        assetId: kind === 'asset' ? id : null,
        commonAreaId: kind === 'area' ? id : null,
        vendorId: vendorId || null,
        every: Number(count) || 1,
        unit,
        nextDueOn: new Date(`${nextDueOn}T09:00:00`).toISOString(),
        leadDays: Number(leadDays) || 0,
        checklist: checklist
          .split('\n')
          .map((c) => c.trim())
          .filter(Boolean),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a schedule</DialogTitle>
          <DialogDescription>For example: Lift A1 service every month, tank cleaning every 6 months.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="sch-title">Name</Label>
            <Input id="sch-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={150} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sch-where">Asset or area</Label>
              <NativeSelect id="sch-where" value={where} onChange={(e) => setWhere(e.target.value)}>
                <option value="">Whole society</option>
                <optgroup label="Assets">
                  {assets.map((a) => (
                    <option key={a.id} value={`asset:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Areas">
                  {areas.map((a) => (
                    <option key={a.id} value={`area:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sch-category">Trade</Label>
              <NativeSelect id="sch-category" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sch-vendor">Vendor</Label>
            <NativeSelect id="sch-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">The asset’s AMC vendor, or whoever is free</option>
              {vendors.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.category})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-[5rem_1fr_1fr] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="sch-every">Every</Label>
              <Input
                id="sch-every"
                type="number"
                min={1}
                max={365}
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sch-unit">&nbsp;</Label>
              <NativeSelect id="sch-unit" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
                <option value="months">months</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sch-next">Next visit</Label>
              <Input
                id="sch-next"
                type="date"
                value={nextDueOn}
                onChange={(e) => setNextDueOn(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sch-lead">Raise the ticket this many days before</Label>
            <Input
              id="sch-lead"
              type="number"
              min={0}
              max={60}
              className="w-24"
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sch-checklist">Checklist (one check per line)</Label>
            <textarea
              id="sch-checklist"
              className="min-h-24 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={'Brakes\nDoor sensors\nAlarm bell\nEmergency light'}
              value={checklist}
              onChange={(e) => setChecklist(e.target.value)}
            />
          </div>
          <FormError message={addSchedule.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={addSchedule.isPending}>
              {addSchedule.isPending ? 'Saving…' : 'Add schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LicencesTab() {
  const licences = useLicences();
  const { addLicence, renewLicence, removeLicence } = useMaintenanceActions();
  const [name, setName] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [notes, setNotes] = useState('');
  const now = Date.now();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Licences & certificates</CardTitle>
        <CardDescription>
          Lift licence, fire NOC, pollution certificate. AMC end dates are set on each asset under Buildings.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_10rem_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            addLicence.mutate(
              { name, expiresOn: new Date(`${expiresOn}T00:00:00`).toISOString(), notes: notes || null, assetId: null },
              {
                onSuccess: () => {
                  setName('');
                  setExpiresOn('');
                  setNotes('');
                },
              },
            );
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="lic-name">Name</Label>
            <Input id="lic-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lic-expires">Expires on</Label>
            <Input
              id="lic-expires"
              type="date"
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lic-notes">Notes</Label>
            <Input id="lic-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
          <Button type="submit" disabled={addLicence.isPending}>
            <Plus /> Add
          </Button>
        </form>
        <FormError message={addLicence.error?.message ?? renewLicence.error?.message ?? null} />
        {licences.data?.map((l) => {
          const left = Math.ceil((new Date(l.expiresOn).getTime() - now) / 86400000);
          return (
            <div
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{l.name}</div>
                <div
                  className={cn(
                    'text-xs',
                    left < 0
                      ? 'text-destructive'
                      : left <= 30
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-muted-foreground',
                  )}
                >
                  {left < 0 ? `Expired ${day(l.expiresOn)}` : `Expires ${day(l.expiresOn)} (${left} days)`}
                  {l.notes && <span className="text-muted-foreground"> · {l.notes}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  aria-label={`Renew ${l.name} until`}
                  className="h-8 w-40"
                  onChange={(e) =>
                    e.target.value &&
                    renewLicence.mutate({ id: l.id, expiresOn: new Date(`${e.target.value}T00:00:00`).toISOString() })
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${l.name}`}
                  onClick={() => confirm(`Remove ${l.name}?`) && removeLicence.mutate(l.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
