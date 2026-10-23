import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';

/** Each vendor's numbers for a period (routes/vendors GET /vendors/performance). */

interface VendorScore {
  vendorId: string;
  name: string;
  category: string;
  rating: number;
  removed: boolean;
  jobs: number;
  done: number;
  open: number;
  avgAcceptMinutes: number | null;
  avgStartMinutes: number | null;
  avgFixMinutes: number | null;
  slaMissed: number;
  reopenRate: number | null;
  avgRating: number | null;
  ratings: number;
  declined: number;
  timedOut: number;
}

type Period = '30' | '90' | 'this_month' | 'last_month';

function range(period: Period, now = new Date()): { from: Date; to: Date } {
  if (period === 'this_month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (period === 'last_month') {
    return {
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  return { from: new Date(now.getTime() - Number(period) * 24 * 60 * 60 * 1000), to: now };
}

/** 45 → "45m", 135 → "2h 15m", 3000 → "2d 2h". */
function duration(minutes: number | null): string {
  if (minutes === null) return '–';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${minutes % 60 ? ` ${minutes % 60}m` : ''}`;
  return `${Math.floor(hours / 24)}d${hours % 24 ? ` ${hours % 24}h` : ''}`;
}

const percent = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);

function toCsv(rows: VendorScore[]): string {
  const head = [
    'Vendor',
    'Category',
    'Jobs',
    'Done',
    'Open',
    'Avg accept (min)',
    'Avg start (min)',
    'Avg fix (min)',
    'Deadlines missed',
    'Reopen rate',
    'Avg rating',
    'Ratings',
    'Declined',
    'Not accepted in time',
  ];
  const quote = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      r.name,
      r.category,
      r.jobs,
      r.done,
      r.open,
      r.avgAcceptMinutes,
      r.avgStartMinutes,
      r.avgFixMinutes,
      r.slaMissed,
      r.reopenRate === null ? '' : Math.round(r.reopenRate * 100) + '%',
      r.avgRating,
      r.ratings,
      r.declined,
      r.timedOut,
    ]
      .map(quote)
      .join(','),
  );
  return '﻿' + [head.map(quote).join(','), ...lines].join('\r\n') + '\r\n';
}

export function VendorScorecard() {
  const [period, setPeriod] = useState<Period>('30');
  const { from, to } = range(period);
  const scores = useQuery({
    queryKey: ['vendor-performance', period],
    queryFn: () =>
      api<{ vendors: VendorScore[] }>(
        `/api/vendors/performance?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      ),
    placeholderData: keepPreviousData,
  });
  const rows = scores.data?.vendors ?? [];

  const download = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), {
      href: url,
      download: `vendor-scorecard-${from.toISOString().slice(0, 10)}-to-${to.toISOString().slice(0, 10)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Vendor performance</CardTitle>
          <CardDescription>
            How fast each vendor responds and fixes, how often residents send jobs back, and how they rate the work.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <NativeSelect
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            aria-label="Period"
            className="w-40"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="this_month">This month</option>
            <option value="last_month">Last month</option>
          </NativeSelect>
          <Button variant="outline" onClick={download} disabled={!rows.length}>
            <Download /> CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {scores.data && !rows.some((r) => r.jobs || r.declined || r.timedOut) ? (
          <p className="text-sm text-muted-foreground">No jobs in this period yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2">Vendor</th>
                <th className="p-2 text-right">Jobs</th>
                <th className="p-2 text-right" title="Assignment to first response">
                  Accepts in
                </th>
                <th className="p-2 text-right" title="Assignment to starting work">
                  Starts in
                </th>
                <th className="p-2 text-right" title="Assignment to marked done">
                  Fixes in
                </th>
                <th className="p-2 text-right">Late</th>
                <th className="p-2 text-right">Reopened</th>
                <th className="p-2 text-right">Rating</th>
                <th className="p-2 text-right" title="Declined, or not accepted in time">
                  Passed on
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.vendorId} className="border-b last:border-0">
                  <td className="p-2">
                    <div className="font-medium">
                      {r.name}
                      {r.removed && <span className="text-xs text-muted-foreground"> (removed)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.category}</div>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.done}/{r.jobs}
                    {r.open > 0 && <div className="text-xs text-muted-foreground">{r.open} open</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{duration(r.avgAcceptMinutes)}</td>
                  <td className="p-2 text-right tabular-nums">{duration(r.avgStartMinutes)}</td>
                  <td className="p-2 text-right tabular-nums">{duration(r.avgFixMinutes)}</td>
                  <td className={`p-2 text-right tabular-nums ${r.slaMissed ? 'text-destructive font-medium' : ''}`}>
                    {r.slaMissed}
                  </td>
                  <td
                    className={`p-2 text-right tabular-nums ${(r.reopenRate ?? 0) >= 0.2 ? 'text-destructive font-medium' : ''}`}
                  >
                    {percent(r.reopenRate)}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.avgRating ?? '–'}
                    {r.ratings > 0 && <div className="text-xs text-muted-foreground">{r.ratings} ratings</div>}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {r.declined + r.timedOut || '–'}
                    {r.timedOut > 0 && <div className="text-xs text-muted-foreground">{r.timedOut} not in time</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
