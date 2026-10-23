import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSociety, useUpdateSociety } from '../queries';
import { SocietyDetailsFields, emptySocietyDetails, societyDetailsPayload } from '../SocietyDetailsFields';
import { FormError } from './AuthPages';
import { StaffInvitesCard } from '../JoinWidgets';

/** Society admins: the society's details and the link residents join with. */
export function SocietySettingsPage() {
  const society = useSociety();
  const update = useUpdateSociety();
  const [details, setDetails] = useState(emptySocietyDetails);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!society.data) return;
    const s = society.data;
    setDetails({
      name: s.name,
      registrationNumber: s.registrationNumber ?? '',
      address: s.address,
      city: s.city,
      pinCode: s.pinCode,
    });
  }, [society.data]);

  if (society.isLoading) return <p className="max-w-2xl mx-auto px-4 py-10 text-muted-foreground">Loading…</p>;
  if (!society.data) return null;

  const joinLink = `${window.location.origin}/join/${society.data.joinCode}`;

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    update.mutate(societyDetailsPayload(details), { onSuccess: () => setSaved(true) });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link is on screen to copy by hand.
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Society settings</h1>
        <p className="text-sm text-muted-foreground">
          {society.data.status === 'onboarding'
            ? 'Your society is being set up. The setup checklist on the dashboard shows what is left.'
            : 'Details shown to residents and staff.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Name, registration and address.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={save}>
            <SocietyDetailsFields value={details} onChange={setDetails} />
            <FormError message={update.error?.message ?? null} />
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save'}
              </Button>
              {saved && <span className="text-sm text-muted-foreground">Saved</span>}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Join link</CardTitle>
          <CardDescription>
            Residents open this link to ask to join. Code <span className="font-mono">{society.data.joinCode}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md border bg-muted px-3 py-2 text-sm">{joinLink}</code>
          <Button type="button" variant="outline" size="icon" onClick={copy} aria-label="Copy join link">
            {copied ? <Check /> : <Copy />}
          </Button>
        </CardContent>
      </Card>

      <StaffInvitesCard />
    </div>
  );
}
