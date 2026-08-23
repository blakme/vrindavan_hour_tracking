'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, HourEntry, Category } from '@/lib/supabase';
import { approveEntry, rejectEntry } from '@/lib/admin-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Check,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatHours, formatDate, statusLabel, roleLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function ApprovalsPage() {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<HourEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    // Only admins can filter by category, so skip this query for group leads.
    if (profile?.role !== 'ADMIN') return;
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .is('parent_id', null)
      .order('order, name');
    if (error) {
      console.error('loadCategories failed', error);
      return;
    }
    setParentCategories((data as Category[] | null) ?? []);
  }, [profile?.role]);

  const loadEntries = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    let query = supabase
      .from('hour_entries')
      .select(
        'id, date, hours, team_id, category_id, sub_category_id, reflection, status, approver_id, approved_at, rejection_reason, created_at, updated_at, volunteer_id, volunteer:profiles!hour_entries_volunteer_id_fkey(name, email, role, volunteer_type), approver:profiles!hour_entries_approver_id_fkey(name), team:beneficiary_teams(name), category:categories!hour_entries_category_id_fkey(name), sub_category:categories!hour_entries_sub_category_id_fkey(name)'
      )
      .eq('status', tab)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (categoryFilter !== 'ALL') {
      query = query.eq('category_id', categoryFilter);
    }

    if (profile.role === 'GROUP_LEAD') {
      const { data: leadCats } = await supabase
        .from('category_lead_assignments')
        .select('category_id')
        .eq('user_id', profile.id);

      const ledCategoryIds = (leadCats ?? []).map((c: { category_id: string }) => c.category_id);
      if (ledCategoryIds.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }
      query = query.in('category_id', ledCategoryIds);
      // A group lead cannot review their own hours, so hide their own entries
      // from the approval list to prevent a confusing dead-end approve attempt.
      if (tab === 'PENDING') {
        query = query.neq('volunteer_id', profile.id);
      }
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Could not load entries.');
      setEntries([]);
    } else {
      setEntries((data as unknown as HourEntry[]) ?? []);
    }
    setLoading(false);
  }, [profile, tab, categoryFilter]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  async function handleApprove(entryId: string) {
    setActionLoading(entryId);
    const result = await approveEntry(entryId);
    if (result.success) {
      toast.success('Entry approved.');
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } else {
      toast.error(result.error || 'Could not approve entry.');
    }
    setActionLoading(null);
  }

  async function handleReject() {
    if (!rejectingId) return;
    setActionLoading(rejectingId);
    const result = await rejectEntry(rejectingId, rejectReason.trim());
    if (result.success) {
      toast.success('Entry rejected.');
      setEntries((prev) => prev.filter((e) => e.id !== rejectingId));
    } else {
      toast.error(result.error || 'Could not reject entry.');
    }
    setActionLoading(null);
    setRejectingId(null);
    setRejectReason('');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Approvals</h1>
        <p className="mt-1 text-muted-foreground">
          {profile?.role === 'ADMIN'
            ? 'Review pending hour entries across all categories. Approve or reject with a reason.'
            : 'Review pending hour entries for the categories you lead.'}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="PENDING" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Pending
          </TabsTrigger>
          <TabsTrigger value="APPROVED" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved
          </TabsTrigger>
          <TabsTrigger value="REJECTED" className="gap-1.5">
            <XCircle className="h-3.5 w-3.5" />
            Rejected
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Category filter */}
      {profile?.role === 'ADMIN' && (
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All categories</SelectItem>
              {parentCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Entries */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {tab === 'PENDING' ? 'No pending entries' : `No ${tab.toLowerCase()} entries`}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === 'PENDING'
                ? 'All caught up! New submissions will appear here.'
                : 'Entries that have been ' + tab.toLowerCase() + ' will show here.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((e) => {
            const vol = e.volunteer as unknown as { name: string; email: string; role: string; volunteer_type: string | null } | undefined;
            const approver = e.approver as unknown as { name: string } | null | undefined;
            return (
              <Card key={e.id} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Volunteer info */}
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{vol?.name ?? 'Unknown'}</span>
                        {vol?.role && (
                          <Badge variant="secondary" className="text-xs">
                            {roleLabel(vol.role)}
                          </Badge>
                        )}
                      </div>

                      {/* Entry details */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>{formatDate(e.date)}</span>
                        <span className="font-semibold text-foreground">{formatHours(e.hours)} hrs</span>
                        {e.category && (
                          <span>
                            {e.category.name}
                            {e.sub_category ? ` / ${e.sub_category.name}` : ''}
                          </span>
                        )}
                        <span>{e.team?.name ?? '—'}</span>
                      </div>

                      {e.reflection && (
                        <p className="text-sm text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
                          {e.reflection}
                        </p>
                      )}

                      {tab === 'REJECTED' && e.rejection_reason && (
                        <p className="text-sm text-destructive">
                          <strong>Reason:</strong> {e.rejection_reason}
                        </p>
                      )}

                      {tab !== 'PENDING' && approver && (
                        <p className="text-xs text-muted-foreground">
                          {tab === 'APPROVED' ? 'Approved' : 'Rejected'} by {approver.name}
                          {e.approved_at ? ` on ${formatDate(e.approved_at)}` : ''}
                        </p>
                      )}
                    </div>

                    {/* Actions */}
                    {tab === 'PENDING' && (
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(e.id)}
                          disabled={actionLoading === e.id}
                          className="bg-success hover:bg-success/90"
                        >
                          {actionLoading === e.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-3.5 w-3.5" />
                          )}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectingId(e.id);
                            setRejectReason('');
                          }}
                          disabled={actionLoading === e.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <XCircle className="mr-1 h-3.5 w-3.5" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(open) => !open && setRejectingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject entry</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this entry. The volunteer will see it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Please coordinate with the team lead before logging hours."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={!rejectReason.trim()}>
              Reject entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
