import { prisma } from '../database/prisma';
import { requireSocietyId } from '../requestContext';
import { canonicalPhone } from './phone';
import { addOccupant, OccupantError, type OccupantType } from './occupants';

/**
 * The flat register as a spreadsheet, for societies that keep theirs in
 * Excel: a template to fill in, an import that reports every bad row with
 * its reason, and an export of what is in the app.
 *
 * One row is one flat, or one person in a flat: a flat with an owner and a
 * tenant takes two rows with the same flat number.
 */

export const MAX_ROWS = 5000;

/** Excel writes this at the start of a "CSV UTF-8" file, and needs it to read one as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

const FLAT_TYPES = ['1RK', '1BHK', '2BHK', '3BHK', '4BHK', '5BHK', 'villa', 'shop', 'office', 'other'];
const OCCUPANT_TYPES: OccupantType[] = ['owner', 'tenant', 'family'];

/** Columns, with the other headings people use for them. */
const COLUMNS = {
  tower: ['tower', 'wing', 'block', 'building'],
  flat: ['flat', 'flat number', 'flat no', 'unit', 'flat_number'],
  floor: ['floor'],
  type: ['type', 'flat type', 'bhk'],
  carpetArea: ['carpet area', 'carpet area sqft', 'area', 'carpet_area_sqft', 'sqft'],
  parking: ['parking', 'parking slots', 'parking_slots'],
  name: ['name', 'resident', 'resident name', 'occupant name', 'occupant_name', 'owner name'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number', 'occupant_phone', 'contact'],
  occupantType: ['occupant type', 'lives as', 'resident type', 'occupant_type', 'relation'],
} as const;

type Column = keyof typeof COLUMNS;

const HEADINGS: Record<Column, string> = {
  tower: 'Tower',
  flat: 'Flat',
  floor: 'Floor',
  type: 'Type',
  carpetArea: 'Carpet area (sqft)',
  parking: 'Parking slots',
  name: 'Resident name',
  phone: 'Mobile',
  occupantType: 'Lives as',
};

// --- CSV ---

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.startsWith(BOM) ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * One CSV field. A value Excel would run as a formula (=, +, -, @) is
 * prefixed with an apostrophe, which Excel hides and the import strips; that
 * also stops "+919820..." turning into a number.
 */
function csvField(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CRLF and a byte-order mark, so Excel opens it with the right encoding. */
const toCsv = (rows: (string | number | null | undefined)[][]) =>
  BOM + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';

const clean = (s: string | undefined) => (s ?? '').trim().replace(/^'/, '').trim();

// --- Template and export ---

const ORDER: Column[] = ['tower', 'flat', 'floor', 'type', 'carpetArea', 'parking', 'name', 'phone', 'occupantType'];

export function templateCsv(): string {
  return toCsv([
    ORDER.map((c) => HEADINGS[c]),
    ['A', 'A-101', 1, '2BHK', 850, 1, 'Meera Iyer', '+91 98200 12345', 'owner'],
    ['A', 'A-101', 1, '2BHK', 850, 1, 'Karan Iyer', '+91 98200 12346', 'family'],
    ['A', 'A-102', 1, '3BHK', 1150, 2, '', '', ''],
  ]);
}

/** Every flat, with a row per current occupant. */
export async function exportCsv(): Promise<string> {
  const flats = await prisma.flat.findMany({
    where: { deletedAt: null },
    include: {
      tower: { select: { name: true } },
      occupants: {
        where: { status: 'active' },
        include: { user: { select: { name: true, phoneNumber: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  flats.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));

  const rows: (string | number | null)[][] = [ORDER.map((c) => HEADINGS[c])];
  for (const f of flats) {
    const flat = [f.tower?.name ?? '', f.number, f.floor, f.type, f.carpetAreaSqft, f.parkingSlots];
    if (!f.occupants.length) rows.push([...flat, '', '', '']);
    for (const o of f.occupants) rows.push([...flat, o.user.name, o.user.phoneNumber, o.type]);
  }
  return toCsv(rows);
}

// --- Import ---

export interface ImportRow {
  /** The spreadsheet's row number, counting the heading as row 1. */
  line: number;
  tower: string | null;
  flat: string;
  flatAction: 'create' | 'update' | 'unchanged' | null;
  occupant: { name: string; phone: string; type: OccupantType } | null;
  occupantAction: 'add' | 'already' | null;
  errors: string[];
}

export interface ImportPlan {
  rows: ImportRow[];
  newTowers: string[];
  summary: {
    rows: number;
    valid: number;
    errors: number;
    flatsCreated: number;
    flatsUpdated: number;
    occupantsAdded: number;
  };
  /** Set when the file itself is unusable, before any row is looked at. */
  fileError?: string;
}

interface FlatDetails {
  floor: number | null;
  type: string | null;
  carpetAreaSqft: number | null;
  parkingSlots: number | null;
}

const empty = (fileError: string): ImportPlan => ({
  rows: [],
  newTowers: [],
  summary: { rows: 0, valid: 0, errors: 0, flatsCreated: 0, flatsUpdated: 0, occupantsAdded: 0 },
  fileError,
});

/** Which column holds what, from the heading row. Unknown headings are ignored. */
function mapHeadings(heading: string[]): Partial<Record<Column, number>> {
  const at: Partial<Record<Column, number>> = {};
  heading.forEach((raw, index) => {
    const h = clean(raw).toLowerCase().replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
    for (const [column, names] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
      if (at[column] === undefined && names.includes(h)) at[column] = index;
    }
  });
  return at;
}

function wholeNumber(raw: string, label: string, min: number, max: number, errors: string[]): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/,/g, ''));
  if (!Number.isInteger(n) || n < min || n > max) {
    errors.push(`${label} must be a whole number from ${min} to ${max}`);
    return null;
  }
  return n;
}

/**
 * Checks every row against the file and the society as it is, and works out
 * what importing would do. Writes nothing.
 */
export async function planImport(csv: string): Promise<ImportPlan> {
  const table = parseCsv(csv).filter((r) => r.some((c) => clean(c)));
  if (!table.length) return empty('The file is empty');
  const at = mapHeadings(table[0]);
  if (at.flat === undefined) {
    return empty('No "Flat" column found. Start from the template so the headings match.');
  }
  if (table.length - 1 > MAX_ROWS) return empty(`The file has more than ${MAX_ROWS} rows; split it into smaller files`);

  const [towers, flats] = await Promise.all([
    prisma.tower.findMany({ where: { deletedAt: null } }),
    prisma.flat.findMany({
      include: {
        tower: { select: { name: true } },
        occupants: {
          where: { status: 'active' },
          include: { user: { select: { phoneNumber: true } } },
        },
      },
    }),
  ]);
  const towerByName = new Map(towers.map((t) => [t.name.toLowerCase(), t]));
  const flatByNumber = new Map(flats.map((f) => [f.number.toLowerCase(), f]));

  // What earlier rows in this file said about each flat, to catch rows that disagree.
  const seen = new Map<string, { line: number; tower: string | null; details: FlatDetails; phones: Set<string> }>();
  const newTowers = new Set<string>();
  const rows: ImportRow[] = [];

  table.slice(1).forEach((cells, index) => {
    const get = (c: Column) => (at[c] === undefined ? '' : clean(cells[at[c]!]));
    const errors: string[] = [];
    const line = index + 2;

    const flat = get('flat');
    if (!flat) errors.push('Flat number is missing');
    else if (flat.length > 30) errors.push('Flat number is longer than 30 characters');

    const tower = get('tower') || null;
    if (tower && tower.length > 40) errors.push('Tower name is longer than 40 characters');

    const rawType = get('type').replace(/\s+/g, '');
    const type = rawType ? (FLAT_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase()) ?? null) : null;
    if (rawType && !type) errors.push(`Type "${get('type')}" is not one of ${FLAT_TYPES.join(', ')}`);

    const details: FlatDetails = {
      floor: wholeNumber(get('floor'), 'Floor', 0, 200, errors),
      type,
      carpetAreaSqft: wholeNumber(get('carpetArea'), 'Carpet area', 50, 100000, errors),
      parkingSlots: wholeNumber(get('parking'), 'Parking slots', 0, 10, errors),
    };

    // A person: name and mobile together, or neither.
    const name = get('name');
    const rawPhone = get('phone');
    let occupant: ImportRow['occupant'] = null;
    if (name || rawPhone) {
      const phone = canonicalPhone(rawPhone);
      const rawOccupantType = get('occupantType').toLowerCase();
      const occupantType = (rawOccupantType || 'owner') as OccupantType;
      if (!name) errors.push('Resident name is missing for this mobile number');
      else if (name.length > 100) errors.push('Resident name is longer than 100 characters');
      if (!rawPhone) errors.push('Mobile number is missing for this resident');
      else if (!phone) errors.push(`"${rawPhone}" is not a valid mobile number`);
      if (!OCCUPANT_TYPES.includes(occupantType)) errors.push(`Lives as must be owner, tenant or family`);
      if (name && phone && OCCUPANT_TYPES.includes(occupantType)) occupant = { name, phone, type: occupantType };
    }

    let flatAction: ImportRow['flatAction'] = null;
    let occupantAction: ImportRow['occupantAction'] = null;

    if (flat) {
      const key = flat.toLowerCase();
      const existing = flatByNumber.get(key);
      const earlier = seen.get(key);

      if (existing?.deletedAt) errors.push(`${flat} was removed earlier and cannot be re-added`);
      if (existing && tower && existing.tower && existing.tower.name.toLowerCase() !== tower.toLowerCase()) {
        errors.push(`${existing.number} is already in tower ${existing.tower.name}`);
      }
      if (earlier) {
        if ((tower ?? '').toLowerCase() !== (earlier.tower ?? '').toLowerCase() && tower && earlier.tower)
          errors.push(`Row ${earlier.line} puts ${flat} in tower ${earlier.tower}`);
        for (const k of Object.keys(details) as (keyof FlatDetails)[]) {
          if (details[k] !== null && earlier.details[k] !== null && details[k] !== earlier.details[k])
            errors.push(
              `Row ${earlier.line} gives ${flat} a different ${k === 'carpetAreaSqft' ? 'carpet area' : k === 'parkingSlots' ? 'parking' : k}`,
            );
        }
      }

      if (occupant) {
        const phones = earlier?.phones ?? new Set<string>();
        if (phones.has(occupant.phone)) errors.push(`Row ${earlier!.line} already puts ${occupant.phone} in ${flat}`);
        const already = existing?.occupants.some((o) => o.user.phoneNumber === occupant!.phone);
        occupantAction = already ? 'already' : 'add';
      }

      if (!errors.length) {
        if (!existing) flatAction = earlier ? 'unchanged' : 'create';
        else {
          const changes = (Object.keys(details) as (keyof FlatDetails)[]).some((k) => {
            const current = k === 'carpetAreaSqft' ? existing.carpetAreaSqft : (existing as any)[k];
            return details[k] !== null && details[k] !== current;
          });
          flatAction = changes || (tower && !existing.towerId) ? 'update' : 'unchanged';
        }
        if (tower && !towerByName.has(tower.toLowerCase())) newTowers.add(tower);

        const record = earlier ?? { line, tower, details: { ...details }, phones: new Set<string>() };
        for (const k of Object.keys(details) as (keyof FlatDetails)[]) {
          if (record.details[k] === null) (record.details as unknown as Record<string, unknown>)[k] = details[k];
        }
        record.tower ??= tower;
        if (occupant) record.phones.add(occupant.phone);
        seen.set(key, record);
      }
    }

    rows.push({
      line,
      tower,
      flat,
      flatAction: errors.length ? null : flatAction,
      occupant,
      occupantAction: errors.length ? null : occupantAction,
      errors,
    });
  });

  const valid = rows.filter((r) => !r.errors.length);
  return {
    rows,
    newTowers: [...newTowers],
    summary: {
      rows: rows.length,
      valid: valid.length,
      errors: rows.length - valid.length,
      flatsCreated: valid.filter((r) => r.flatAction === 'create').length,
      flatsUpdated: new Set(valid.filter((r) => r.flatAction === 'update').map((r) => r.flat.toLowerCase())).size,
      occupantsAdded: valid.filter((r) => r.occupantAction === 'add').length,
    },
  };
}

/**
 * Imports the rows that passed. Rows with errors are skipped and stay in the
 * report, so the rest of the file is not held up by one bad line. Running the
 * same file again changes nothing.
 */
export async function applyImport(csv: string, approvedById: string): Promise<ImportPlan> {
  const plan = await planImport(csv);
  if (plan.fileError) return plan;
  const societyId = requireSocietyId();

  const towerIds = new Map(
    (await prisma.tower.findMany({ where: { deletedAt: null } })).map((t) => [t.name.toLowerCase(), t.id]),
  );
  let sortOrder = towerIds.size;
  for (const name of plan.newTowers) {
    const tower = await prisma.tower.create({ data: { societyId, name, kind: 'tower', sortOrder: sortOrder++ } });
    towerIds.set(name.toLowerCase(), tower.id);
  }

  // Each flat's details, merged across its rows (planImport made sure they agree).
  const table = parseCsv(csv).filter((r) => r.some((c) => clean(c)));
  const at = mapHeadings(table[0]);
  const cell = (line: number, c: Column) => (at[c] === undefined ? '' : clean(table[line - 1]?.[at[c]!]));
  const num = (line: number, c: Column) => (cell(line, c) ? Number(cell(line, c).replace(/,/g, '')) : undefined);

  const valid = plan.rows.filter((r) => !r.errors.length);
  const merged = new Map<
    string,
    { number: string; tower: string | null; data: Record<string, number | string | undefined> }
  >();
  for (const row of valid) {
    const key = row.flat.toLowerCase();
    const entry = merged.get(key) ?? { number: row.flat, tower: null, data: {} };
    entry.tower ??= row.tower;
    const rawType = cell(row.line, 'type').replace(/\s+/g, '');
    const values = {
      floor: num(row.line, 'floor'),
      type: rawType ? FLAT_TYPES.find((t) => t.toLowerCase() === rawType.toLowerCase()) : undefined,
      carpetAreaSqft: num(row.line, 'carpetArea'),
      parkingSlots: num(row.line, 'parking'),
    };
    for (const [k, v] of Object.entries(values)) if (entry.data[k] === undefined) entry.data[k] = v;
    merged.set(key, entry);
  }

  const flatIds = new Map<string, string>();
  for (const [key, { number, tower, data }] of merged) {
    const towerId = tower ? towerIds.get(tower.toLowerCase()) : undefined;
    const existing = await prisma.flat.findFirst({ where: { number: { equals: number, mode: 'insensitive' } } });
    const flat = existing
      ? await prisma.flat.update({
          where: { id: existing.id },
          data: { ...data, ...(towerId && !existing.towerId ? { towerId } : {}) },
        })
      : await prisma.flat.create({
          data: {
            ...data,
            parkingSlots: (data.parkingSlots as number) ?? 0,
            number,
            towerId: towerId ?? null,
            societyId,
          },
        });
    flatIds.set(key, flat.id);
  }

  for (const row of valid) {
    if (!row.occupant || row.occupantAction !== 'add') continue;
    try {
      await addOccupant(flatIds.get(row.flat.toLowerCase())!, row.occupant, approvedById);
    } catch (err) {
      if (!(err instanceof OccupantError && err.status === 409)) throw err;
      row.occupantAction = 'already';
    }
  }
  return plan;
}
