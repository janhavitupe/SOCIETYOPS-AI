import { Link } from '@tanstack/react-router';
import { ArrowRight, CheckCircle2, Circle, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { STEP_LABEL, useOnboarding } from './onboardingQueries';

/** On the dashboard until setup is finished: what is done and what is left. */
export function SetupChecklist() {
  const onboarding = useOnboarding();
  const state = onboarding.data;
  if (!state || state.finished) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 lg:px-8">
      <div className="grid gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm text-foreground">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-semibold">Finish setting up your society</div>
            <div className="text-muted-foreground">
              {state.completed} of {state.steps.length} steps done.
            </div>
          </div>
          <Button asChild size="sm">
            <Link to="/manager/setup">
              Continue setup <ArrowRight />
            </Link>
          </Button>
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {state.steps.map((s) => (
            <li key={s.id} className="flex items-center gap-1.5">
              {s.done ? (
                <CheckCircle2 className="size-3.5 text-emerald-600" />
              ) : s.skipped ? (
                <SkipForward className="size-3.5 text-muted-foreground" />
              ) : (
                <Circle className="size-3.5 text-muted-foreground" />
              )}
              <span className={s.done ? 'text-muted-foreground line-through' : ''}>{STEP_LABEL[s.id]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
