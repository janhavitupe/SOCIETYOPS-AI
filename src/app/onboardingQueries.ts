import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** The new-society setup wizard (routes/onboarding). */

export type StepId = 'details' | 'buildings' | 'common_areas' | 'staff' | 'vendors' | 'residents';

export interface OnboardingState {
  finished: boolean;
  current: StepId | null;
  steps: { id: StepId; done: boolean; skipped: boolean }[];
  completed: number;
  counts: {
    flats: number;
    commonAreas: number;
    staff: number;
    staffInvites: number;
    vendors: number;
    residents: number;
    residentInvites: number;
  };
  joinCode: string;
}

export const STEP_LABEL: Record<StepId, string> = {
  details: 'Society details',
  buildings: 'Towers & flats',
  common_areas: 'Common areas & lifts',
  staff: 'Managers & committee',
  vendors: 'Vendors',
  residents: 'Invite residents',
};

const KEY = ['onboarding'] as const;

export const useOnboarding = (enabled = true) =>
  useQuery({
    queryKey: KEY,
    queryFn: () => api<OnboardingState>('/api/onboarding'),
    enabled,
    // Steps complete as things are added on other pages; check again on return.
    refetchOnWindowFocus: true,
  });

export function useOnboardingActions() {
  const client = useQueryClient();
  const post = (path: string, body?: unknown) =>
    api<OnboardingState>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
  const options = { onSuccess: (state: OnboardingState) => client.setQueryData(KEY, state) };
  return {
    visit: useMutation({ mutationFn: (step: StepId) => post(`/api/onboarding/steps/${step}/visit`), ...options }),
    skip: useMutation({
      mutationFn: ({ step, skipped }: { step: StepId; skipped: boolean }) =>
        post(`/api/onboarding/steps/${step}/skip`, { skipped }),
      ...options,
    }),
    finish: useMutation({ mutationFn: () => post('/api/onboarding/finish'), ...options }),
    refresh: () => client.invalidateQueries({ queryKey: KEY }),
  };
}
