import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  CloudOff,
  Languages,
  MapPin,
  Navigation,
  Package,
  Phone,
  Play,
  ThumbsUp,
  Timer,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { uploadPhoto } from '@/lib/uploads';
import { useStepQueue, useWorkerActions, useWorkerJobs, type WorkerAction, type WorkerJob } from '../workerQueries';
import { useWorkerLang, type WorkerStrings } from '../workerI18n';
import { FormError } from './AuthPages';

/**
 * A vendor's screen, built for a phone in one hand: the jobs in the order
 * they will reach them, and one big button for the next step on each. In
 * English or Hindi, and usable with a patchy connection: steps taken offline
 * are saved and sent when it comes back.
 */

const URGENCY_STYLE: Record<WorkerJob['urgency'], string> = {
  High: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  Medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  Low: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

/** Steps that need the vendor to say something first. */
const NEEDS_NOTE: WorkerAction[] = ['need_parts', 'complete', 'decline'];

const ICONS: Record<WorkerAction, { icon: typeof Check; variant?: 'outline' | 'ghost' }> = {
  accept: { icon: ThumbsUp },
  on_my_way: { icon: Navigation },
  start: { icon: Play },
  need_parts: { icon: Package, variant: 'outline' },
  complete: { icon: Check },
  decline: { icon: X, variant: 'ghost' },
};

/** Minutes left until a time, refreshed every 30 seconds. */
function useMinutesLeft(until: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [until]);
  return until ? Math.ceil((new Date(until).getTime() - now) / 60000) : null;
}

export function WorkerPage() {
  const home = useWorkerJobs();
  const { duty } = useWorkerActions();
  const queue = useStepQueue();
  const { t, toggle } = useWorkerLang();
  const [openId, setOpenId] = useState<string | null>(null);

  const banner = (
    <>
      {!queue.online && (
        <div className="flex items-start gap-2 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <CloudOff className="mt-0.5 size-4 shrink-0" /> {t.offline}
        </div>
      )}
      {queue.waiting > 0 && (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t.queued(queue.waiting)}</p>
      )}
      {queue.failures.map((f, i) => (
        <div key={i} className="rounded-md border border-destructive/40 p-2 text-sm text-destructive">
          {t.queuedFailed(f.id, f.message)}
        </div>
      ))}
    </>
  );

  if (home.isLoading) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t.loading}</p>;
  if (!home.data) {
    return (
      <div className="mx-auto grid max-w-xl gap-3 px-4 py-10">
        {banner}
        <p className="text-center text-sm text-muted-foreground">{home.error?.message ?? t.loadFailed}</p>
      </div>
    );
  }

  const { vendor, jobs, done } = home.data;
  const shownId = openId ?? jobs[0]?.id ?? null;

  return (
    <div className="mx-auto grid max-w-xl gap-4 px-4 py-6">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={toggle} aria-label="Change language">
          <Languages /> {t.language}
        </Button>
      </div>
      {banner}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-lg">{vendor.name}</CardTitle>
            <CardDescription>
              {vendor.category} · {vendor.rating.toFixed(1)}★ · {vendor.completedJobs} {t.jobsDone}
            </CardDescription>
          </div>
          <Button
            variant={vendor.onDuty ? 'default' : 'outline'}
            size="sm"
            disabled={duty.isPending || !queue.online}
            onClick={() => duty.mutate(!vendor.onDuty)}
            aria-pressed={vendor.onDuty}
          >
            <span className={`h-2 w-2 rounded-full ${vendor.onDuty ? 'bg-emerald-400' : 'bg-slate-400'}`} />
            {vendor.onDuty ? t.onDuty : t.offDuty}
          </Button>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {!vendor.onDuty ? t.offDutyHint : jobs.length ? t.jobsToDo(jobs.length) : t.noJobs}
          {duty.data?.reassigned ? t.movedToYou(duty.data.reassigned) : ''}
        </CardContent>
      </Card>

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          t={t}
          open={job.id === shownId}
          onToggle={() => setOpenId(job.id === shownId ? '' : job.id)}
        />
      ))}

      {done.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{t.doneThisWeek}</h2>
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

function JobCard({
  job,
  t,
  open,
  onToggle,
}: {
  job: WorkerJob;
  t: WorkerStrings;
  open: boolean;
  onToggle: () => void;
}) {
  const isNext = job.queue?.position === 1;
  const left = useMinutesLeft(job.acceptBy);
  return (
    <Card className={isNext ? 'border-primary/50' : undefined}>
      <button type="button" className="w-full text-left" onClick={onToggle} aria-expanded={open}>
        <CardHeader className="gap-2">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide text-muted-foreground">
              {isNext ? t.next : t.inLine(job.queue?.position ?? '–')} · {job.id}
            </span>
            <span className="flex items-center gap-1.5">
              {job.reopened && (
                <span className="rounded bg-orange-600 px-1.5 py-0.5 font-semibold text-white">{t.reopened}</span>
              )}
              {job.escalated && (
                <span className="inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 font-semibold text-white">
                  <AlertTriangle className="h-3 w-3" /> {t.urgent}
                </span>
              )}
              <span className={`rounded px-1.5 py-0.5 font-semibold ${URGENCY_STYLE[job.urgency]}`}>
                {t.urgency[job.urgency]}
              </span>
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
          <CardTitle className="flex items-center gap-2 text-xl">
            <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
            {job.location}
          </CardTitle>
          <CardDescription className="flex flex-wrap gap-x-3">
            <span>{job.category}</span>
            {job.stage && <span className="font-medium text-foreground">{t.stage[job.stage]}</span>}
            {job.estimatedEta && job.stage === 'new' && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {t.expectedIn(job.estimatedEta)}
              </span>
            )}
          </CardDescription>
          {left !== null && (
            <div
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${left <= 5 ? 'text-destructive' : 'text-amber-700 dark:text-amber-300'}`}
            >
              <Timer className="size-4" /> {left > 0 ? t.acceptWithin(left) : t.acceptNow}
            </div>
          )}
        </CardHeader>
      </button>
      {open && <JobDetail job={job} t={t} />}
    </Card>
  );
}

function JobDetail({ job, t }: { job: WorkerJob; t: WorkerStrings }) {
  const { step } = useWorkerActions();
  const [pending, setPending] = useState<WorkerAction | null>(null);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<{ key: string; preview: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);

  const run = (action: WorkerAction, extra: { note?: string; images?: string[] } = {}) => {
    setError(null);
    setSavedOffline(false);
    step.mutate(
      { id: job.id, action, ...extra },
      {
        onSuccess: (result) => {
          setPending(null);
          setNote('');
          setPhotos([]);
          if (result.queued) setSavedOffline(true);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const addPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!navigator.onLine) {
      setError(t.photoNeedsConnection);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const key = await uploadPhoto(file);
      setPhotos((p) => [...p, { key, preview: URL.createObjectURL(file) }]);
    } catch (e) {
      setError(e instanceof TypeError ? t.photoNeedsConnection : (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const form = pending ? t.forms[pending] : undefined;
  const main = job.actions.filter((a) => a !== 'decline');

  return (
    <CardContent className="grid gap-4 border-t pt-4">
      <p className="text-sm leading-relaxed">{job.description}</p>

      {job.images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {job.images.map((src) => (
            <a key={src} href={src} target="_blank" rel="noreferrer">
              <img src={src} alt={t.photoFromResident} className="h-20 w-20 rounded-md border object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
        <span>
          {t.resident}: <span className="font-medium">{job.residentName}</span>
        </span>
        {job.residentPhone && (
          <Button asChild size="sm" variant="outline">
            <a href={`tel:${job.residentPhone}`}>
              <Phone /> {t.call}
            </a>
          </Button>
        )}
      </div>

      {savedOffline && <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t.savedOffline}</p>}

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
              <Label>{t.afterPhoto}</Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((p) => (
                  <img key={p.key} src={p.preview} alt="" className="h-16 w-16 rounded-md border object-cover" />
                ))}
                {photos.length < 4 && (
                  <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <Camera className="h-5 w-5" />
                    <span className="sr-only">{t.addPhoto}</span>
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
              {uploading && <span className="text-xs text-muted-foreground">{t.uploading}</span>}
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
              {step.isPending ? t.saving : form.submit}
            </Button>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              {t.back}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-2">
          <FormError message={error} />
          <div className="grid grid-cols-2 gap-2">
            {main.map((action, i) => {
              const { icon: Icon, variant } = ICONS[action];
              return (
                <Button
                  key={action}
                  size="lg"
                  variant={variant ?? (i === 0 ? 'default' : 'outline')}
                  className={i === 0 && main.length % 2 === 1 ? 'col-span-2' : undefined}
                  disabled={step.isPending}
                  onClick={() => (NEEDS_NOTE.includes(action) ? setPending(action) : run(action))}
                >
                  <Icon /> {t.buttons[action]}
                </Button>
              );
            })}
          </div>
          {job.actions.includes('decline') && (
            <Button variant="ghost" size="sm" className="justify-self-center" onClick={() => setPending('decline')}>
              {t.cantTake}
            </Button>
          )}
        </div>
      )}

      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t.history}</summary>
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
