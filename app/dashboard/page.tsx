'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { supabase, HourEntry, Milestone } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Clock,
  CheckCircle2,
  Hourglass,
  TrendingUp,
  ArrowRight,
  CalendarDays,
  PieChart as PieChartIcon,
  Activity,
} from 'lucide-react';
import { formatHours, roleLabel, statusLabel, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export const dynamic = 'force-dynamic';

interface PendingApprovalEntry {
  id: string;
  date: string;
  hours: number;
  volunteer_id: string;
  volunteer_name: string;
  category_name: string | null;
  sub_category_name: string | null;
}

interface MonthlyPoint {
  month: string;
  hours: number;
}

interface CategorySlice {
  name: string;
  hours: number;
}

const CHART_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--success))',
];

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function DashboardHome() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<{
    approved: number;
    pending: number;
    rejected: number;
    thisWeek: number;
    milestone?: { target: number; approved: number; name: string } | null;
    recent: HourEntry[];
  }>({ approved: 0, pending: 0, rejected: 0, thisWeek: 0, milestone: null, recent: [] });
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApprovalEntry[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [monthlyData, setMonthlyData] = useState<MonthlyPoint[]>([]);
  const [categoryData, setCategoryData] = useState<CategorySlice[]>([]);

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const isAdmin = profile.role === 'ADMIN';
      const volunteerFilter = isAdmin ? null : profile.id;

      let recentQ = supabase
        .from('hour_entries')
        .select('id, date, hours, status, volunteer_id, category:categories!hour_entries_category_id_fkey(name), sub_category:categories!hour_entries_sub_category_id_fkey(name), volunteer:profiles!hour_entries_volunteer_id_fkey(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      if (volunteerFilter) recentQ = recentQ.eq('volunteer_id', volunteerFilter);

      let allQ = supabase
        .from('hour_entries')
        .select('hours, status, date, category:categories!hour_entries_category_id_fkey(name)');
      if (volunteerFilter) allQ = allQ.eq('volunteer_id', volunteerFilter);

      const [recentRes, allRes, milestonesRes] = await Promise.all([
        recentQ,
        allQ,
        supabase
          .from('milestones')
          .select('id, name, target_hours, period_start, period_end, scope')
          .eq('scope', 'GLOBAL')
          .order('period_end', { ascending: false })
          .limit(1),
      ]);

      const all = (recentRes.data ?? []) as unknown as HourEntry[];

      const mine = (allRes.data ?? []) as unknown as { hours: number; status: string; date: string; category: { name: string } | null }[];
      const totalApproved = mine
        .filter((e) => e.status === 'APPROVED')
        .reduce((s, e) => s + Number(e.hours), 0);
      const totalPending = mine
        .filter((e) => e.status === 'PENDING')
        .reduce((s, e) => s + Number(e.hours), 0);
      const totalRejected = mine.filter((e) => e.status === 'REJECTED').length;
      const thisWeek = mine
        .filter((e) => e.status === 'APPROVED' && new Date(e.date) >= weekAgo)
        .reduce((s, e) => s + Number(e.hours), 0);

      const ms = ((milestonesRes.data ?? [])[0] as Milestone | undefined);

      let periodApproved = 0;
      if (ms) {
        const periodMine = mine.filter(
          (e) =>
            e.status === 'APPROVED' &&
            new Date(e.date) >= new Date(ms.period_start) &&
            new Date(e.date) <= new Date(ms.period_end)
        );
        periodApproved = periodMine.reduce((s, e) => s + Number(e.hours), 0);
      }

      // --- Build monthly trend (last 6 months, approved only) ---
      const now = new Date();
      const months: Date[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d);
      }
      const monthlyMap = new Map<string, number>();
      for (const m of months) {
        monthlyMap.set(monthLabel(m), 0);
      }
      for (const e of mine) {
        if (e.status !== 'APPROVED') continue;
        const d = new Date(e.date);
        const label = monthLabel(d);
        if (monthlyMap.has(label)) {
          monthlyMap.set(label, monthlyMap.get(label)! + Number(e.hours));
        }
      }
      setMonthlyData(months.map((m) => ({ month: monthLabel(m), hours: monthlyMap.get(monthLabel(m))! })));

      // --- Build category breakdown (approved hours by parent category) ---
      const catMap = new Map<string, number>();
      for (const e of mine) {
        if (e.status !== 'APPROVED') continue;
        const name = e.category?.name ?? 'Uncategorized';
        catMap.set(name, (catMap.get(name) ?? 0) + Number(e.hours));
      }
      const catSlices = Array.from(catMap.entries())
        .map(([name, hours]) => ({ name, hours }))
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 7);
      setCategoryData(catSlices);

      setStats({
        approved: totalApproved,
        pending: totalPending,
        rejected: totalRejected,
        thisWeek,
        milestone: ms
          ? { target: Number(ms.target_hours), approved: periodApproved, name: ms.name }
          : null,
        recent: all,
      });
      setLoading(false);
    })();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    if (profile.role !== 'ADMIN' && profile.role !== 'GROUP_LEAD') {
      setPendingLoading(false);
      return;
    }
    (async () => {
      setPendingLoading(true);
      let query = supabase
        .from('hour_entries')
        .select(
          'id, date, hours, volunteer_id, category:categories!hour_entries_category_id_fkey(name), sub_category:categories!hour_entries_sub_category_id_fkey(name), volunteer:profiles!hour_entries_volunteer_id_fkey(name)'
        )
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(10);

      if (profile.role === 'GROUP_LEAD') {
        query = query.neq('volunteer_id', profile.id);
      }

      const { data, error } = await query;
      if (error) {
        setPendingApprovals([]);
      } else {
        const mapped = (data ?? []).map((e: any) => ({
          id: e.id,
          date: e.date,
          hours: Number(e.hours),
          volunteer_id: e.volunteer_id,
          volunteer_name: (e.volunteer as any)?.name ?? 'Unknown',
          category_name: (e.category as any)?.name ?? null,
          sub_category_name: (e.sub_category as any)?.name ?? null,
        }));
        setPendingApprovals(mapped);
      }
      setPendingLoading(false);
    })();
  }, [profile]);

  if (!profile) return null;

  const pct =
    stats.milestone && stats.milestone.target > 0
      ? Math.min(100, Math.round((stats.milestone.approved / stats.milestone.target) * 100))
      : 0;

  const cards = [
    {
      label: 'Approved hours',
      value: formatHours(stats.approved),
      icon: CheckCircle2,
      tint: 'text-success',
    },
    {
      label: 'Pending hours',
      value: formatHours(stats.pending),
      icon: Hourglass,
      tint: 'text-warning-foreground',
    },
    {
      label: 'This week',
      value: formatHours(stats.thisWeek),
      icon: TrendingUp,
      tint: 'text-primary',
    },
    {
      label: 'Rejected entries',
      value: String(stats.rejected),
      icon: Clock,
      tint: 'text-muted-foreground',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Hari Om, {profile.name.split(' ')[0]}.
        </h1>
        <p className="mt-1 text-muted-foreground">
          You&apos;re signed in as {roleLabel(profile.role)}.{' '}
          {profile.role === 'ADMIN'
            ? "Here's the organization-wide service summary."
            : "Here's your service summary."}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">{c.label}</span>
                <c.icon className={`h-4 w-4 ${c.tint}`} />
              </div>
              <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
                {loading ? '—' : c.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row: monthly trend + category donut */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Hours trend
            </CardTitle>
            <CardDescription>Approved service hours over the last 6 months.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[260px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : monthlyData.length === 0 || monthlyData.every((d) => d.hours === 0) ? (
              <div className="flex h-[260px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No approved hours yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={monthlyData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
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
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [`${formatHours(value)} hrs`, 'Approved']}
                  />
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2.5}
                    fill="url(#hoursGrad)"
                    dot={{ r: 3, fill: 'hsl(var(--chart-1))', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              By category
            </CardTitle>
            <CardDescription>Approved hours split by service category.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[260px] items-center justify-center">
                <p className="text-sm text-muted-foreground">Loading…</p>
              </div>
            ) : categoryData.length === 0 ? (
              <div className="flex h-[260px] items-center justify-center">
                <p className="text-sm text-muted-foreground">No approved hours yet.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                    formatter={(value: number, _name: string, props: any) => [
                      `${formatHours(value)} hrs`,
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

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Milestone */}
        <Card className="lg:col-span-2 border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              {stats.milestone?.name ?? 'Milestone'}
            </CardTitle>
            <CardDescription>
              Approved hours toward your annual seva goal. Pending hours aren&apos;t counted yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.milestone ? (
              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <span className="font-display text-4xl font-semibold tabular-nums">
                    {formatHours(stats.milestone.approved)}
                    <span className="text-lg font-normal text-muted-foreground">
                      {' '}/ {formatHours(stats.milestone.target)} hrs
                    </span>
                  </span>
                  <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">
                    {pct}%
                  </span>
                </div>
                <Progress value={pct} className="h-3" />
                <p className="text-sm text-muted-foreground">
                  {pct >= 100
                    ? 'Goal achieved — wonderful seva!'
                    : `${formatHours(Math.max(0, stats.milestone.target - stats.milestone.approved))} hrs to go.`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active milestones configured.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick actions */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/dashboard/hours" className="block">
              <Button variant="outline" className="w-full justify-between">
                Log service hours
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            {profile.role !== 'VOLUNTEER' && (
              <Link href="/dashboard/approvals" className="block">
                <Button variant="outline" className="w-full justify-between">
                  Review approvals
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            )}
            {profile.role === 'ADMIN' && (
              <>
                <Link href="/dashboard/admin/users" className="block">
                  <Button variant="outline" className="w-full justify-between">
                    Manage users
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/dashboard/reports" className="block">
                  <Button variant="outline" className="w-full justify-between">
                    Reports & exports
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent entries */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent entries</CardTitle>
            <CardDescription>
              {profile.role === 'ADMIN'
                ? 'The latest logged service hours across all volunteers.'
                : 'Your latest logged service hours.'}
            </CardDescription>
          </div>
          <Link href="/dashboard/hours">
            <Button variant="ghost" size="sm">
              View all
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : stats.recent.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Clock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No entries yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Log your first service hours to see them here.
              </p>
              <Link href="/dashboard/hours" className="mt-3 inline-block">
                <Button size="sm">Log hours</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.recent.map((e) => {
                const vol = (e as unknown as { volunteer?: { name?: string } }).volunteer;
                return (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {profile.role === 'ADMIN' && vol?.name ? `${vol.name} — ` : ''}
                      {e.category?.name ?? '—'}
                      {e.sub_category ? ` / ${e.sub_category.name}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(e.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatHours(e.hours)} hrs
                    </span>
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
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending approvals — admins and category leads */}
      {profile.role !== 'VOLUNTEER' && (
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-warning-foreground" />
                Approvals awaiting review
              </CardTitle>
              <CardDescription>
                {profile.role === 'ADMIN'
                  ? 'Pending hour entries across all categories.'
                  : 'Pending entries for the categories you lead.'}
              </CardDescription>
            </div>
            <Link href="/dashboard/approvals">
              <Button variant="ghost" size="sm">
                Review all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {pendingLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pendingApprovals.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-success" />
                <p className="text-sm font-medium">No pending approvals</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  All caught up! New submissions will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingApprovals.map((e) => (
                  <Link key={e.id} href="/dashboard/approvals" className="block">
                    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-4 py-3 transition-colors hover:bg-card/80">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{e.volunteer_name}</span>
                          <Badge variant="secondary" className="text-xs">Pending</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDate(e.date)}
                          {e.category_name ? ` · ${e.category_name}` : ''}
                          {e.sub_category_name ? ` / ${e.sub_category_name}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums">
                        {formatHours(e.hours)} hrs
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
