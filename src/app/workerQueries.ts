import { useEffect, useState } from 'react';
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
  /** The resident sent it back as not fixed. */
  reopened: boolean;
  /** When it goes to another vendor unless accepted. */
  acceptBy: string | null;
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

export interface StepInput {
  id: string;
  action: WorkerAction;
  note?: string;
  images?: string[];
}

// --- Steps taken without a connection ---

const QUEUE_KEY = 'societyops_worker_queue';

function readQueue(): StepInput[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeQueue(queue: StepInput[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage blocked: the step is lost, which the screen says when it fails.
  }
  window.dispatchEvent(new Event('worker-queue'));
}

/** fetch() rejects with a TypeError when the request never reached the server. */
const neverArrived = (err: unknown) => err instanceof TypeError || !navigator.onLine;

const sendStep = ({ id, ...body }: StepInput) =>
  api<{ job: WorkerJob | null }>(`/api/worker/jobs/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

/**
 * Sends saved steps in the order they were taken, stopping at the first that
 * still cannot get through. A step the server refuses (the job moved on, say)
 * is dropped and reported.
 */
async function flushQueue(): Promise<{ id: string; message: string }[]> {
  const failures: { id: string; message: string }[] = [];
  let queue = readQueue();
  while (queue.length) {
    const [first, ...rest] = queue;
    try {
      await sendStep(first);
    } catch (err) {
      if (neverArrived(err)) break;
      failures.push({ id: first.id, message: (err as Error).message });
    }
    queue = rest;
    writeQueue(queue);
  }
  return failures;
}

/** Whether the phone is online, steps waiting to send, and any that failed. */
export function useStepQueue() {
  const client = useQueryClient();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [waiting, setWaiting] = useState(() => readQueue().length);
  const [failures, setFailures] = useState<{ id: string; message: string }[]>([]);

  useEffect(() => {
    let flushing = false;
    const flush = async () => {
      if (flushing || !navigator.onLine || !readQueue().length) return;
      flushing = true;
      try {
        const failed = await flushQueue();
        if (failed.length) setFailures((f) => [...f, ...failed]);
        await client.invalidateQueries({ queryKey: KEY });
      } finally {
        flushing = false;
      }
    };
    const onOnline = () => {
      setOnline(true);
      void flush();
    };
    const onOffline = () => setOnline(false);
    const onQueue = () => setWaiting(readQueue().length);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('worker-queue', onQueue);
    const timer = window.setInterval(() => void flush(), 30_000);
    void flush();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('worker-queue', onQueue);
      window.clearInterval(timer);
    };
  }, [client]);

  return { online, waiting, failures, dismiss: () => setFailures([]) };
}

export function useWorkerActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });

  // A step taken with no connection is saved and sent later rather than lost.
  const step = useMutation({
    mutationFn: async (input: StepInput): Promise<{ job: WorkerJob | null; queued?: boolean }> => {
      if (!navigator.onLine) {
        writeQueue([...readQueue(), input]);
        return { job: null, queued: true };
      }
      try {
        return await sendStep(input);
      } catch (err) {
        if (!neverArrived(err)) throw err;
        writeQueue([...readQueue(), input]);
        return { job: null, queued: true };
      }
    },
    // React Query would otherwise hold the step until the phone is back
    // online, silently; this runs it now, and the queue above takes over.
    networkMode: 'always',
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
