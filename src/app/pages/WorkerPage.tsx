import { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Navigation,
  Package,
  Phone,
  Play,
  ThumbsUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { uploadPhoto } from '@/lib/uploads';
import { useWorkerActions, useWorkerJobs, type WorkerAction, type WorkerJob, type WorkerStage } from '../workerQueries';
import { FormError } from './AuthPages';

/**
 * A vendor's screen, built for a phone in one hand: the jobs in the order
 * they will reach them, and one big button for the next step on each.
 */

const STAGE_LABEL: Record<WorkerStage, string> = {
  new: 'New',
  accepted: 'Accepted',
  on_the_way: 'On the way',
  started: 'Working',
  waiting_parts: 'Waiting for parts',
};

const URGENCY_STYLE: Record<WorkerJob['urgency'], string> = {
  High: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  Low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

/** Steps that need the vendor to say something first. */
const NEEDS_NOTE: Partial<Record<WorkerAction, { label: string; placeholder: string; submit: string }>> = {
  need_parts: { label: 'Which parts do you need?', placeholder: 'e.g. Half-inch washer, PVC elbow', submit: 'Save' },
  complete: {
    label: 'What did you do?',
    placeholder: 'e.g. Replaced the washer, no more leak',
    submit: 'Mark completed',
  },
  decline: {
    label: 'Why can’t you take it?',
    placeholder: 'e.g. No parts for this geyser model',
    submit: 'Decline job',
  },
};

const BUTTONS: Record<WorkerAction, { label: string; icon: typeof Check; variant?: 'outline' | 'ghost' }> = {
  accept: { label: 'Accept', icon: ThumbsUp },
  on_my_way: { label: 'On my way', icon: Navigation },
  start: { label: 'Start work', icon: Play },
  need_parts: { label: 'Need parts', icon: Package, variant: 'outline' },
  complete: { label: 'Completed', icon: Check },
  decline: { label: 'Decline', icon: X, variant: 'ghost' },
};

export function WorkerPage() {
  const home = useWorkerJobs();
  const { duty } = useWorkerActions();
  const [openId, setOpenId] = useState<string | null>(null);

  if (home.isLoading) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading your jobs…</p>;
  if (!home.data) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        {home.error?.message ?? 'Your jobs could not be loaded.'}
      </p>
    );
  }

  const { vendor, jobs, done } = home.data;
  const shownId = openId ?? jobs[0]?.id ?? null;

  return (
    <div className="mx-auto grid max-w-xl gap-4 px-4 py-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">{vendor.name}</CardTitle>
            <CardDescription>
              {vendor.category} · {vendor.rating.toFixed(1)}★ · {vendor.completedJobs} jobs done
            </CardDescription>
          </div>
          <Button
            variant={vendor.onDuty ? 'default' : 'outline'}
            size="sm"
            disabled={duty.isPending}
            onClick={() => duty.mutate(!vendor.onDuty)}
            aria-pressed={vendor.onDuty}
          >
            <span className={`h-2 w-2 rounded-full ${vendor.onDuty ? 'bg-emerald-400' : 'bg-slate-400'}`} />
            {vendor.onDuty ? 'On duty' : 'Off duty'}
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {!vendor.onDuty
            ? 'You are off duty: new jobs go to other vendors first. Go on duty to get work.'
            : jobs.length
              ? `${jobs.length} job${jobs.length > 1 ? 's' : ''} to do, in this order.`
              : 'No jobs right now. New ones appear here as residents report them.'}
          {duty.data?.reassigned ? ` ${duty.data.reassigned} waiting job(s) moved to you.` : ''}
        </CardContent>
      </Card>

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          open={job.id === shownId}
          onToggle={() => setOpenId(job.id === shownId ? '' : job.id)}
        />
      ))}

      {done.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Done this week</h2>
          {done.map((job) => (
            <div key={job.id} className="rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground">
              <div className="flex justify-between gap-2 font-medium">
                <span>
                  {job.location} · {job.category}
                </span>
                <span className="text-xs text-muted-foreground">
                  {job.resolvedAt ? new Date(job.resolvedAt).toLocaleDateString() : ''}
                </span>
              </div>
              {job.workNote && <div className="text-muted-foreground">{job.workNote}</div>}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

function JobCard({ job, open, onToggle }: { job: WorkerJob; open: boolean; onToggle: () => void }) {
  const isNext = job.queue?.position === 1;
  return (
    <Card className={isNext ? 'border-primary/50' : undefined}>
      <button type="button" className="w-full text-left" onClick={onToggle} aria-expanded={open}>
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              {isNext ? 'Next' : `#${job.queue?.position ?? '–'} in line`} · {job.id}
            </span>
            <span className="flex items-center gap-1.5">
              {job.reopened && (
                <span className="rounded bg-orange-600 px-1.5 py-0.5 font-semibold text-white">Reopened</span>
              )}
              {job.escalated && (
                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white">
                  <AlertTriangle className="h-3 w-3" /> Urgent
                </span>
              )}
              <span className={`rounded px-1.5 py-0.5 font-semibold ${URGENCY_STYLE[job.urgency]}`}>{job.urgency}</span>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
            {job.location}
          </CardTitle>
          <CardDescription className="flex flex-wrap gap-x-3">
            <span>{job.category}</span>
            {job.stage && <span className="font-medium text-foreground">{STAGE_LABEL[job.stage]}</span>}
            {job.estimatedEta && job.stage === 'new' && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> expected in {job.estimatedEta}
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </button>
      {open && <JobDetail job={job} />}
    </Card>
  );
}

function JobDetail({ job }: { job: WorkerJob }) {
  const { step } = useWorkerActions();
  const [pending, setPending] = useState<WorkerAction | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<{ key: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (action: WorkerAction, extra: { note?: string; images?: string[] } = {}) => {
    setError(null);
    step.mutate(
      { id: job.id, action, ...extra },
      {
        onSuccess: () => {
          setPending(null);
          setNote('');
          setPhotos([]);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const key = await uploadPhoto(file);
      setPhotos((p) => [...p, { key, preview: URL.createObjectURL(file) }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const form = pending ? NEEDS_NOTE[pending] : undefined;
  const main = job.actions.filter((a) => a !== 'decline');

  return (
    <CardContent className="grid gap-4 border-t pt-4">
      <p className="text-sm leading-relaxed">{job.description}</p>

      {job.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {job.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt="Photo from the resident" className="h-20 w-20 rounded-md border object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
        <span>
          Resident: <span className="font-medium">{job.residentName}</span>
        </span>
        {job.residentPhone && (
          <Button asChild size="sm" variant="outline">
            <a href={`tel:${job.residentPhone}`}>
              <Phone /> Call
            </a>
          </Button>
        )}
      </div>

      {form ? (
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(pending!, { note, images: pending === 'complete' ? photos.map((p) => p.key) : [] });
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor={`note-${job.id}`}>{form.label}</Label>
            <textarea
              id={`note-${job.id}`}
              className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder={form.placeholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              required
              autoFocus
            />
          </div>
          {pending === 'complete' && (
            <div className="grid gap-2">
              <Label>Photo of the finished work</Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <img key={p.key} src={p.preview} alt="" className="h-16 w-16 rounded-md border object-cover" />
                ))}
                {photos.length < 4 && (
                  <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <Camera className="h-5 w-5" />
                    <span className="sr-only">Add photo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => addPhoto(e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
              {uploading && <span className="text-xs text-muted-foreground">Uploading…</span>}
            </div>
          )}
          <FormError message={error} />
          <div className="flex gap-2">
            <Button
              type="submit"
              className="flex-1"
              variant={pending === 'decline' ? 'destructive' : 'default'}
              disabled={step.isPending || uploading || (pending === 'complete' && !photos.length)}
            >
              {step.isPending ? 'Saving…' : form.submit}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-2">
            {main.map((action, i) => {
              const { label, icon: Icon, variant } = BUTTONS[action];
              return (
                <Button
                  key={action}
                  size="lg"
                  variant={variant ?? (i === 0 ? 'default' : 'outline')}
                  className={i === 0 && main.length % 2 === 1 ? 'col-span-2' : undefined}
                  disabled={step.isPending}
                  onClick={() => (NEEDS_NOTE[action] ? setPending(action) : run(action))}
                >
                  <Icon /> {label}
                </Button>
              );
            })}
          </div>
          {job.actions.includes('decline') && (
            <Button variant="ghost" size="sm" className="justify-self-center" onClick={() => setPending('decline')}>
              Can’t take this job
            </Button>
          )}
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">History</summary>
        <ol className="mt-2 grid gap-1.5">
          {job.timeline.map((e, i) => (
            <li key={i}>
              <span className="font-medium text-foreground">{e.title}</span> ·{' '}
              {new Date(e.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              <div>{e.description}</div>
            </li>
          ))}
        </ol>
      </details>
    </CardContent>
  );
}
