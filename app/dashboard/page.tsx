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
} from 'lucide-react';
import { formatHours, roleLabel, statusLabel, formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/badge';

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

  useEffect(() => {
    if (!profile) return;
    (async () => {
      setLoading(true);
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: entries } = await supabase
        .from('hour_entries')
        .select('id, date, hours, status, category:categories!hour_entries_category_id_fkey(name), sub_category:categories!hour_entries_sub_category_id_fkey(name)')
        .eq('volunteer_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(5);

      const all = (entries ?? []) as unknown as HourEntry[];
      const approved = all
        .filter((e) => e.status === 'APPROVED')
        .reduce((s, e) => s + Number(e.hours), 0);

      // Fetch full totals
      const { count: pendingCount } = await supabase
        .from('hour_entries')
        .select('id', { count: 'exact', head: true })
        .eq('volunteer_id', profile.id)
        .eq('status', 'PENDING');

      const { data: allMine } = await supabase
        .from('hour_entries')
        .select('hours, status, date')
        .eq('volunteer_id', profile.id);

      const mine = allMine ?? [];
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

      // Milestone progress — use first global milestone
      const { data: milestones } = await supabase
        .from('milestones')
        .select('id, name, target_hours, period_start, period_end, scope')
        .eq('scope', 'GLOBAL')
        .order('period_end', { ascending: false })
        .limit(1);
      const ms = (milestones ?? [])[0] as Milestone | undefined;

      // Calculate period-scoped approved hours for milestone
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
          You&apos;re signed in as {roleLabel(profile.role)}. Here&apos;s your service summary.
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
            <CardDescription>Your latest logged service hours.</CardDescription>
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
              {stats.recent.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
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
              ))}
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
