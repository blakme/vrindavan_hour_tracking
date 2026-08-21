'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, HourEntry, Category, Profile } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileBarChart,
  Download,
  Printer,
  Loader2,
  Filter,
  Users,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatHours, formatDate, roleLabel, volunteerTypeLabel, statusLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface ReportRow extends HourEntry {
  volunteer_name: string;
  volunteer_email: string;
  volunteer_role: string;
  volunteer_type: string | null;
  team_name: string;
  category_name: string;
  sub_category_name: string | null;
  approver_name: string | null;
}

export default function ReportsPage() {
  const [entries, setEntries] = useState<ReportRow[]>([]);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [volunteers, setVolunteers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: 'ALL',
    category: 'ALL',
    volunteer: 'ALL',
    dateFrom: '',
    dateTo: '',
  });

  const loadReferenceData = useCallback(async () => {
    const [catsRes, profilesRes] = await Promise.all([
      supabase.from('categories').select('*').is('parent_id', null).order('order, name'),
      supabase.from('profiles').select('id, name, email, role, volunteer_type, status').order('name'),
    ]);
    setParentCategories((catsRes.data as Category[] | null) ?? []);
    setVolunteers((profilesRes.data as Profile[] | null) ?? []);
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('hour_entries')
      .select(
        'id, date, hours, status, reflection, rejection_reason, approved_at, created_at, volunteer:profiles!hour_entries_volunteer_id_fkey(name, email, role, volunteer_type), approver:profiles!hour_entries_approver_id_fkey(name), team:beneficiary_teams(name), category:categories!hour_entries_category_id_fkey(name), sub_category:categories!hour_entries_sub_category_id_fkey(name)'
      )
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }
    if (filters.category !== 'ALL') {
      query = query.eq('category_id', filters.category);
    }
    if (filters.volunteer !== 'ALL') {
      query = query.eq('volunteer_id', filters.volunteer);
    }
    if (filters.dateFrom) {
      query = query.gte('date', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte('date', filters.dateTo);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Could not load report data.');
      setEntries([]);
    } else {
      const rows = ((data as unknown[]) ?? []).map((e) => {
        const vol = (e as Record<string, unknown>).volunteer as Record<string, unknown> | null;
        const appr = (e as Record<string, unknown>).approver as Record<string, unknown> | null;
        const tm = (e as Record<string, unknown>).team as Record<string, unknown> | null;
        const cat = (e as Record<string, unknown>).category as Record<string, unknown> | null;
        const sub = (e as Record<string, unknown>).sub_category as Record<string, unknown> | null;
        return {
          ...(e as unknown as HourEntry),
          volunteer_name: (vol?.name as string) ?? '—',
          volunteer_email: (vol?.email as string) ?? '—',
          volunteer_role: (vol?.role as string) ?? '—',
          volunteer_type: (vol?.volunteer_type as string) ?? null,
          team_name: (tm?.name as string) ?? '—',
          category_name: (cat?.name as string) ?? '—',
          sub_category_name: (sub?.name as string) ?? null,
          approver_name: (appr?.name as string) ?? null,
        } as ReportRow;
      });
      setEntries(rows);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const stats = entries.reduce(
    (acc, e) => {
      const h = Number(e.hours);
      if (e.status === 'APPROVED') {
        acc.approvedHours += h;
        acc.approvedCount++;
      } else if (e.status === 'PENDING') {
        acc.pendingHours += h;
        acc.pendingCount++;
      } else if (e.status === 'REJECTED') {
        acc.rejectedCount++;
      }
      acc.totalHours += h;
      return acc;
    },
    { approvedHours: 0, pendingHours: 0, approvedCount: 0, pendingCount: 0, rejectedCount: 0, totalHours: 0 }
  );

  const uniqueVolunteers = new Set(entries.map((e) => e.volunteer_id)).size;

  // Text volunteers type (reflections, names, school names) ends up in a file an
  // admin opens in a spreadsheet. A value starting with =, +, -, @, tab or CR is
  // treated as a formula there, so prefix it with a quote to keep it plain text.
  function csvCell(value: string) {
    const text = value ?? '';
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  function exportCSV() {
    const headers = [
      'Volunteer',
      'Email',
      'Role',
      'Type',
      'Date',
      'Hours',
      'Status',
      'Category',
      'Sub-category',
      'Team',
      'Approver',
      'Approved At',
      'Reflection',
      'Rejection Reason',
    ];

    const rows = entries.map((e) => [
      e.volunteer_name,
      e.volunteer_email,
      roleLabel(e.volunteer_role),
      e.volunteer_type ? volunteerTypeLabel(e.volunteer_type) : '',
      e.date,
      String(e.hours),
      statusLabel(e.status),
      e.category_name,
      e.sub_category_name || '',
      e.team_name,
      e.approver_name || '',
      e.approved_at ? formatDate(e.approved_at) : '',
      (e.reflection || ''),
      (e.rejection_reason || ''),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => csvCell(String(cell ?? ''))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seva-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported as CSV.');
  }

  function printReport() {
    window.print();
  }

  function clearFilters() {
    setFilters({ status: 'ALL', category: 'ALL', volunteer: 'ALL', dateFrom: '', dateTo: '' });
  }

  const hasActiveFilters =
    filters.status !== 'ALL' || filters.category !== 'ALL' || filters.volunteer !== 'ALL' || filters.dateFrom || filters.dateTo;

  const summaryCards = [
    { label: 'Total entries', value: String(entries.length), icon: FileBarChart, tint: 'text-primary' },
    { label: 'Approved hours', value: formatHours(stats.approvedHours), suffix: 'hrs', icon: CheckCircle2, tint: 'text-success' },
    { label: 'Pending hours', value: formatHours(stats.pendingHours), suffix: 'hrs', icon: Clock, tint: 'text-warning-foreground' },
    { label: 'Volunteers', value: String(uniqueVolunteers), icon: Users, tint: 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Reports</h1>
          <p className="mt-1 text-muted-foreground">
            Build filterable reports, export CSV, and generate printable verification letters.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={entries.length === 0}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={printReport} disabled={entries.length === 0}>
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        {summaryCards.map((c) => (
          <Card key={c.label} className="border-border/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {c.value}
                  {c.suffix && <span className="text-sm font-normal text-muted-foreground"> {c.suffix}</span>}
                </p>
              </div>
              <c.icon className={`h-8 w-8 ${c.tint}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-border/60 print:hidden">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              >
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select
                value={filters.category}
                onValueChange={(v) => setFilters((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All categories</SelectItem>
                  {parentCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Volunteer</Label>
              <Select
                value={filters.volunteer}
                onValueChange={(v) => setFilters((f) => ({ ...f, volunteer: v }))}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All volunteers</SelectItem>
                  {volunteers.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="flex h-10 w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="flex h-10 w-[150px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Report table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 print:hidden">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed border-border print:hidden">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileBarChart className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No entries match your filters</p>
            <p className="mt-1 text-sm text-muted-foreground">Adjust your filters to see results.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60">
          <CardHeader className="print:hidden">
            <CardTitle className="text-lg">Service Hours Report</CardTitle>
            <CardDescription>{entries.length} entries</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Print header */}
            <div className="hidden print:block p-6">
              <h1 className="font-display text-2xl font-bold">Vrindavan Volunteer Hour Tracking System — Service Hours Report</h1>
              <p className="text-sm text-muted-foreground">Generated on {formatDate(new Date())}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr className="text-left text-xs font-medium text-muted-foreground">
                    <th className="px-4 py-2.5">Volunteer</th>
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Hours</th>
                    <th className="px-4 py-2.5">Category</th>
                    <th className="px-4 py-2.5">Team</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 print:hidden">Approver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {entries.map((e) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{e.volunteer_name}</div>
                        <div className="text-xs text-muted-foreground">{roleLabel(e.volunteer_role)}</div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{formatDate(e.date)}</td>
                      <td className="px-4 py-2.5 font-semibold tabular-nums">{formatHours(e.hours)}</td>
                      <td className="px-4 py-2.5">
                        {e.category_name}
                        {e.sub_category_name ? ` / ${e.sub_category_name}` : ''}
                      </td>
                      <td className="px-4 py-2.5">{e.team_name}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            e.status === 'APPROVED'
                              ? 'bg-success/15 text-success'
                              : e.status === 'PENDING'
                                ? 'bg-warning/15 text-warning-foreground'
                                : 'bg-destructive/15 text-destructive'
                          }`}
                        >
                          {statusLabel(e.status)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground print:hidden">
                        {e.approver_name ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
