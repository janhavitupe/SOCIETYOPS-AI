/**
 * Canonical form for a stored phone number: "+" followed by country code and
 * number, no spaces. Returns null when the input cannot be a phone number.
 *
 * Bare 10-digit numbers, and 11-digit numbers with a trunk "0", are taken as
 * Indian. Kept in step with the normalisation in the
 * 20261020000000_timestamps_and_phones migration.
 */
export function canonicalPhone(raw: string): string | null {
  let digits = (raw || '').replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}
