import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SocietyDetailsValue {
  name: string;
  registrationNumber: string;
  address: string;
  city: string;
  pinCode: string;
}

export const emptySocietyDetails: SocietyDetailsValue = {
  name: '',
  registrationNumber: '',
  address: '',
  city: '',
  pinCode: '',
};

/**
 * The society's identifying details, shared by creating a society and editing
 * it (and, later, the onboarding wizard's first step).
 */
export function SocietyDetailsFields({
  value,
  onChange,
}: {
  value: SocietyDetailsValue;
  onChange: (next: SocietyDetailsValue) => void;
}) {
  const field = (key: keyof SocietyDetailsValue) => ({
    id: `society-${key}`,
    value: value[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [key]: e.target.value }),
  });

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="society-name">Society name</Label>
        <Input {...field('name')} placeholder="Lotus Heights Co-operative Housing Society" required maxLength={150} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="society-registrationNumber">Registration number (optional)</Label>
        <Input {...field('registrationNumber')} placeholder="MUM/WHE/HSG/TC/1234" maxLength={60} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="society-address">Address</Label>
        <Input {...field('address')} placeholder="Plot 12, MG Road, Andheri West" required maxLength={300} />
      </div>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <div className="grid gap-2">
          <Label htmlFor="society-city">City</Label>
          <Input {...field('city')} required maxLength={80} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="society-pinCode">PIN code</Label>
          <Input
            {...field('pinCode')}
            inputMode="numeric"
            pattern="[1-9][0-9]{5}"
            maxLength={6}
            title="A 6-digit PIN code"
            required
          />
        </div>
      </div>
    </div>
  );
}

/** Drops the optional registration number when blank, as the API expects. */
export function societyDetailsPayload(value: SocietyDetailsValue) {
  const { registrationNumber, ...rest } = value;
  return registrationNumber.trim() ? { ...rest, registrationNumber } : rest;
}
