import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** A vendor's own jobs, as /api/worker serves them. */

export type WorkerStage = 'new' | 'accepted' | 'on_the_way' | 'started' | 'waiting_parts';
export type WorkerAction = 'accept' | 'on_my_way' | 'start' | 'need_parts' | 'complete' | 'decline';

export interface WorkerJob {
  id: string;
  status: string;
  stage: WorkerStage | null;
  actions: WorkerAction[];
  category: string;
  description: string;
  urgency: 'High' | 'Medium' | 'Low';
  location: string;
  residentName: string;
  residentPhone: string | null;
  estimatedEta: string | null;
  escalated: boolean;
  images: string[];
  workNote: string | null;
  workImages: string[];
  queue: { position: number; total: number } | null;
  createdAt: string;
  resolvedAt: string | null;
  timeline: { title: string; description: string; timestamp: string }[];
}

export interface WorkerHome {
  vendor: {
    id: string;
    name: string;
    category: string;
    status: 'Available' | 'Busy' | 'Offline';
    onDuty: boolean;
    rating: number;
    completedJobs: number;
  };
  jobs: WorkerJob[];
  done: WorkerJob[];
}

const KEY = ['worker', 'jobs'] as const;

export const useWorkerJobs = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => api<WorkerHome>('/api/worker/jobs'),
    // New jobs arrive from residents and the dispatcher, not from this screen.
    refetchInterval: 30_000,
  });

export function useWorkerActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });

  const step = useMutation({
    mutationFn: ({ id, ...body }: { id: string; action: WorkerAction; note?: string; images?: string[] }) =>
      api<{ job: WorkerJob | null }>(`/api/worker/jobs/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: refresh,
  });

  const duty = useMutation({
    mutationFn: (onDuty: boolean) =>
      api<{ onDuty: boolean; reassigned: number }>('/api/worker/duty', {
        method: 'PUT',
        body: JSON.stringify({ onDuty }),
      }),
    onSettled: refresh,
  });

  return { step, duty };
}
