import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Shared frame for the signed-out pages. */
export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="font-mono text-xs font-bold tracking-tight uppercase text-muted-foreground">
            SocietyOps AI
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        {footer && <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter>}
      </Card>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

/** Runs an async submit with busy and error state. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>) => async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

/**
 * Phone, then a six-digit code. Verifying a number that has no account yet
 * creates one, so the same form signs people in and signs them up.
 */
export function OtpForm({ submitLabel }: { submitLabel: string }) {
  const { sendOtp, verifyOtp } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useSubmit();

  if (!sent) {
    return (
      <form
        className="grid gap-4"
        onSubmit={run(async () => {
          await sendOtp(phone);
          setSent(true);
        })}
      >
        <div className="grid gap-2">
          <Label htmlFor="otp-phone">Mobile number</Label>
          <Input
            id="otp-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98200 12345"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <FormError message={error} />
        <Button type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Send code'}
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-4" onSubmit={run(() => verifyOtp(phone, code))}>
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{phone}</span>.
      </p>
      <div className="grid gap-2">
        <Label htmlFor="otp-code">Code</Label>
        <Input
          id="otp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          required
          autoFocus
        />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Checking…' : submitLabel}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setSent(false)}>
        Use a different number
      </Button>
    </form>
  );
}

function PasswordForm() {
  const { signInWithPassword } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();

  return (
    <form className="grid gap-4" onSubmit={run(() => signInWithPassword(phone, password))}>
      <div className="grid gap-2">
        <Label htmlFor="phone">Mobile number</Label>
        <Input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98200 12345"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

export function LoginPage() {
  // Residents rarely remember passwords, so the code is one tap away.
  const [mode, setMode] = useState<'password' | 'otp'>('password');

  return (
    <AuthFrame
      title="Sign in"
      description={mode === 'password' ? 'With your mobile number and password.' : 'We will text you a one-time code.'}
      footer={
        <span>
          New here?{' '}
          <Link to="/signup" className="text-primary underline-offset-4 hover:underline">
            Create an account
          </Link>
        </span>
      }
    >
      <div className="grid gap-4">
        {mode === 'password' ? <PasswordForm /> : <OtpForm submitLabel="Sign in" />}
        <Button variant="link" size="sm" onClick={() => setMode(mode === 'password' ? 'otp' : 'password')}>
          {mode === 'password' ? 'Sign in with a one-time code instead' : 'Sign in with a password instead'}
        </Button>
        {import.meta.env.DEV && mode === 'password' && (
          <p className="text-xs text-muted-foreground">
            Demo: 98210 99887 / vikram123 (resident), 98765 11111 / arvind123 (manager), 98000 00000 / admin123 (admin).
            In development, codes are printed in the server log.
          </p>
        )}
      </div>
    </AuthFrame>
  );
}

export function SignUpPage() {
  return (
    <AuthFrame
      title="Create your account"
      description="Verify your mobile number to get started. You can set a password next."
      footer={
        <span>
          Already have an account?{' '}
          <Link to="/login" className="text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <OtpForm submitLabel="Verify and continue" />
    </AuthFrame>
  );
}
