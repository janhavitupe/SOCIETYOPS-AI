import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, UserMinus, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * For flat owners: who lives in their flat, and family members waiting for
 * them to say yes. Shows nothing for anyone who owns no flat.
 */

interface Household {
  flats: {
    id: string;
    number: string;
    members: { occupantId: string; name: string; phone: string | null; type: string; isMe: boolean }[];
    requests: { occupantId: string; name: string; phone: string | null; requestedAt: string }[];
  }[];
}

const KEY = ['my-flat'] as const;
const TYPE: Record<string, string> = { owner: 'Owner', tenant: 'Tenant', family: 'Family' };

export function HouseholdPanel() {
  const client = useQueryClient();
  const household = useQuery({
    queryKey: KEY,
    queryFn: () => api<Household>('/api/my-flat'),
    refetchInterval: 60_000,
  });

  const act = useMutation({
    mutationFn: ({ path }: { path: string }) => api(path, { method: 'POST', body: '{}' }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });

  const flats = household.data?.flats ?? [];
  if (!flats.length) return null;

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-3 text-card-foreground shadow-2xs">
      {flats.map((flat) => (
        <div key={flat.id} className="grid gap-2 text-xs">
          <h2 className="font-bold uppercase tracking-wider">My flat · {flat.number}</h2>

          {flat.requests.map((r) => (
            <div key={r.occupantId} className="grid gap-1.5 rounded-md border border-primary/50 bg-primary/5 p-2">
              <div>
                <span className="font-medium">{r.name}</span> wants to join as family
                {r.phone && <span className="text-muted-foreground"> · {r.phone}</span>}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ path: `/api/my-flat/requests/${r.occupantId}/approve` })}
                >
                  <Check /> Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={act.isPending}
                  onClick={() =>
                    confirm(`Reject ${r.name}?`) && act.mutate({ path: `/api/my-flat/requests/${r.occupantId}/reject` })
                  }
                >
                  <X /> Reject
                </Button>
              </div>
            </div>
          ))}

          <ul className="grid gap-1">
            {flat.members.map((m) => (
              <li key={m.occupantId} className="flex items-center justify-between gap-2">
                <span>
                  {m.name}
                  {m.isMe && ' (you)'} <span className="text-muted-foreground">· {TYPE[m.type] ?? m.type}</span>
                </span>
                {m.type === 'family' && !m.isMe && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`Remove ${m.name}`}
                    disabled={act.isPending}
                    onClick={() =>
                      confirm(
                        `Remove ${m.name} from ${flat.number}? They will lose access to the app for this flat.`,
                      ) && act.mutate({ path: `/api/my-flat/members/${m.occupantId}/remove` })
                    }
                  >
                    <UserMinus />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {act.error && <p className="text-destructive">{act.error.message}</p>}
        </div>
      ))}
    </section>
  );
}
