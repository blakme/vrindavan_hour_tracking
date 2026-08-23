'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase, BeneficiaryTeam, Category } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  FolderTree,
  Plus,
  Edit2,
  Trash2,
  Users2,
  Layers,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

export const dynamic = 'force-dynamic';

type Tab = 'categories' | 'teams';

export default function ReferenceDataPage() {
  const [tab, setTab] = useState<Tab>('categories');
  const [teams, setTeams] = useState<BeneficiaryTeam[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<{ id: string; name: string; is_active: boolean; parent_id?: string | null } | null>(null);
  const [formName, setFormName] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; type: Tab } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [teamsRes, catsRes] = await Promise.all([
      supabase.from('beneficiary_teams').select('*').order('name'),
      supabase.from('categories').select('*').order('order, name'),
    ]);
    setTeams(teamsRes.data as BeneficiaryTeam[] | []);
    setCategories(catsRes.data as Category[] | []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function openNewForm() {
    setEditingItem(null);
    setFormName('');
    setFormActive(true);
    setFormParentId(null);
    setShowForm(true);
  }

  function openEditForm(item: { id: string; name: string; is_active: boolean; parent_id?: string | null }) {
    setEditingItem(item);
    setFormName(item.name);
    setFormActive(item.is_active);
    setFormParentId(item.parent_id ?? null);
    setShowForm(true);
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    setFormLoading(true);

    const table = tab === 'teams' ? 'beneficiary_teams' : 'categories';
    const payload: Record<string, unknown> = {
      name: formName.trim(),
      is_active: formActive,
    };
    if (tab === 'categories') {
      payload.parent_id = formParentId || null;
    }

    if (editingItem) {
      const { error } = await supabase.from(table).update(payload).eq('id', editingItem.id);
      if (error) {
        toast.error('Could not save changes.');
      } else {
        toast.success('Updated successfully.');
      }
    } else {
      const { error } = await supabase.from(table).insert(payload);
      if (error) {
        toast.error('Could not create item.');
      } else {
        toast.success('Created successfully.');
      }
    }

    setFormLoading(false);
    setShowForm(false);
    loadData();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const table = deleteTarget.type === 'teams' ? 'beneficiary_teams' : 'categories';
    const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id);
    if (error) {
      toast.error('Could not delete. It may be referenced by existing entries.');
    } else {
      toast.success('Deleted successfully.');
      loadData();
    }
    setDeleteTarget(null);
  }

  async function toggleActive(item: { id: string; is_active: boolean }, type: Tab) {
    const table = type === 'teams' ? 'beneficiary_teams' : 'categories';
    const { error } = await supabase.from(table).update({ is_active: !item.is_active }).eq('id', item.id);
    if (error) {
      toast.error('Could not toggle status.');
    } else {
      loadData();
    }
  }

  const parentCategories = categories.filter((c) => c.parent_id === null);
  const childCategories = categories.filter((c) => c.parent_id !== null);

  const tabs: { key: Tab; label: string; icon: typeof Layers; count: number }[] = [
    { key: 'categories', label: 'Categories', icon: Layers, count: categories.length },
    { key: 'teams', label: 'Beneficiary Teams', icon: Users2, count: teams.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Reference Data</h1>
        <p className="mt-1 text-muted-foreground">
          Manage the two-tier category hierarchy and beneficiary teams.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
            <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={openNewForm}>
          <Plus className="mr-2 h-4 w-4" />
          Add {tab === 'teams' ? 'team' : 'category'}
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tab === 'categories' ? (
        <div className="space-y-4">
          {parentCategories.map((parent) => (
            <Card key={parent.id} className="border-border/60">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{parent.name}</CardTitle>
                    {!parent.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={parent.is_active}
                      onCheckedChange={() => toggleActive(parent, 'categories')}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(parent)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={() => setDeleteTarget({ id: parent.id, name: parent.name, type: 'categories' })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {childCategories.filter((c) => c.parent_id === parent.id).length > 0 ? (
                  <div className="space-y-1.5 pl-7">
                    {childCategories
                      .filter((c) => c.parent_id === parent.id)
                      .map((child) => (
                        <div
                          key={child.id}
                          className="flex items-center justify-between rounded-md border border-border/40 px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm">{child.name}</span>
                            {!child.is_active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Switch
                              checked={child.is_active}
                              onCheckedChange={() => toggleActive(child, 'categories')}
                            />
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditForm(child)}>
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setDeleteTarget({ id: child.id, name: child.name, type: 'categories' })}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                ) : (
                  <p className="pl-7 text-sm text-muted-foreground">No sub-categories</p>
                )}
              </CardContent>
            </Card>
          ))}
          {parentCategories.length === 0 && (
            <Card className="border-dashed border-border">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">No categories yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create your first category to get started.</p>
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="border-border/60">
          <CardContent className="p-0">
            {teams.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users2 className="mb-3 h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-medium">No teams yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create your first one to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {teams.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.name}</span>
                      {!item.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={item.is_active}
                        onCheckedChange={() => toggleActive(item, 'teams')}
                      />
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditForm(item)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setDeleteTarget({ id: item.id, name: item.name, type: 'teams' })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create/Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit' : 'New'} {tab === 'teams' ? 'beneficiary team' : 'category'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitForm} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                autoFocus
              />
            </div>
            {tab === 'categories' && (
              <div className="space-y-2">
                <Label htmlFor="parent">Parent category (optional)</Label>
                <select
                  id="parent"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formParentId || ''}
                  onChange={(e) => setFormParentId(e.target.value || null)}
                >
                  <option value="">None (top-level)</option>
                  {parentCategories.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch id="active" checked={formActive} onCheckedChange={setFormActive} />
              <Label htmlFor="active">Active</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" disabled={formLoading}>
                {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingItem ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This will permanently remove it. If it&apos;s referenced by existing entries, deletion will fail.
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
