import { useState } from 'react';
import { Check, Copy, MessageCircle, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useSocietyProfile } from './queries';
import { inviteLink, useInvites, useJoinActions, useJoinRequests, whatsAppInvite, type Invite } from './joinQueries';
import { FormError } from './pages/AuthPages';

const TYPE_LABEL: Record<string, string> = { owner: 'Owner', tenant: 'Tenant', family: 'Family member' };
const ROLE_LABEL: Record<Invite['role'], string> = { manager: 'Manager', committee: 'Committee', resident: 'Resident' };

/** Residents who asked to join with the society's code, waiting for a manager. Hidden when there are none. */
export function JoinRequestsCard() {
  const requests = useJoinRequests();
  const { approve, reject } = useJoinActions();
  if (!requests.data?.length) return null;

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle>Join requests ({requests.data.length})</CardTitle>
        <CardDescription>
          People who used your join link. Check they really live in the flat before approving.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {requests.data.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium">
                {r.user.name} · {r.flat.number}
              </div>
              <div className="text-xs text-muted-foreground">
                {TYPE_LABEL[r.type]} · {r.user.phoneNumber} · asked {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                <Check /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={reject.isPending}
                onClick={() => confirm(`Reject ${r.user.name}'s request for ${r.flat.number}?`) && reject.mutate(r.id)}
              >
                <X /> Reject
              </Button>
            </div>
          </div>
        ))}
        <FormError message={approve.error?.message ?? reject.error?.message ?? null} />
      </CardContent>
    </Card>
  );
}

/** A freshly made invite: the link to copy, and a one-tap WhatsApp message. */
export function InviteLinkBox({ invite }: { invite: Invite }) {
  const profile = useSocietyProfile();
  const [copied, setCopied] = useState(false);
  const link = inviteLink(invite.token);

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
    <div className="grid gap-2 rounded-md border bg-muted/50 p-3 text-sm">
      <div>
        Invite ready for {invite.name || invite.phone}. It works once, for 14 days, and only for {invite.phone}.
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded border bg-background px-2 py-1 text-xs">{link}</code>
        <Button type="button" size="icon" variant="outline" onClick={copy} aria-label="Copy invite link">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <Button asChild size="sm" variant="outline" className="justify-self-start">
        <a href={whatsAppInvite(invite, profile.data?.societyName ?? 'your society')} target="_blank" rel="noreferrer">
          <MessageCircle /> Send on WhatsApp
        </a>
      </Button>
    </div>
  );
}

/** Society admins invite managers and committee members by phone. */
export function StaffInvitesCard() {
  const invites = useInvites();
  const { invite, revoke } = useJoinActions();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'manager' | 'committee'>('manager');
  const [made, setMade] = useState<Invite | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    invite.mutate(
      { phone, name: name || undefined, role },
      {
        onSuccess: (created) => {
          setMade(created);
          setPhone('');
          setName('');
        },
      },
    );
  };

  const open = invites.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite staff</CardTitle>
        <CardDescription>
          Managers run tickets, vendors and residents. Committee members can see the society’s reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_9rem]">
            <div className="grid gap-2">
              <Label htmlFor="staff-name">Name</Label>
              <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="staff-phone">Mobile number</Label>
              <Input id="staff-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="staff-role">Role</Label>
              <NativeSelect id="staff-role" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
                <option value="manager">Manager</option>
                <option value="committee">Committee</option>
              </NativeSelect>
            </div>
          </div>
          <FormError message={invite.error?.message ?? null} />
          <Button type="submit" className="justify-self-start" disabled={invite.isPending}>
            <UserPlus /> {invite.isPending ? 'Creating…' : 'Create invite'}
          </Button>
        </form>

        {made && <InviteLinkBox invite={made} />}

        {open.length > 0 && (
          <div className="grid gap-1 text-sm">
            <div className="font-medium">Waiting to be accepted</div>
            {open.map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-md border px-3 py-1.5">
                <span>
                  {i.name || i.phone} · {ROLE_LABEL[i.role]}
                  {i.flat ? ` · ${i.flat.number}` : ''}
                  <span className="text-muted-foreground"> · until {new Date(i.expiresAt).toLocaleDateString()}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke.mutate(i.id, { onSuccess: () => made?.id === i.id && setMade(null) })}
                >
                  Withdraw
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
