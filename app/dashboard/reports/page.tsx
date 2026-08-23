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
  FileSpreadsheet,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatHours, formatDate, roleLabel, volunteerTypeLabel, statusLabel } from '@/lib/format';
import { downloadXlsx } from '@/lib/export-xlsx';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

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

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--success))',
  'hsl(var(--warning))',
];

const STATUS_COLORS: Record<string, string> = {
  APPROVED: 'hsl(var(--success))',
  PENDING: 'hsl(var(--warning))',
  REJECTED: 'hsl(var(--destructive))',
};

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
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

  // --- Derive chart data from loaded entries ---

  // Category breakdown (approved hours by category)
  const categoryChartData = (() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.status !== 'APPROVED') continue;
      const name = e.category_name ?? 'Uncategorized';
      map.set(name, (map.get(name) ?? 0) + Number(e.hours));
    }
    return Array.from(map.entries())
      .map(([name, hours]) => ({ name, hours }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);
  })();

  // Monthly trend (last 12 months, all statuses for total, approved for approved line)
  const monthlyChartData = (() => {
    const now = new Date();
    const months: Date[] = [];
    for (let i = 11; i >= 0; i--) {
      months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
    const map = new Map<string, { total: number; approved: number }>();
    for (const m of months) {
      map.set(monthLabel(m), { total: 0, approved: 0 });
    }
    for (const e of entries) {
      const d = new Date(e.date);
      const label = monthLabel(d);
      if (map.has(label)) {
        const entry = map.get(label)!;
        entry.total += Number(e.hours);
        if (e.status === 'APPROVED') entry.approved += Number(e.hours);
      }
    }
    return months.map((m) => ({
      month: monthLabel(m),
      total: Math.round(map.get(monthLabel(m))!.total * 100) / 100,
      approved: Math.round(map.get(monthLabel(m))!.approved * 100) / 100,
    }));
  })();

  // Status distribution donut
  const statusChartData = (() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.status, (map.get(e.status) ?? 0) + 1);
    }
    return Array.from(map.entries()).map(([name, count]) => ({ name: statusLabel(name), count, raw: name }));
  })();

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

  const [exportXlsxLoading, setExportXlsxLoading] = useState(false);

  async function exportXlsx() {
    setExportXlsxLoading(true);
    const headers = [
      { header: 'Volunteer', key: 'volunteer_name' },
      { header: 'Email', key: 'volunteer_email' },
      { header: 'Role', key: 'role' },
      { header: 'Type', key: 'type' },
      { header: 'Date', key: 'date' },
      { header: 'Hours', key: 'hours' },
      { header: 'Status', key: 'status' },
      { header: 'Category', key: 'category_name' },
      { header: 'Sub-category', key: 'sub_category_name' },
      { header: 'Approver', key: 'approver_name' },
      { header: 'Approved At', key: 'approved_at' },
      { header: 'Reflection', key: 'reflection' },
      { header: 'Rejection Reason', key: 'rejection_reason' },
    ];

    const rows = entries.map((e) => ({
      volunteer_name: e.volunteer_name,
      volunteer_email: e.volunteer_email,
      role: roleLabel(e.volunteer_role),
      type: e.volunteer_type ? volunteerTypeLabel(e.volunteer_type) : '',
      date: e.date,
      hours: Number(e.hours),
      status: statusLabel(e.status),
      category_name: e.category_name,
      sub_category_name: e.sub_category_name || '',
      approver_name: e.approver_name || '',
      approved_at: e.approved_at ? formatDate(e.approved_at) : '',
      reflection: e.reflection || '',
      rejection_reason: e.rejection_reason || '',
    }));

    await downloadXlsx(rows, headers, `seva-report-${new Date().toISOString().split('T')[0]}`);
    toast.success('Report exported as Excel.');
    setExportXlsxLoading(false);
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

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
    fontSize: '13px',
  };

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
          <Button variant="outline" onClick={exportXlsx} disabled={entries.length === 0 || exportXlsxLoading}>
            {exportXlsxLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Export Excel
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

      {/* Charts section */}
      {!loading && entries.length > 0 && (
        <div className="space-y-6 print:hidden">
          {/* Row 1: Category bar chart + Status donut */}
          <div className="grid gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3 border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Hours by category
                </CardTitle>
                <CardDescription>Approved service hours broken down by category.</CardDescription>
              </CardHeader>
              <CardContent>
                {categoryChartData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center">
                    <p className="text-sm text-muted-foreground">No approved hours in this filter range.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={categoryChartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        width={120}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number) => [`${formatHours(value)} hrs`, 'Approved']}
                      />
                      <Bar dataKey="hours" radius={[0, 6, 6, 0]} barSize={22}>
                        {categoryChartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2 border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-primary" />
                  Entry status
                </CardTitle>
                <CardDescription>Distribution of all entries by review status.</CardDescription>
              </CardHeader>
              <CardContent>
                {statusChartData.length === 0 ? (
                  <div className="flex h-[280px] items-center justify-center">
                    <p className="text-sm text-muted-foreground">No entries to display.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={statusChartData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="45%"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {statusChartData.map((s) => (
                          <Cell key={s.name} fill={STATUS_COLORS[s.raw] ?? 'hsl(var(--chart-5))'} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: number, _name: string, props: any) => [
                          `${value} entries`,
                          props.payload.name,
                        ]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Monthly trend line chart */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Monthly hours trend
              </CardTitle>
              <CardDescription>
                Total and approved hours per month over the last 12 months.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyChartData} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value: number) => `${formatHours(value)} hrs`}
                  />
                  <Legend
                    iconType="line"
                    iconSize={16}
                    wrapperStyle={{ fontSize: '13px', color: 'hsl(var(--muted-foreground))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    name="Total hours"
                    stroke="hsl(var(--chart-3))"
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="approved"
                    name="Approved hours"
                    stroke="hsl(var(--success))"
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

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
