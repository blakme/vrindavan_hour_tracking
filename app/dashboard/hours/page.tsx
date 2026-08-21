'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, HourEntry, BeneficiaryTeam, Category, UserCategoryAssignment, EntryStatus, Profile } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Plus,
  Clock,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Hourglass,
  XCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatHours, formatDate, toDateInputValue, statusLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface FilterState {
  status: EntryStatus | 'ALL';
  category: string | 'ALL';
  volunteer: string | 'ALL';
  dateFrom: string;
  dateTo: string;
}

export default function MyHoursPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';
  const [entries, setEntries] = useState<HourEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<BeneficiaryTeam[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subCategories, setSubCategories] = useState<Category[]>([]);
  const [assignedCategoryIds, setAssignedCategoryIds] = useState<Set<string>>(new Set());
  const [volunteers, setVolunteers] = useState<Profile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HourEntry | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    status: 'ALL',
    category: 'ALL',
    volunteer: 'ALL',
    dateFrom: '',
    dateTo: '',
  });

  const [formData, setFormData] = useState({
    date: toDateInputValue(new Date()),
    hours: '1',
    team_id: '',
    category_id: '',
    sub_category_id: '',
    reflection: '',
    volunteer_id: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadReferenceData = useCallback(async () => {
    if (!profile) return;
    const [teamsRes, catsRes] = await Promise.all([
      supabase.from('beneficiary_teams').select('*').eq('is_active', true).order('name'),
      supabase.from('categories').select('*').eq('is_active', true).order('order, name'),
    ]);

    setTeams((teamsRes.data as BeneficiaryTeam[] | null) ?? []);
    setCategories((catsRes.data as Category[] | null) ?? []);

    if (profile.role !== 'ADMIN') {
      const { data: assignments } = await supabase
        .from('user_category_assignments')
        .select('category_id')
        .eq('user_id', profile.id);
      setAssignedCategoryIds(new Set((assignments ?? []).map((a: { category_id: string }) => a.category_id)));
    } else {
      const { data: volData } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'ACTIVE')
        .order('name');
      setVolunteers((volData as Profile[] | null) ?? []);
    }
  }, [profile]);

  const loadEntries = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let query = supabase
      .from('hour_entries')
      .select(
        'id, date, hours, team_id, category_id, sub_category_id, reflection, status, approver_id, approved_at, rejection_reason, created_at, updated_at, volunteer_id, team:beneficiary_teams(name), category:categories!hour_entries_category_id_fkey(name), sub_category:categories!hour_entries_sub_category_id_fkey(name)'
      )
      .order('date', { ascending: false })
      .order('created_at', { ascending: false });

    if (!isAdmin) {
      query = query.eq('volunteer_id', profile.id);
    }

    if (filters.status !== 'ALL') {
      query = query.eq('status', filters.status);
    }
    if (filters.category !== 'ALL') {
      query = query.eq('category_id', filters.category);
    }
    if (isAdmin && filters.volunteer !== 'ALL') {
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
      toast.error('Could not load your hours.');
    } else {
      setEntries(data as unknown as HourEntry[]);
    }
    setLoading(false);
  }, [profile, filters, isAdmin]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (formData.category_id) {
      const subs = categories.filter((c) => c.parent_id === formData.category_id);
      setSubCategories(subs);
    } else {
      setSubCategories([]);
    }
  }, [formData.category_id, categories]);

  const totals = entries.reduce(
    (acc, e) => {
      const h = Number(e.hours);
      if (e.status === 'APPROVED') acc.approved += h;
      else if (e.status === 'PENDING') acc.pending += h;
      else if (e.status === 'REJECTED') acc.rejected += h;
      return acc;
    },
    { approved: 0, pending: 0, rejected: 0 }
  );

  const parentCategories = categories.filter((c) => c.parent_id === null);

  function openNewForm() {
    setEditingEntry(null);
    setFormData({
      date: toDateInputValue(new Date()),
      hours: '1',
      team_id: '',
      category_id: '',
      sub_category_id: '',
      reflection: '',
      volunteer_id: isAdmin ? '' : profile?.id ?? '',
    });
    setFormError(null);
    setShowForm(true);
  }

  function openEditForm(entry: HourEntry) {
    setEditingEntry(entry);
    setFormData({
      date: toDateInputValue(entry.date),
      hours: String(entry.hours),
      team_id: entry.team_id,
      category_id: entry.category_id,
      sub_category_id: entry.sub_category_id || '',
      reflection: entry.reflection || '',
      volunteer_id: entry.volunteer_id,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    const hoursNum = parseFloat(formData.hours);
    if (isNaN(hoursNum) || hoursNum < 0.25 || hoursNum > 24) {
      setFormError('Hours must be between 0.25 and 24.');
      return;
    }
    if (!formData.team_id || !formData.category_id) {
      setFormError('Please select a category and a beneficiary team.');
      return;
    }
    if (isAdmin && !formData.volunteer_id) {
      setFormError('Please select a volunteer.');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    const payload = {
      volunteer_id: isAdmin ? formData.volunteer_id : profile.id,
      date: formData.date,
      hours: hoursNum,
      team_id: formData.team_id,
      category_id: formData.category_id,
      sub_category_id: formData.sub_category_id || null,
      reflection: formData.reflection.trim() || null,
    };

    if (editingEntry) {
      // volunteer_id is not editable after creation and is not client-writable
      // on update, so it is deliberately left out of the update payload.
      const { volunteer_id: _omit, ...updatePayload } = payload;
      const { error } = await supabase
        .from('hour_entries')
        .update(updatePayload)
        .eq('id', editingEntry.id);
      if (error) {
        console.error('hour entry update failed', error);
        setFormError('Could not save this entry. Please check the details and try again.');
        setFormLoading(false);
        return;
      }
      toast.success('Entry updated.');
    } else {
      const { error } = await supabase.from('hour_entries').insert(payload);
      if (error) {
        console.error('hour entry insert failed', error);
        setFormError('Could not log these hours. Please check the details and try again.');
        setFormLoading(false);
        return;
      }
      toast.success('Hours logged.');
    }

    setFormLoading(false);
    setShowForm(false);
    loadEntries();
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await supabase.from('hour_entries').delete().eq('id', deleteId);
    if (error) {
      toast.error('Could not delete entry. Only pending entries can be deleted.');
    } else {
      toast.success('Entry deleted.');
      setEntries((prev) => prev.filter((e) => e.id !== deleteId));
    }
    setDeleteId(null);
  }

  function clearFilters() {
    setFilters({ status: 'ALL', category: 'ALL', volunteer: 'ALL', dateFrom: '', dateTo: '' });
  }

  const hasActiveFilters =
    filters.status !== 'ALL' || filters.category !== 'ALL' || filters.volunteer !== 'ALL' || filters.dateFrom || filters.dateTo;

  const summaryCards = [
    { label: 'Approved', value: formatHours(totals.approved), suffix: 'hrs', icon: CheckCircle2, tint: 'text-success' },
    { label: 'Pending', value: formatHours(totals.pending), suffix: 'hrs', icon: Hourglass, tint: 'text-warning-foreground' },
    { label: 'Rejected', value: formatHours(totals.rejected), suffix: 'hrs', icon: XCircle, tint: 'text-destructive' },
  ];

  const visibleParentCategories = parentCategories.filter(
    (c) => isAdmin || assignedCategoryIds.has(c.id) || assignedCategoryIds.size === 0
  );

  const isApproved = profile?.status === 'ACTIVE';
  const isPendingApproval = profile?.status === 'PENDING_APPROVAL';

  const canLogHours = isAdmin || isApproved;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">{isAdmin ? 'All Hours' : 'My Hours'}</h1>
          <p className="mt-1 text-muted-foreground">
            {isAdmin ? 'Log and manage service hours for all volunteers.' : 'Log service hours, filter your timesheet, and track progress.'}
          </p>
        </div>
        <Button onClick={openNewForm} disabled={!canLogHours}>
          <Plus className="mr-2 h-4 w-4" />
          {isAdmin ? 'Log hours' : 'Log hours'}
        </Button>
      </div>

      {isPendingApproval && !isAdmin && (
        <Card className="border-warning/40 bg-warning/10">
          <CardContent className="flex items-start gap-3 p-4">
            <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
            <div>
              <p className="text-sm font-medium text-warning-foreground">Account pending approval</p>
              <p className="mt-1 text-sm text-muted-foreground">
                An admin needs to approve your account before you can log service hours.
                You will be able to submit entries once your account is activated.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isApproved && !isPendingApproval && !isAdmin && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="flex items-start gap-3 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Account inactive</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Your account is currently inactive. Please contact an admin to reactivate it.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((c) => (
          <Card key={c.label} className="border-border/60">
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{c.label}</p>
                <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                  {c.value}
                  <span className="text-sm font-normal text-muted-foreground"> {c.suffix}</span>
                </p>
              </div>
              <c.icon className={`h-8 w-8 ${c.tint}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) => setFilters((f) => ({ ...f, status: v as EntryStatus | 'ALL' }))}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
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

            {isAdmin && (
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
            )}

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                className="w-[160px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                className="w-[160px]"
              />
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Entries list */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg">Timesheet</CardTitle>
          <CardDescription>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
              <Clock className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No entries found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActiveFilters ? 'Try adjusting your filters.' : 'Log your first service hours to get started.'}
              </p>
              {!hasActiveFilters && (
                <Button size="sm" className="mt-4" onClick={openNewForm}>
                  <Plus className="mr-1 h-4 w-4" />
                  Log hours
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {entries.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-4 py-3 transition-colors hover:bg-card/80"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {e.category?.name ?? '—'}
                        {e.sub_category ? ` / ${e.sub_category.name}` : ''}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
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
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(e.date)}
                      {e.team?.name ? ` · ${e.team.name}` : ''}
                    </p>
                    {isAdmin && (
                      <p className="mt-0.5 text-xs font-medium text-foreground/70">
                        {volunteers.find((v) => v.id === e.volunteer_id)?.name ?? '—'}
                      </p>
                    )}
                    {e.reflection && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{e.reflection}</p>
                    )}
                    {e.status === 'REJECTED' && e.rejection_reason && (
                      <p className="mt-1 text-xs text-destructive">Reason: {e.rejection_reason}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {formatHours(e.hours)} hrs
                    </span>
                    {e.status === 'PENDING' && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditForm(e)}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(e.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEntry ? 'Edit entry' : 'Log service hours'}</DialogTitle>
            <DialogDescription>
              {editingEntry
                ? 'Update this pending entry. Approved entries cannot be edited.'
                : isAdmin
                  ? 'Record service hours on behalf of a volunteer for approval.'
                  : 'Record your service hours for approval by a category lead or admin.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitForm} className="space-y-4">
            {isAdmin && (
              <div className="space-y-2">
                <Label htmlFor="volunteer">Volunteer</Label>
                <Select
                  value={formData.volunteer_id}
                  onValueChange={(v) => setFormData((f) => ({ ...f, volunteer_id: v }))}
                  disabled={!!editingEntry}
                >
                  <SelectTrigger id="volunteer">
                    <SelectValue placeholder="Select a volunteer" />
                  </SelectTrigger>
                  <SelectContent>
                    {volunteers.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingEntry && (
                  <p className="text-xs text-muted-foreground">Volunteer cannot be changed after entry creation.</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hours">Hours</Label>
                <Input
                  id="hours"
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="24"
                  required
                  value={formData.hours}
                  onChange={(e) => setFormData((f) => ({ ...f, hours: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(v) => setFormData((f) => ({ ...f, category_id: v, sub_category_id: '' }))}
                >
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleParentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {visibleParentCategories.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No categories assigned. Ask an admin to assign you to a category.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="subcategory">Sub-category</Label>
                <Select
                  value={formData.sub_category_id}
                  onValueChange={(v) => setFormData((f) => ({ ...f, sub_category_id: v }))}
                  disabled={subCategories.length === 0}
                >
                  <SelectTrigger id="subcategory">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    {subCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="team">Beneficiary team</Label>
              <Select
                value={formData.team_id}
                onValueChange={(v) => setFormData((f) => ({ ...f, team_id: v }))}
              >
                <SelectTrigger id="team">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reflection">Reflection (optional)</Label>
              <Textarea
                id="reflection"
                rows={3}
                value={formData.reflection}
                onChange={(e) => setFormData((f) => ({ ...f, reflection: e.target.value }))}
                placeholder="What did you do during this service?"
              />
            </div>

            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingEntry ? 'Save changes' : 'Log hours'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
            <DialogDescription>
              This will permanently remove the entry. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
