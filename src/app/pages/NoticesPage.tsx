import { useState } from 'react';
import { BellRing, Megaphone, Pin, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { useFlats, useTowers } from '../buildingQueries';
import { useManagedNotices, useNoticeActions, useNoticeReads, type ManagedNotice } from '../noticeQueries';
import { FormError } from './AuthPages';

/**
 * The society office's notices: post to everyone, a tower or chosen flats;
 * schedule, pin and expire them; see who has read them and chase the rest.
 */

const STATE: Record<ManagedNotice['state'], { label: string; style: string }> = {
  live: { label: 'Live', style: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' },
  scheduled: { label: 'Scheduled', style: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300' },
  expired: { label: 'Expired', style: 'bg-muted text-muted-foreground' },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export function NoticesPage() {
  const notices = useManagedNotices();
  const towers = useTowers();
  const { remove, remind } = useNoticeActions();
  const [creating, setCreating] = useState(false);
  const [readsOf, setReadsOf] = useState<ManagedNotice | null>(null);
  const [reminded, setReminded] = useState<string | null>(null);
  const towerName = (id: string) => towers.data?.find((t) => t.id === id)?.name ?? '?';

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Notices</h1>
          <p className="text-sm text-muted-foreground">
            Water cuts, lift servicing, meetings. Residents are told when a notice goes out.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New notice
        </Button>
      </div>

      {reminded && <p className="text-sm text-emerald-700 dark:text-emerald-300">{reminded}</p>}
      <FormError message={remind.error?.message ?? remove.error?.message ?? null} />

      {notices.data && !notices.data.length && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No notices yet. Post your first one: residents get it on their phone and in the app.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {notices.data?.map((n) => {
          const total = n.results?.reduce((a, b) => a + b, 0) ?? 0;
          return (
            <Card key={n.id}>
              <CardContent className="grid gap-2 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="grid gap-0.5">
                    <div className="flex flex-wrap items-center gap-2 font-semibold">
                      {n.pinned && <Pin className="size-3.5" />}
                      {n.title}
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${STATE[n.state].style}`}>
                        {STATE[n.state].label}
                      </span>
                      {n.urgent && (
                        <span className="rounded bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                          Urgent
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {n.audience === 'all'
                        ? 'Everyone'
                        : n.audience === 'towers'
                          ? `Tower ${n.towerIds.map(towerName).join(', ')}`
                          : `${n.flatIds.length} flat${n.flatIds.length > 1 ? 's' : ''}`}
                      {' · '}
                      {n.state === 'scheduled' ? `goes out ${when(n.publishAt)}` : `out ${when(n.publishAt)}`}
                      {n.expiresAt && ` · until ${when(n.expiresAt)}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {n.state === 'live' && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setReadsOf(n)}>
                          <Users /> {n.readCount}/{n.audienceCount} read
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remind.isPending || n.readCount >= n.audienceCount}
                          onClick={() =>
                            remind.mutate(n.id, {
                              onSuccess: (r) =>
                                setReminded(`Reminder sent to ${r.sent} resident${r.sent === 1 ? '' : 's'}.`),
                            })
                          }
                        >
                          <BellRing /> Remind unread
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${n.title}`}
                      onClick={() => confirm(`Remove “${n.title}”?`) && remove.mutate(n.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{n.body}</p>
                {n.results && (
                  <div className="grid gap-1 text-xs">
                    {n.pollOptions.map((o, i) => (
                      <div key={i} className="flex justify-between gap-2 rounded bg-muted/50 px-2 py-1">
                        <span>{o}</span>
                        <span className="tabular-nums">
                          {n.results![i]} {total ? `· ${Math.round((n.results![i] / total) * 100)}%` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {creating && <NewNoticeDialog onClose={() => setCreating(false)} />}
      <ReadsDialog notice={readsOf} onClose={() => setReadsOf(null)} />
    </div>
  );
}

function ReadsDialog({ notice, onClose }: { notice: ManagedNotice | null; onClose: () => void }) {
  const reads = useNoticeReads(notice?.id ?? null);
  return (
    <Dialog open={!!notice} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who has read it</DialogTitle>
          <DialogDescription>
            {reads.data
              ? `${reads.data.read} of ${reads.data.total} residents have opened “${notice?.title}”.`
              : 'Loading…'}
          </DialogDescription>
        </DialogHeader>
        {reads.data && (
          <div className="grid max-h-80 gap-1 overflow-y-auto text-sm">
            {!reads.data.unread.length && <p className="text-muted-foreground">Everyone has read it.</p>}
            {reads.data.unread.map((p) => (
              <div key={p.id} className="flex justify-between rounded border px-2 py-1">
                <span>{p.name}</span>
                <span className="text-muted-foreground">{p.flats.join(', ')}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NewNoticeDialog({ onClose }: { onClose: () => void }) {
  const towers = useTowers();
  const flats = useFlats();
  const { create } = useNoticeActions();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<'all' | 'towers' | 'flats'>('all');
  const [towerIds, setTowerIds] = useState<string[]>([]);
  const [flatText, setFlatText] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [publishAt, setPublishAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [poll, setPoll] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    // Flats are typed as numbers ("A-101, B-402"), as managers think of them.
    const wanted = flatText
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((n) => n.toLowerCase());
    const flatIds = (flats.data ?? []).filter((f) => wanted.includes(f.number.toLowerCase())).map((f) => f.id);
    if (audience === 'flats') {
      const known = new Set((flats.data ?? []).map((f) => f.number.toLowerCase()));
      const unknown = wanted.filter((w) => !known.has(w));
      if (unknown.length) return setProblem(`No flat called ${unknown.join(', ')}`);
    }
    const pollOptions = poll
      .split('\n')
      .map((o) => o.trim())
      .filter(Boolean);
    create.mutate(
      {
        title,
        body,
        audience,
        towerIds: audience === 'towers' ? towerIds : [],
        flatIds: audience === 'flats' ? flatIds : [],
        urgent,
        pinned,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        pollOptions,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="size-4" /> New notice
          </DialogTitle>
          <DialogDescription>Residents it is for are told on their phone when it goes out.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="notice-title">Title</Label>
            <Input
              id="notice-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={150}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notice-body">Message</Label>
            <textarea
              id="notice-body"
              className="min-h-28 rounded-md border bg-background px-3 py-2 text-sm"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={5000}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notice-audience">Who is it for?</Label>
            <NativeSelect
              id="notice-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as typeof audience)}
            >
              <option value="all">Everyone</option>
              <option value="towers">Chosen towers</option>
              <option value="flats">Chosen flats</option>
            </NativeSelect>
            {audience === 'towers' && (
              <div className="flex flex-wrap gap-3 text-sm">
                {towers.data?.map((t) => (
                  <label key={t.id} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={towerIds.includes(t.id)}
                      onChange={(e) =>
                        setTowerIds((ids) => (e.target.checked ? [...ids, t.id] : ids.filter((id) => id !== t.id)))
                      }
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
            {audience === 'flats' && (
              <Input
                aria-label="Flat numbers"
                placeholder="Flat numbers, e.g. A-101, A-102, B-402"
                value={flatText}
                onChange={(e) => setFlatText(e.target.value)}
                required
              />
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin to top
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="notice-publish">Send at (optional)</Label>
              <Input
                id="notice-publish"
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notice-expires">Remove after (optional)</Label>
              <Input
                id="notice-expires"
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notice-poll">Poll choices (optional, one per line)</Label>
            <textarea
              id="notice-poll"
              className="min-h-16 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={'Cream\nGrey'}
              value={poll}
              onChange={(e) => setPoll(e.target.value)}
            />
          </div>
          <FormError message={problem ?? create.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Posting…' : publishAt ? 'Schedule' : 'Post now'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
