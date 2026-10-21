import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthFrame, FormError, useSubmit } from './AuthPages';

/**
 * Where a signed-in person lands until they belong to a society: first their
 * name (and optionally email and password), then joining or creating one.
 */
export function WelcomePage() {
  const { user } = useAuth();
  if (!user?.name) return <ProfileStep />;
  return <NoSocietyStep />;
}

function ProfileStep() {
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();

  const save = run(async () => {
    await api('/api/me', {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        ...(email ? { email } : {}),
        ...(password && !user?.hasPassword ? { password } : {}),
      }),
    });
    await refresh();
  });

  return (
    <AuthFrame
      title="Your details"
      description="So your society and its staff know who you are."
      footer={
        <Button variant="link" size="sm" className="px-0" onClick={logout}>
          Sign out
        </Button>
      }
    >
      <form className="grid gap-4" onSubmit={save}>
        <div className="grid gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">Email (optional)</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {!user?.hasPassword && (
          <div className="grid gap-2">
            <Label htmlFor="new-password">Password (optional)</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              At least 8 characters. Without one you sign in with a code each time.
            </p>
          </div>
        )}
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </form>
    </AuthFrame>
  );
}

function NoSocietyStep() {
  const { user, logout } = useAuth();
  return (
    <AuthFrame
      title={`Welcome, ${user?.name}`}
      description="You are not part of a society on SocietyOps yet."
      footer={
        <Button variant="link" size="sm" className="px-0" onClick={logout}>
          Sign out
        </Button>
      }
    >
      <div className="grid gap-3 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Residents:</span> open the invite link your society sent you, or
          ask the society office for one.
        </p>
        <p>
          <span className="font-medium text-foreground">Society admins:</span> setting up a new society will be
          available here shortly.
        </p>
      </div>
    </AuthFrame>
  );
}
