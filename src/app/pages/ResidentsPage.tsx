import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircle, Search, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { useTowers } from '../buildingQueries';
import { useSocietyProfile } from '../queries';
import { FormError } from './AuthPages';

/**
 * Every resident in the society: where they live, whether they are on the
 * app, and a way to ask the ones who are not.
 */

type Status = 'on_app' | 'not_joined' | 'moved_out';
type StatusFilter = Status | 'current' | 'all';

interface Resident {
  occupantId: string;
  userId: string;
  name: string;
  phone: string | null;
  flat: { id: string; number: string };
  tower: { id: string; name: string } | null;
  type: 'owner' | 'tenant' | 'family';
  status: Status;
  moveInDate: string | null;
  moveOutDate: string | null;
  lastInvitedAt: string | null;
  lastActiveAt: string | null;
}

interface Directory {
  counts: Record<Status, number>;
  residents: Resident[];
}

interface InviteResult {
  sent: { userId: string; name: string }[];
  skipped: { userId: string; name: string; reason: string }[];
}

const STATUS: Record<Status, { label: string; style: string }> = {
  on_app: { label: 'On the app', style: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  not_joined: {
    label: 'Not on the app yet',
    style: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  moved_out: { label: 'Moved out', style: 'bg-muted text-muted-foreground' },
};

const TYPE: Record<Resident['type'], string> = { owner: 'Owner', tenant: 'Tenant', family: 'Family' };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '–');

/** A WhatsApp chat with the message ready, for sending one invite by hand from the manager's phone. */
function whatsAppLink(r: Resident, societyName: string) {
  const first = r.name.trim().split(/\s+/)[0];
  const text =
    `Namaste ${first}! ${societyName} now uses SocietyOps for maintenance complaints for flat ${r.flat.number}. ` +
    `Sign in with this mobile number, no password needed: ${window.location.origin}/login`;
  return `https://wa.me/${(r.phone ?? '').replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`;
}

export function ResidentsPage() {
  const towers = useTowers();
  const profile = useSocietyProfile();
  const client = useQueryClient();
  const [towerId, setTowerId] = useState('');
  const [status, setStatus] = useState<StatusFilter>('current');
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<InviteResult | null>(null);

  const params = new URLSearchParams({ status, ...(towerId ? { towerId } : {}), ...(query ? { query } : {}) });
  const directory = useQuery({
    queryKey: ['residents', status, towerId, query],
    queryFn: () => api<Directory>(`/api/residents?${params}`),
    placeholderData: keepPreviousData,
  });

  const invite = useMutation({
    mutationFn: (userIds: string[]) =>
      api<InviteResult>('/api/residents/invite', { method: 'POST', body: JSON.stringify({ userIds }) }),
    onSuccess: (r) => {
      setResult(r);
      setChosen(new Set());
      client.invalidateQueries({ queryKey: ['residents'] });
    },
  });

  const rows = directory.data?.residents ?? [];
  const counts = directory.data?.counts;
  const invitable = useMemo(() => rows.filter((r) => r.status === 'not_joined'), [rows]);
  const allChosen = invitable.length > 0 && invitable.every((r) => chosen.has(r.userId));

  const toggle = (userId: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Residents</h1>
          <p className="text-sm text-muted-foreground">
            {counts
              ? `${counts.on_app} on the app · ${counts.not_joined} not on it yet · ${counts.moved_out} moved out`
              : 'Everyone living in the society’s flats.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!invitable.length || invite.isPending}
            onClick={() =>
              confirm(`Text ${invitable.length} resident${invitable.length > 1 ? 's' : ''} a link to sign in?`) &&
              invite.mutate(invitable.map((r) => r.userId))
            }
          >
            <Send /> Invite everyone not on the app ({invitable.length})
          </Button>
          <Button disabled={!chosen.size || invite.isPending} onClick={() => invite.mutate([...chosen])}>
            <Send /> {invite.isPending ? 'Sending…' : `Invite selected (${chosen.size})`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search name, flat or mobile"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search residents"
          />
        </div>
        <NativeSelect value={towerId} onChange={(e) => setTowerId(e.target.value)} aria-label="Tower" className="w-40">
          <option value="">All towers</option>
          {towers.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          aria-label="Status"
          className="w-48"
        >
          <option value="current">Living here now</option>
          <option value="not_joined">Not on the app yet</option>
          <option value="on_app">On the app</option>
          <option value="moved_out">Moved out</option>
          <option value="all">Everyone</option>
        </NativeSelect>
      </div>

      <FormError message={invite.error?.message ?? directory.error?.message ?? null} />
      {result && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm">
          <div className="font-medium">
            Sent {result.sent.length} invite{result.sent.length === 1 ? '' : 's'}.
          </div>
          {result.skipped.length > 0 && (
            <div className="text-muted-foreground">
              Skipped: {result.skipped.map((s) => `${s.name} (${s.reason.toLowerCase()})`).join(', ')}.
            </div>
          )}
        </div>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Choose everyone not on the app"
                    checked={allChosen}
                    disabled={!invitable.length}
                    onChange={() => setChosen(allChosen ? new Set() : new Set(invitable.map((r) => r.userId)))}
                  />
                </th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Flat</th>
                <th className="px-3 py-2">Lives as</th>
                <th className="px-3 py-2">Mobile</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Since</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {directory.isLoading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {directory.data && !rows.length && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    Nobody matches. Add residents to flats on the Buildings page, or import your register.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.occupantId} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    {r.status === 'not_joined' && (
                      <input
                        type="checkbox"
                        aria-label={`Choose ${r.name}`}
                        checked={chosen.has(r.userId)}
                        onChange={() => toggle(r.userId)}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">{r.flat.number}</td>
                  <td className="px-3 py-2">{TYPE[r.type]}</td>
                  <td className="px-3 py-2 tabular-nums">{r.phone}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS[r.status].style}`}>
                      {STATUS[r.status].label}
                    </span>
                    {r.status === 'not_joined' && r.lastInvitedAt && (
                      <div className="text-xs text-muted-foreground">Invited {date(r.lastInvitedAt)}</div>
                    )}
                    {r.status === 'on_app' && r.lastActiveAt && (
                      <div className="text-xs text-muted-foreground">Last seen {date(r.lastActiveAt)}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.status === 'moved_out' ? `Left ${date(r.moveOutDate)}` : date(r.moveInDate)}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === 'not_joined' && r.phone && (
                      <Button asChild size="sm" variant="ghost">
                        <a
                          href={whatsAppLink(r, profile.data?.societyName ?? 'Your society')}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`Invite ${r.name} on WhatsApp`}
                        >
                          <MessageCircle />
                        </a>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
