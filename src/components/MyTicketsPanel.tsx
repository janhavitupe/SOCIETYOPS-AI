import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Clock, Wrench } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { keys } from '@/app/queries';
import type { Ticket } from '@/types';

/**
 * A resident's own tickets, open ones first, each showing where it has got
 * to. Opening one shows its full timeline. Residents used to see a ticket
 * only as a card in the chat that filed it.
 */

const STATUS_STYLE: Record<string, string> = {
  Open: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Vendor Assigned': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  'In Progress': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  Escalated: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  Resolved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  Closed: 'bg-muted text-muted-foreground',
};

const FINISHED = ['Resolved', 'Closed'];

const when = (iso: string | Date) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function MyTicketsPanel({ onOpen }: { onOpen: (ticket: Ticket) => void }) {
  const { user } = useAuth();
  const tickets = useQuery({
    queryKey: keys.tickets,
    queryFn: async () => (await api<{ tickets: Ticket[] }>('/api/tickets')).tickets,
    // Vendors move tickets along while the resident watches.
    refetchInterval: 30_000,
  });

  // Staff see the whole society's tickets; here they see only the ones they reported.
  const mine = (tickets.data ?? []).filter(
    (t: any) =>
      !user?.roles?.some((r: string) => ['society_admin', 'manager', 'committee'].includes(r)) ||
      t.residentId === user?.id ||
      t.alsoReportedBy?.includes(user?.id),
  );
  const ordered = [...mine].sort(
    (a, b) =>
      Number(FINISHED.includes(a.status)) - Number(FINISHED.includes(b.status)) ||
      new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime(),
  );

  return (
    <section className="flex max-h-[calc(100vh-7rem)] flex-col rounded-lg border bg-card text-card-foreground shadow-2xs">
      <div className="border-b px-4 py-3">
        <h2 className="text-xs font-bold uppercase tracking-wider">My tickets</h2>
        <p className="text-xs text-muted-foreground">Where each complaint has got to. Tap one for its full history.</p>
      </div>
      <div className="grid gap-2 overflow-y-auto p-3">
        {tickets.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
        {tickets.data && !ordered.length && (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No tickets yet. Describe a problem in the chat and it will appear here.
          </p>
        )}
        {ordered.map((t) => {
          const latest = t.timeline?.[t.timeline.length - 1];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpen(t)}
              className="grid gap-1 rounded-md border px-3 py-2 text-left text-xs transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold">#{t.id}</span>
                <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[t.status] ?? STATUS_STYLE.Open}`}>
                  {t.status}
                </span>
              </div>
              <div className="font-medium">
                {t.issueCategory} · {t.flatNumber}
              </div>
              {t.assignedVendorName && !FINISHED.includes(t.status) && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Wrench className="size-3" /> {t.assignedVendorName}
                  {t.estimatedEta && (
                    <>
                      <Clock className="ml-1 size-3" /> {t.estimatedEta}
                    </>
                  )}
                </div>
              )}
              {latest && (
                <div className="flex items-center justify-between gap-2 text-muted-foreground">
                  <span className="truncate">
                    {latest.title} · {when(latest.timestamp)}
                  </span>
                  <ChevronRight className="size-3.5 shrink-0" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
