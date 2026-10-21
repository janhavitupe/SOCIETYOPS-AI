import { useMemo, useState } from 'react';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { queryClient } from '../queries';
import { AuthFrame, FormError, OtpForm, useSubmit } from './AuthPages';

interface JoinInfo {
  society: { id: string; name: string; city: string };
  towers: { id: string; name: string; kind: string }[];
  flats: { id: string; number: string; towerId: string | null }[];
}

interface InviteInfo {
  society: { name: string; city: string };
  role: 'manager' | 'committee' | 'resident';
  flatNumber: string | null;
  name: string | null;
  phoneHint: string;
  expiresAt: string;
}

const ROLE_LABEL: Record<InviteInfo['role'], string> = {
  manager: 'a manager',
  committee: 'a committee member',
  resident: 'a resident',
};

/** After joining: drop anything cached from before and go to the new home. */
function useEnterSociety() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  return async () => {
    queryClient.clear();
    await refresh();
    navigate({ to: '/' });
  };
}

/** /join/CODE: a resident asks to live in one of the society's flats. */
export function JoinPage() {
  const { code } = useParams({ from: '/join/$code' });
  const { isAuthenticated, user, logout } = useAuth();
  const info = useQuery({
    queryKey: ['join', code],
    queryFn: () => api<JoinInfo>(`/api/join/${encodeURIComponent(code)}`),
    retry: false,
  });

  if (info.isLoading)
    return (
      <AuthFrame title="Join your society" description="Loading…">
        {null}
      </AuthFrame>
    );
  if (!info.data) {
    return (
      <AuthFrame
        title="Link not valid"
        description="This join link does not match any society. Ask your society office for a new one."
      >
        {null}
      </AuthFrame>
    );
  }

  const { society } = info.data;
  const description = `${society.name}${society.city ? `, ${society.city}` : ''}`;

  if (!isAuthenticated) {
    return (
      <AuthFrame title="Join your society" description={`${description}. First, verify your mobile number.`}>
        <OtpForm submitLabel="Verify and continue" />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Which flat is yours?"
      description={description}
      footer={
        <span>
          Signed in as {user?.name || user?.phone}.{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={logout}>
            Not you?
          </Button>
        </span>
      }
    >
      <JoinForm code={code} info={info.data} />
    </AuthFrame>
  );
}

function JoinForm({ code, info }: { code: string; info: JoinInfo }) {
  const { user } = useAuth();
  const enter = useEnterSociety();
  const [name, setName] = useState('');
  const [towerId, setTowerId] = useState(info.towers[0]?.id ?? '');
  const [flatId, setFlatId] = useState('');
  const [type, setType] = useState('owner');
  const [pending, setPending] = useState<string | null>(null);
  const { busy, error, run } = useSubmit();

  const flats = useMemo(() => info.flats.filter((f) => !info.towers.length || f.towerId === towerId), [info, towerId]);

  if (pending) {
    return (
      <div className="grid gap-3 text-sm">
        <p>
          Your request for <span className="font-medium">{pending}</span> has been sent. The society office will approve
          it, and you can then sign in and use SocietyOps.
        </p>
        <Button variant="outline" onClick={() => enter()}>
          Done
        </Button>
      </div>
    );
  }

  const submit = run(async () => {
    const result = await api<{ status: 'approved' | 'pending'; flatNumber: string }>(
      `/api/join/${encodeURIComponent(code)}`,
      {
        method: 'POST',
        body: JSON.stringify({ flatId, type, ...(user?.name ? {} : { name }) }),
      },
    );
    if (result.status === 'approved') await enter();
    else setPending(result.flatNumber);
  });

  if (!info.flats.length) {
    return (
      <p className="text-sm text-muted-foreground">
        This society has not added its flats yet. Please check back later.
      </p>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      {!user?.name && (
        <div className="grid gap-2">
          <Label htmlFor="join-name">Your name</Label>
          <Input id="join-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {info.towers.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="join-tower">Tower / wing</Label>
            <NativeSelect
              id="join-tower"
              value={towerId}
              onChange={(e) => {
                setTowerId(e.target.value);
                setFlatId('');
              }}
            >
              {info.towers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="join-flat">Flat</Label>
          <NativeSelect id="join-flat" value={flatId} onChange={(e) => setFlatId(e.target.value)} required>
            <option value="">Choose…</option>
            {flats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.number}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="join-type">You live here as</Label>
        <NativeSelect id="join-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="owner">Owner</option>
          <option value="tenant">Tenant</option>
          <option value="family">Family member</option>
        </NativeSelect>
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={busy || !flatId}>
        {busy ? 'Sending…' : 'Ask to join'}
      </Button>
    </form>
  );
}

/** /invite/TOKEN: someone a manager invited by phone. */
export function InvitePage() {
  const { token } = useParams({ from: '/invite/$token' });
  const { isAuthenticated, user, logout } = useAuth();
  const enter = useEnterSociety();
  const { busy, error, run } = useSubmit();
  const info = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<InviteInfo>(`/api/invite-links/${encodeURIComponent(token)}`),
    retry: false,
  });

  if (info.isLoading)
    return (
      <AuthFrame title="Your invitation" description="Loading…">
        {null}
      </AuthFrame>
    );
  if (!info.data) {
    return (
      <AuthFrame
        title="Invite not valid"
        description="This invite has already been used, has expired, or was withdrawn. Ask the society office to send a new one."
      >
        {null}
      </AuthFrame>
    );
  }

  const invite = info.data;
  const what = `${invite.society.name} as ${ROLE_LABEL[invite.role]}${invite.flatNumber ? ` of flat ${invite.flatNumber}` : ''}`;

  if (!isAuthenticated) {
    return (
      <AuthFrame
        title={invite.name ? `Welcome, ${invite.name}` : 'You have been invited'}
        description={`Join ${what}. Verify the mobile number the invite was sent to (${invite.phoneHint}).`}
      >
        <OtpForm submitLabel="Verify and continue" />
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Accept your invitation"
      description={`Join ${what}.`}
      footer={
        <span>
          Signed in as {user?.name || user?.phone}.{' '}
          <Button variant="link" size="sm" className="h-auto p-0" onClick={logout}>
            Use another number
          </Button>
        </span>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={run(async () => {
          await api(`/api/invite-links/${encodeURIComponent(token)}/accept`, { method: 'POST' });
          await enter();
        })}
      >
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Accept and join'}
        </Button>
      </form>
    </AuthFrame>
  );
}
