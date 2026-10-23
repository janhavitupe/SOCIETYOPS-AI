import { useState } from 'react';
import { AlertTriangle, Megaphone, Pin } from 'lucide-react';
import { useMyNotices, useNoticeActions, type Notice } from '@/app/noticeQueries';

/**
 * Notices from the society office, for residents: pinned and unread urgent
 * ones first. Opening one marks it read; a poll can be answered in place.
 */
export function NoticesPanel() {
  const notices = useMyNotices();
  const [openId, setOpenId] = useState<string | null>(null);
  const { read } = useNoticeActions();
  const list = notices.data?.notices ?? [];
  if (!list.length) return null;

  const toggle = (n: Notice) => {
    setOpenId(openId === n.id ? null : n.id);
    if (!n.read) read.mutate(n.id);
  };

  return (
    <section className="grid gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-2xs">
      <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
        <Megaphone className="size-3.5" /> Notices
        {!!notices.data?.unread && (
          <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
            {notices.data.unread} new
          </span>
        )}
      </h2>
      <ul className="grid max-h-80 gap-1.5 overflow-y-auto text-xs">
        {list.map((n) => (
          <li
            key={n.id}
            className={`rounded-md border ${n.urgent && !n.read ? 'border-red-400 bg-red-50 dark:bg-red-950/40' : !n.read ? 'border-primary/50 bg-primary/5' : ''}`}
          >
            <button type="button" className="grid w-full gap-0.5 px-2.5 py-2 text-left" onClick={() => toggle(n)}>
              <span className="flex items-center gap-1 font-semibold">
                {n.pinned && <Pin className="size-3 shrink-0" />}
                {n.urgent && <AlertTriangle className="size-3 shrink-0 text-red-600" />}
                {n.title}
              </span>
              <span className="text-muted-foreground">
                {new Date(n.publishAt).toLocaleDateString([], { day: 'numeric', month: 'short' })}
                {!n.read && <span className="ml-1.5 font-semibold text-primary">New</span>}
              </span>
            </button>
            {openId === n.id && <NoticeBody notice={n} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoticeBody({ notice }: { notice: Notice }) {
  const { vote } = useNoticeActions();
  const total = notice.results?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="grid gap-2 border-t px-2.5 py-2">
      <p className="whitespace-pre-wrap leading-relaxed">{notice.body}</p>
      {notice.pollOptions.length > 0 && (
        <div className="grid gap-1">
          {notice.pollOptions.map((option, i) => {
            const count = notice.results?.[i] ?? 0;
            const share = total ? Math.round((count / total) * 100) : 0;
            const mine = notice.myVote === i;
            return (
              <button
                key={i}
                type="button"
                disabled={vote.isPending}
                onClick={() => vote.mutate({ id: notice.id, option: i })}
                aria-pressed={mine}
                className={`relative overflow-hidden rounded border px-2 py-1.5 text-left ${mine ? 'border-primary font-semibold' : ''}`}
              >
                {notice.results && (
                  <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${share}%` }} />
                )}
                <span className="relative flex justify-between gap-2">
                  <span>{option}</span>
                  {notice.results && (
                    <span className="text-muted-foreground">
                      {count} · {share}%
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          <span className="text-muted-foreground">
            {notice.myVote === null ? 'Tap a choice to vote.' : 'You can change your vote.'}
          </span>
        </div>
      )}
    </div>
  );
}
