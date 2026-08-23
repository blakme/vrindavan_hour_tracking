'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, Milestone, Category, MilestoneScope } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  Trophy,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  CalendarDays,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatHours, formatDate, toDateInputValue } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);

  const [form, setForm] = useState({
    name: '',
    target_hours: '100',
    period_start: toDateInputValue(new Date(new Date().getFullYear(), 0, 1)),
    period_end: toDateInputValue(new Date(new Date().getFullYear(), 11, 31)),
    scope: 'GLOBAL' as MilestoneScope,
    category_id: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    const [msRes, catsRes] = await Promise.all([
      supabase.from('milestones').select('*, category:categories(name)').order('period_end', { ascending: false }),
      supabase.from('categories').select('*').is('parent_id', null).eq('is_active', true).order('order, name'),
    ]);
    setMilestones(msRes.data as Milestone[] | []);
    setParentCategories(catsRes.data as Category[] | []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNewForm() {
    setEditingId(null);
    setForm({
      name: '',
      target_hours: '100',
      period_start: toDateInputValue(new Date(new Date().getFullYear(), 0, 1)),
      period_end: toDateInputValue(new Date(new Date().getFullYear(), 11, 31)),
      scope: 'GLOBAL',
      category_id: '',
    });
    setShowForm(true);
  }

  function openEditForm(ms: Milestone) {
    setEditingId(ms.id);
    setForm({
      name: ms.name,
      target_hours: String(ms.target_hours),
      period_start: toDateInputValue(ms.period_start),
      period_end: toDateInputValue(ms.period_end),
      scope: ms.scope,
      category_id: ms.category_id || '',
    });
    setShowForm(true);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    const targetNum = parseFloat(form.target_hours);
    if (isNaN(targetNum) || targetNum <= 0) {
      toast.error('Target hours must be a positive number.');
      return;
    }
    if (form.period_end < form.period_start) {
      toast.error('End date must be after start date.');
      return;
    }
    if (form.scope === 'CATEGORY' && !form.category_id) {
      toast.error('Please select a category for category-scoped milestones.');
      return;
    }

    setFormLoading(true);
    const payload = {
      name: form.name.trim(),
      target_hours: targetNum,
      period_start: form.period_start,
      period_end: form.period_end,
      scope: form.scope,
      category_id: form.scope === 'CATEGORY' ? form.category_id : null,
    };

    if (editingId) {
      const { error } = await supabase.from('milestones').update(payload).eq('id', editingId);
      if (error) {
        toast.error('Could not save milestone.');
      } else {
        toast.success('Milestone updated.');
      }
    } else {
      const { error } = await supabase.from('milestones').insert(payload);
      if (error) {
        toast.error('Could not create milestone.');
      } else {
        toast.success('Milestone created.');
      }
    }

    setFormLoading(false);
    setShowForm(false);
    loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from('milestones').delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Could not delete milestone.');
    } else {
      toast.success('Milestone deleted.');
      loadData();
    }
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Milestones</h1>
          <p className="mt-1 text-muted-foreground">
            Configure target-hour goals per period, globally or per category.
          </p>
        </div>
        <Button onClick={openNewForm}>
          <Plus className="mr-2 h-4 w-4" />
          New milestone
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : milestones.length === 0 ? (
        <Card className="border-dashed border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Trophy className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No milestones configured</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a milestone to set a service-hour goal for your volunteers.
            </p>
            <Button size="sm" className="mt-4" onClick={openNewForm}>
              <Plus className="mr-1 h-4 w-4" />
              Create milestone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {milestones.map((ms) => (
            <Card key={ms.id} className="border-border/60">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Trophy className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{ms.name}</CardTitle>
                      <CardDescription className="mt-0.5">
                        {formatDate(ms.period_start)} – {formatDate(ms.period_end)}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(ms)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget(ms)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Target</span>
                    </div>
                    <span className="font-display text-xl font-semibold tabular-nums">
                      {formatHours(ms.target_hours)} hrs
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={ms.scope === 'GLOBAL' ? 'default' : 'secondary'}>
                      {ms.scope === 'GLOBAL' ? 'Global' : ms.category?.name ?? 'Category'}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {new Date(ms.period_end) > new Date() ? 'Active' : 'Ended'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit milestone' : 'New milestone'}</DialogTitle>
            <DialogDescription>
              Set a target-hour goal for a time period. Choose global or category-specific scope.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitForm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ms-name">Name</Label>
              <Input
                id="ms-name"
                required
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Annual Seva Goal 2026"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-target">Target hours</Label>
              <Input
                id="ms-target"
                type="number"
                step="0.25"
                min="0.25"
                required
                value={form.target_hours}
                onChange={(e) => setForm((f) => ({ ...f, target_hours: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ms-start">Period start</Label>
                <Input
                  id="ms-start"
                  type="date"
                  required
                  value={form.period_start}
                  onChange={(e) => setForm((f) => ({ ...f, period_start: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ms-end">Period end</Label>
                <Input
                  id="ms-end"
                  type="date"
                  required
                  value={form.period_end}
                  onChange={(e) => setForm((f) => ({ ...f, period_end: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-scope">Scope</Label>
              <Select
                value={form.scope}
                onValueChange={(v) => setForm((f) => ({ ...f, scope: v as MilestoneScope }))}
              >
                <SelectTrigger id="ms-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GLOBAL">Global (all volunteers)</SelectItem>
                  <SelectItem value="CATEGORY">Specific category</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.scope === 'CATEGORY' && (
              <div className="space-y-2">
                <Label htmlFor="ms-category">Category</Label>
                <Select
                  value={form.category_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}
                >
                  <SelectTrigger id="ms-category">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingId ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete milestone?</DialogTitle>
            <DialogDescription>
              This will permanently remove &ldquo;{deleteTarget?.name}&rdquo;. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
