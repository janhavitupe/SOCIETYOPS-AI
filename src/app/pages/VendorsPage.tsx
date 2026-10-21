import { useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { VendorDirectory } from '@/components/VendorDirectory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import type { Vendor } from '@/types';
import { useShell } from '../AppShell';
import { useTicketActions, useTickets, useVendors } from '../queries';
import { useVendorActions, type Reassignment, type VendorInput } from '../buildingQueries';
import { FormError } from './AuthPages';

const CATEGORIES = [
  'Plumbing',
  'Electrical',
  'Lift & Elevator',
  'Carpentry & Locks',
  'AC & Appliances',
  'Cleaning & Pest',
  'Security & Intercom',
  'General Repairs',
];

export function VendorsPage() {
  const { isDarkMode } = useShell();
  const navigate = useNavigate();
  const tickets = useTickets();
  const vendors = useVendors();
  const { assign } = useTicketActions();
  const { remove } = useVendorActions();
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null);
  const [moved, setMoved] = useState<{ vendor: string; jobs: Reassignment[] } | null>(null);

  const assignToOldestOpenTicket = (vendorId: string) => {
    const openTicket = (tickets.data ?? []).find((t) => t.status === 'Open');
    if (!openTicket) {
      alert('No unassigned open ticket found right now. All open tickets are dispatched!');
      return;
    }
    assign.mutate({ ticketId: openTicket.id, vendorId }, { onSuccess: () => navigate({ to: '/manager' }) });
  };

  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus /> Add vendor
        </Button>
      </div>

      {moved && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <div role="status" className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span className="font-medium">{moved.vendor}</span> took over {moved.jobs.length} waiting job
            {moved.jobs.length > 1 ? 's' : ''}:{' '}
            {moved.jobs.map((j) => `#${j.ticketId} from ${j.fromVendorName} (now ${j.estimatedEta})`).join(', ')}. The
            residents have been told.
            <Button variant="link" size="sm" className="ml-2 h-auto p-0" onClick={() => setMoved(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <VendorDirectory
        vendors={vendors.data ?? []}
        isDarkMode={isDarkMode}
        onAssignVendorToOpenTicket={assignToOldestOpenTicket}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <Card>
          <CardHeader>
            <CardTitle>Manage vendors</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {(vendors.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No vendors yet. Add the plumbers, electricians and AMC companies your society uses.
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="p-2">Name</th>
                    <th className="p-2">Category</th>
                    <th className="p-2">Phone</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Rating</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {vendors.data!.map((v) => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="p-2 font-medium">{v.name}</td>
                      <td className="p-2">{v.category}</td>
                      <td className="p-2 font-mono">{v.phone}</td>
                      <td className="p-2">
                        {v.status === 'Busy' ? `Busy · ${v.openJobs} job${v.openJobs > 1 ? 's' : ''}` : v.status}
                      </td>
                      <td className="p-2">{v.rating.toFixed(1)}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(v)} aria-label={`Edit ${v.name}`}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${v.name}`}
                          onClick={() =>
                            confirm(`Remove ${v.name} from your vendors? Their open jobs go to other vendors.`) &&
                            remove.mutate(v.id, {
                              onSuccess: (r) =>
                                setMoved(r.reassigned.length ? { vendor: 'Other vendors', jobs: r.reassigned } : null),
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      <VendorDialog
        vendor={editing}
        onClose={() => setEditing(null)}
        onSaved={(v) => setMoved(v.reassigned?.length ? { vendor: v.name, jobs: v.reassigned } : null)}
      />
    </div>
  );
}

const emptyVendor: VendorInput = {
  name: '',
  category: 'Plumbing',
  phone: '',
  skills: [],
  availability: 'Available',
  avgResolutionTime: '45 mins',
  rating: 4,
};

function VendorDialog({
  vendor,
  onClose,
  onSaved,
}: {
  vendor: Vendor | 'new' | null;
  onClose: () => void;
  onSaved: (result: { name: string; reassigned?: Reassignment[] }) => void;
}) {
  const { add, update } = useVendorActions();
  const [form, setForm] = useState(emptyVendor);
  const [skills, setSkills] = useState('');
  const isNew = vendor === 'new';
  const mutation = isNew ? add : update;

  useEffect(() => {
    add.reset();
    update.reset();
    if (vendor && vendor !== 'new') {
      setForm({
        name: vendor.name,
        category: vendor.category,
        phone: vendor.phone,
        skills: vendor.skills,
        availability: vendor.availability,
        avgResolutionTime: vendor.avgResolutionTime,
        rating: vendor.rating,
      });
      setSkills(vendor.skills.join(', '));
    } else {
      setForm(emptyVendor);
      setSkills('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset when a different vendor opens
  }, [vendor]);

  const set = (key: keyof VendorInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [key]: key === 'rating' ? Number(e.target.value) : e.target.value });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = {
      ...form,
      skills: skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const done = {
      onSuccess: (result: { name: string; reassigned?: Reassignment[] }) => {
        onSaved(result);
        onClose();
      },
    };
    if (isNew) add.mutate(body, done);
    else if (vendor) update.mutate({ id: vendor.id, ...body }, done);
  };

  return (
    <Dialog open={!!vendor} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add a vendor' : 'Edit vendor'}</DialogTitle>
          <DialogDescription>
            New tickets in this category are dispatched automatically to the best available vendor.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="vendor-name">Name</Label>
            <Input id="vendor-name" value={form.name} onChange={set('name')} required maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="vendor-category">Category</Label>
              <NativeSelect id="vendor-category" value={form.category} onChange={set('category')}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-phone">Mobile number</Label>
              <Input id="vendor-phone" type="tel" value={form.phone} onChange={set('phone')} required />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vendor-skills">Skills (comma separated)</Label>
            <Input
              id="vendor-skills"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Pipe leakage, Flush valves"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="vendor-availability">Duty</Label>
              <NativeSelect id="vendor-availability" value={form.availability} onChange={set('availability')}>
                <option value="Available">On duty</option>
                <option value="Offline">Off duty</option>
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-eta">Typical response</Label>
              <Input
                id="vendor-eta"
                value={form.avgResolutionTime}
                onChange={set('avgResolutionTime')}
                maxLength={30}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vendor-rating">Rating</Label>
              <Input
                id="vendor-rating"
                type="number"
                min={1}
                max={5}
                step={0.1}
                value={form.rating}
                onChange={set('rating')}
              />
            </div>
          </div>
          <FormError message={mutation.error?.message ?? null} />
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : isNew ? 'Add vendor' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
