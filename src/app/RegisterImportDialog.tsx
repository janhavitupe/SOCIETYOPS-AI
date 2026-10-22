import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Download, FileUp } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { buildingKeys } from './buildingQueries';
import { keys } from './queries';
import { FormError } from './pages/AuthPages';

/** The flat register as a spreadsheet: template, import with a row-by-row report, and export. */

interface ImportRow {
  line: number;
  tower: string | null;
  flat: string;
  flatAction: 'create' | 'update' | 'unchanged' | null;
  occupant: { name: string; phone: string; type: string } | null;
  occupantAction: 'add' | 'already' | null;
  errors: string[];
}

interface ImportPlan {
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
  dryRun: boolean;
}

const FLAT_ACTION: Record<NonNullable<ImportRow['flatAction']>, string> = {
  create: 'New flat',
  update: 'Update flat',
  unchanged: '',
};

function describe(row: ImportRow): string {
  const parts = [row.flatAction ? FLAT_ACTION[row.flatAction] : ''];
  if (row.occupant && row.occupantAction === 'add') parts.push(`add ${row.occupant.name} (${row.occupant.type})`);
  if (row.occupant && row.occupantAction === 'already') parts.push(`${row.occupant.name} already here`);
  return parts.filter(Boolean).join(', ') || 'No change';
}

/** The bad rows as a CSV the manager can fix against. */
function errorReport(plan: ImportPlan): string {
  const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ['Row,Flat,Problem'];
  for (const r of plan.rows.filter((r) => r.errors.length)) {
    lines.push([r.line, quote(r.flat), quote(r.errors.join('; '))].join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export function RegisterImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const client = useQueryClient();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [plan, setPlan] = useState<ImportPlan | null>(null);

  const send = useMutation({
    mutationFn: ({ text, dryRun }: { text: string; dryRun: boolean }) =>
      api<ImportPlan>(`/api/flats/import${dryRun ? '?dryRun=true' : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      }),
    onSuccess: (result) => {
      setPlan(result);
      if (!result.dryRun) {
        client.invalidateQueries({ queryKey: buildingKeys.towers });
        client.invalidateQueries({ queryKey: buildingKeys.allFlats });
        client.invalidateQueries({ queryKey: ['occupants'] });
        client.invalidateQueries({ queryKey: keys.residentProfiles });
      }
    },
  });

  const reset = () => {
    setCsv(null);
    setFileName('');
    setPlan(null);
    send.reset();
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setPlan(null);
    send.mutate({ text, dryRun: true });
  };

  const imported = plan && !plan.dryRun;
  const bad = plan?.rows.filter((r) => r.errors.length) ?? [];
  const good = plan?.rows.filter((r) => !r.errors.length) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import or export the flat register</DialogTitle>
          <DialogDescription>
            One row per flat, or per person in a flat: a flat with an owner and a tenant takes two rows. Save from Excel
            as “CSV UTF-8”.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="/api/flats/template.csv" download>
              <Download /> Template
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/api/flats/export.csv" download>
              <Download /> Export current register
            </a>
          </Button>
        </div>

        {!imported && (
          <div className="grid gap-2">
            <Label htmlFor="register-file">Filled-in register (.csv)</Label>
            <input
              id="register-file"
              type="file"
              accept=".csv,text/csv"
              className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
              onChange={(e) => choose(e.target.files?.[0])}
            />
          </div>
        )}

        {send.isPending && <p className="text-sm text-muted-foreground">Checking {fileName}…</p>}
        <FormError message={send.error?.message ?? null} />

        {plan && (
          <div className="grid gap-3 text-sm">
            <div
              className={`flex items-start gap-2 rounded-md border p-3 ${imported ? 'border-emerald-500/40 bg-emerald-500/5' : ''}`}
            >
              {imported ? (
                <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" />
              ) : (
                <FileUp className="mt-0.5 size-4" />
              )}
              <div>
                <div className="font-medium">
                  {imported ? 'Imported. ' : `${fileName}: `}
                  {plan.summary.flatsCreated} new flat{plan.summary.flatsCreated === 1 ? '' : 's'},{' '}
                  {plan.summary.flatsUpdated} updated, {plan.summary.occupantsAdded} resident
                  {plan.summary.occupantsAdded === 1 ? '' : 's'} {imported ? 'added' : 'to add'}
                  {plan.newTowers.length
                    ? `, new tower${plan.newTowers.length > 1 ? 's' : ''} ${plan.newTowers.join(', ')}`
                    : ''}
                  .
                </div>
                <div className="text-muted-foreground">
                  {plan.summary.valid} of {plan.summary.rows} rows are fine
                  {bad.length ? `; ${bad.length} ${imported ? 'were skipped' : 'will be skipped'}` : ''}.
                  {imported &&
                    plan.summary.occupantsAdded > 0 &&
                    ' New residents sign in with a one-time code to their mobile.'}
                </div>
              </div>
            </div>

            {bad.length > 0 && (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium text-destructive">
                    <AlertCircle className="size-4" /> Rows with problems
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadText('register-problems.csv', errorReport(plan))}
                  >
                    <Download /> Error report
                  </Button>
                </div>
                <div className="max-h-56 overflow-y-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted">
                      <tr>
                        <th className="px-2 py-1.5">Row</th>
                        <th className="px-2 py-1.5">Flat</th>
                        <th className="px-2 py-1.5">Problem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bad.map((r) => (
                        <tr key={r.line} className="border-t align-top">
                          <td className="px-2 py-1.5 tabular-nums">{r.line}</td>
                          <td className="px-2 py-1.5">{r.flat || '–'}</td>
                          <td className="px-2 py-1.5">{r.errors.join('; ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {!imported && good.length > 0 && (
              <details>
                <summary className="cursor-pointer text-muted-foreground">What the good rows will do</summary>
                <div className="mt-1.5 max-h-48 overflow-y-auto rounded-md border">
                  <table className="w-full text-left text-xs">
                    <tbody>
                      {good.map((r) => (
                        <tr key={r.line} className="border-t first:border-t-0">
                          <td className="px-2 py-1 tabular-nums text-muted-foreground">{r.line}</td>
                          <td className="px-2 py-1">{r.flat}</td>
                          <td className="px-2 py-1">{describe(r)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </div>
        )}

        <DialogFooter>
          {imported ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <Button
              disabled={!csv || !plan || !plan.summary.valid || send.isPending}
              onClick={() => csv && send.mutate({ text: csv, dryRun: false })}
            >
              {send.isPending && plan ? 'Importing…' : `Import ${plan?.summary.valid ?? ''} good rows`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
