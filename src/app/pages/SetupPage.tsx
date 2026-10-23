import { useEffect, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  FileSpreadsheet,
  MessageCircle,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { useSociety, useUpdateSociety } from '../queries';
import { useTowers } from '../buildingQueries';
import { SocietyDetailsFields, emptySocietyDetails, societyDetailsPayload } from '../SocietyDetailsFields';
import { CommonAreasCard } from '../CommonAreasCard';
import { StaffInvitesCard } from '../JoinWidgets';
import { RegisterImportDialog } from '../RegisterImportDialog';
import {
  STEP_LABEL,
  useOnboarding,
  useOnboardingActions,
  type OnboardingState,
  type StepId,
} from '../onboardingQueries';
import { FormError } from './AuthPages';

/**
 * Setting up a new society, one step at a time. Each step can be done here,
 * skipped for now, or done later from its own page; the admin can leave and
 * come back to where they were.
 */
export function SetupPage() {
  const { user } = useAuth();
  const onboarding = useOnboarding();
  const actions = useOnboardingActions();
  const navigate = useNavigate();
  const [shown, setShown] = useState<StepId | null>(null);
  const isAdmin = user?.roles?.includes('society_admin');

  const state = onboarding.data;
  const steps = state?.steps ?? [];
  const active = shown ?? state?.current ?? 'details';
  const index = steps.findIndex((s) => s.id === active);

  const go = (step: StepId) => {
    setShown(step);
    if (isAdmin) actions.visit.mutate(step);
  };
  const next = () => {
    const after = steps.slice(index + 1).find((s) => !s.done) ?? steps[index + 1];
    if (after) go(after.id);
  };
  const finish = () => actions.finish.mutate(undefined, { onSuccess: () => navigate({ to: '/manager' }) });

  if (onboarding.isLoading || !state) return <p className="px-4 py-10 text-center text-muted-foreground">Loading…</p>;

  const allHandled = steps.every((s) => s.done || s.skipped);
  const current = steps[index];

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Set up your society</h1>
          <p className="text-sm text-muted-foreground">
            {state.completed} of {steps.length} done. Skip anything you want to do later; you can leave and come back.
          </p>
        </div>
        {isAdmin && allHandled && !state.finished ? (
          <Button disabled={actions.finish.isPending} onClick={finish}>
            <Check /> Finish setup
          </Button>
        ) : (
          // Leaving keeps the checklist on the dashboard until setup is finished.
          <Button variant="outline" onClick={() => navigate({ to: '/manager' })}>
            {state.finished ? 'Back to dashboard' : 'Do the rest later'}
          </Button>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(state.completed / Math.max(steps.length, 1)) * 100}%` }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Setup steps" className="grid content-start gap-1">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              aria-current={s.id === active ? 'step' : undefined}
              className={cn(
                'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                s.id === active ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-accent',
              )}
            >
              {s.done ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
              ) : s.skipped ? (
                <SkipForward className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="flex-1">
                {i + 1}. {STEP_LABEL[s.id]}
              </span>
              {s.skipped && <span className="text-xs text-muted-foreground">Skipped</span>}
            </button>
          ))}
        </nav>

        <div className="grid content-start gap-4">
          <StepBody step={active} state={state} />

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <Button variant="ghost" disabled={index <= 0} onClick={() => go(steps[index - 1].id)}>
              <ArrowLeft /> Back
            </Button>
            <div className="flex gap-2">
              {isAdmin && current && !current.done && (
                <Button
                  variant="outline"
                  disabled={actions.skip.isPending}
                  onClick={() =>
                    actions.skip.mutate(
                      { step: current.id, skipped: !current.skipped },
                      { onSuccess: () => !current.skipped && next() },
                    )
                  }
                >
                  <SkipForward /> {current.skipped ? 'Don’t skip' : 'Skip for now'}
                </Button>
              )}
              {index < steps.length - 1 ? (
                <Button onClick={next}>
                  Next <ArrowRight />
                </Button>
              ) : (
                isAdmin && (
                  <Button onClick={finish} disabled={actions.finish.isPending}>
                    <Check /> Finish setup
                  </Button>
                )
              )}
            </div>
          </div>
          <FormError message={actions.finish.error?.message ?? actions.skip.error?.message ?? null} />
        </div>
      </div>
    </div>
  );
}

function StepBody({ step, state }: { step: StepId; state: OnboardingState }) {
  switch (step) {
    case 'details':
      return <DetailsStep />;
    case 'buildings':
      return <BuildingsStep flats={state.counts.flats} />;
    case 'common_areas':
      return <CommonAreasCard />;
    case 'staff':
      return <StaffInvitesCard />;
    case 'vendors':
      return <VendorsStep vendors={state.counts.vendors} />;
    case 'residents':
      return <ResidentsStep state={state} />;
  }
}

function DetailsStep() {
  const society = useSociety();
  const update = useUpdateSociety();
  const { refresh } = useOnboardingActions();
  const [details, setDetails] = useState(emptySocietyDetails);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!society.data) return;
    const s = society.data;
    setDetails({
      name: s.name,
      registrationNumber: s.registrationNumber ?? '',
      address: s.address,
      city: s.city,
      pinCode: s.pinCode,
    });
  }, [society.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Society details</CardTitle>
        <CardDescription>Shown to residents and staff, and on reports.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            update.mutate(societyDetailsPayload(details), {
              onSuccess: () => {
                setSaved(true);
                refresh();
              },
            });
          }}
        >
          <SocietyDetailsFields value={details} onChange={setDetails} />
          <FormError message={update.error?.message ?? null} />
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
            {saved && <span className="text-sm text-muted-foreground">Saved</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function BuildingsStep({ flats }: { flats: number }) {
  const towers = useTowers();
  const { refresh } = useOnboardingActions();
  const [importing, setImporting] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Towers & flats</CardTitle>
        <CardDescription>
          Add each tower or wing and generate its flats from a pattern (A-101 to A-1404), or import the flat register
          you keep in Excel, residents included.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="text-sm">
          {towers.data?.length
            ? `${towers.data.length} tower${towers.data.length > 1 ? 's' : ''} (${towers.data.map((t) => t.name).join(', ')}) with ${flats} flats.`
            : 'No towers yet.'}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/manager/buildings">Add towers and flats</Link>
          </Button>
          <Button variant="outline" onClick={() => setImporting(true)}>
            <FileSpreadsheet /> Import from Excel
          </Button>
        </div>
      </CardContent>
      <RegisterImportDialog
        open={importing}
        onOpenChange={(open) => {
          setImporting(open);
          if (!open) refresh();
        }}
      />
    </Card>
  );
}

function VendorsStep({ vendors }: { vendors: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendors</CardTitle>
        <CardDescription>
          The plumbers, electricians and lift companies you call. Each gets a login on their phone to see and update
          their jobs, and complaints are sent to them automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="text-sm">
          {vendors ? `${vendors} vendor${vendors > 1 ? 's' : ''} added.` : 'No vendors yet.'}
        </div>
        <Button asChild className="justify-self-start">
          <Link to="/manager/vendors">Add vendors</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ResidentsStep({ state }: { state: OnboardingState }) {
  const society = useSociety();
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/join/${state.joinCode}`;
  const message =
    `${society.data?.name ?? 'Our society'} now uses SocietyOps for maintenance complaints. ` +
    `Join with your mobile number and choose your flat: ${link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is on screen to copy by hand.
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite residents</CardTitle>
        <CardDescription>
          {state.counts.residents
            ? `${state.counts.residents} resident${state.counts.residents > 1 ? 's' : ''} so far.`
            : 'Share the join link in your society’s WhatsApp group. Residents pick their flat and you approve them.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-sm">{link}</code>
          <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy join link">
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">
              <MessageCircle /> Share on WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link to="/manager/residents">Text residents already in the register</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
