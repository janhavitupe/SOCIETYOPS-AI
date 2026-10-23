import { useState } from 'react';
import { CheckCircle2, RotateCcw, Star } from 'lucide-react';
import type { Ticket } from '../types';
import { useTicketActions } from '../app/queries';

/** A closed ticket can still be sent back for this long (services/signoff). */
const REOPEN_DAYS = 7;

/**
 * The resident's say on a finished job: confirm it with a rating, or send it
 * back with what is still wrong. Shows nothing until the vendor has finished.
 */
export function TicketSignOff({ ticket, onDone }: { ticket: Ticket; onDone: () => void }) {
  const { close, reopen } = useTicketActions();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  const finishedAt = ticket.resolvedAt ? new Date(ticket.resolvedAt).getTime() : 0;
  const canReopen =
    ticket.status === 'Resolved' ||
    (ticket.status === 'Closed' && Date.now() - finishedAt <= REOPEN_DAYS * 24 * 60 * 60 * 1000);
  if (!canReopen) return null;

  const vendor = ticket.assignedVendorName ?? 'the vendor';
  const field = 'w-full p-2 border rounded bg-white dark:bg-[#121211] text-[#1A1A1A] dark:text-white';

  return (
    <div className="p-4 rounded border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 space-y-3 text-xs">
      {reopening ? (
        <>
          <h3 className="font-bold uppercase tracking-wider text-[#1A1A1A] dark:text-white">What is still wrong?</h3>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            autoFocus
            placeholder="e.g. Still dripping at night"
            className={field}
          />
          <p className="text-[#71716A] dark:text-slate-400">It goes back to {vendor} first.</p>
        </>
      ) : ticket.status === 'Resolved' ? (
        <>
          <h3 className="font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200 flex items-center">
            <CheckCircle2 className="w-4 h-4 mr-1" /> Is it fixed?
          </h3>
          <p className="text-emerald-900/80 dark:text-emerald-100/80">
            {vendor} has marked this done. Confirm and rate the work, or reopen it if the problem is still there. It
            closes by itself 48 hours after the work.
          </p>
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => setRating(n)}
                className="p-0.5 cursor-pointer"
              >
                <Star className={`w-6 h-6 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />
              </button>
            ))}
          </div>
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            maxLength={1000}
            placeholder="Anything to add? (optional)"
            className={field}
          />
        </>
      ) : (
        <p className="text-emerald-900/80 dark:text-emerald-100/80">
          Closed. If the problem has come back, you can reopen it for {REOPEN_DAYS} days after the work.
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {reopening ? (
          <>
            <button onClick={() => setReopening(false)} className="px-3 py-1.5 rounded border cursor-pointer">
              Back
            </button>
            <button
              disabled={!reason.trim() || reopen.isPending}
              onClick={() => reopen.mutate({ ticketId: ticket.id, reason: reason.trim() }, { onSuccess: onDone })}
              className="px-3 py-1.5 rounded bg-orange-600 text-white font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
            >
              {reopen.isPending ? 'Sending…' : 'Reopen ticket'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setReopening(true)}
              className="px-3 py-1.5 rounded border border-orange-300 text-orange-700 dark:text-orange-300 font-bold uppercase tracking-wider cursor-pointer inline-flex items-center"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> Not fixed? Reopen
            </button>
            {ticket.status === 'Resolved' && (
              <button
                disabled={close.isPending}
                onClick={() =>
                  close.mutate(
                    { ticketId: ticket.id, rating: rating || undefined, feedback: feedback.trim() || undefined },
                    { onSuccess: onDone },
                  )
                }
                className="px-3 py-1.5 rounded bg-[#10B981] text-white font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
              >
                {close.isPending ? 'Saving…' : 'Confirm it’s fixed'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
