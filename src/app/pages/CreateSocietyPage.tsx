import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { queryClient } from '../queries';
import { SocietyDetailsFields, emptySocietyDetails, societyDetailsPayload } from '../SocietyDetailsFields';
import { AuthFrame, FormError, useSubmit } from './AuthPages';

/**
 * Sets up a new society, with the signed-in person as its admin. Reached from
 * the welcome page by someone with no society, and from the society switcher
 * by someone who already has one.
 */
export function CreateSocietyForm({ onCancel }: { onCancel?: () => void }) {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [details, setDetails] = useState(emptySocietyDetails);
  const { busy, error, run } = useSubmit();

  const create = run(async () => {
    await api('/api/societies', { method: 'POST', body: JSON.stringify(societyDetailsPayload(details)) });
    // The session has moved to the new society; nothing cached belongs to it.
    queryClient.clear();
    await refresh();
    navigate({ to: '/manager/settings' });
  });

  return (
    <form className="grid gap-4" onSubmit={create}>
      <SocietyDetailsFields value={details} onChange={setDetails} />
      <FormError message={error} />
      <Button type="submit" disabled={busy}>
        {busy ? 'Setting up…' : 'Set up society'}
      </Button>
      {onCancel && (
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Back
        </Button>
      )}
    </form>
  );
}

export function CreateSocietyPage() {
  const navigate = useNavigate();
  return (
    <AuthFrame title="Set up a society" description="You will be its admin. You can change these details later.">
      <CreateSocietyForm onCancel={() => navigate({ to: '/' })} />
    </AuthFrame>
  );
}
