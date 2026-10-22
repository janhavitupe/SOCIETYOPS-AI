import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * A resident's or vendor's own notifications: the same messages they get on
 * WhatsApp or SMS, kept in the app. Managers have the society's whole
 * dispatch log instead.
 */

export interface InboxItem {
  id: string;
  /** Empty for messages not about a ticket, like an invite to the app. */
  ticketId: string | null;
  message: string;
  timestamp: string;
  readAt: string | null;
}

const KEY = ['me', 'notifications'] as const;

export const useInbox = (enabled: boolean) =>
  useQuery({
    queryKey: KEY,
    queryFn: () => api<{ unread: number; notifications: InboxItem[] }>('/api/me/notifications'),
    enabled,
    refetchInterval: 30_000,
  });

export function InboxDrawer({
  isOpen,
  onClose,
  items,
  onOpenTicket,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: InboxItem[];
  onOpenTicket: (ticketId: string) => void;
}) {
  const client = useQueryClient();
  const markRead = useMutation({
    mutationFn: () => api('/api/me/notifications/read', { method: 'POST', body: '{}' }),
    onSuccess: () => client.invalidateQueries({ queryKey: KEY }),
  });

  // Opening the drawer counts as reading them; new ones are still shown as new this time.
  useEffect(() => {
    if (isOpen && items.some((i) => !i.readAt)) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col border-l bg-background text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
            <Bell className="size-4 text-primary" /> Notifications
          </h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-accent" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid content-start gap-2 overflow-y-auto p-3 text-sm">
          {!items.length && <p className="py-8 text-center text-muted-foreground">Nothing yet.</p>}
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                if (!n.ticketId) return;
                onOpenTicket(n.ticketId);
                onClose();
              }}
              className={`grid gap-1 rounded-md border px-3 py-2 text-left hover:bg-accent ${n.readAt ? '' : 'border-primary/50 bg-primary/5'}`}
            >
              <span>{n.message}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(n.timestamp).toLocaleString([], {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {!n.readAt && <span className="ml-2 font-semibold text-primary">New</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
