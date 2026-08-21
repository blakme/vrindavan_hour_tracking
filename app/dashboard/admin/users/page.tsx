'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, Profile, Category, UserCategoryAssignment, CategoryLeadAssignment, UserRole, UserStatus, VolunteerType } from '@/lib/supabase';
import { promoteUser, setUserStatus, adminUpdateProfile, adminUpdateEmail, adminUpdatePassword, adminCreateUser } from '@/lib/admin-actions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Users as UsersIcon,
  Search,
  UserCog,
  Plus,
  X,
  Loader2,
  Trash2,
  FolderTree,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { roleLabel, volunteerTypeLabel, formatDate, userStatusLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface UserWithAssignments extends Profile {
  categoryAssignments?: UserCategoryAssignment[];
  leadAssignments?: CategoryLeadAssignment[];
}

export default function UsersPage() {
  const { profile: currentUser } = useAuth();
  const [users, setUsers] = useState<UserWithAssignments[]>([]);
  const [loading, setLoading] = useState(true);
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [editingUser, setEditingUser] = useState<UserWithAssignments | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    volunteer_type: '',
    graduation_year: '',
    school_name: '',
    phone: '',
  });
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);

  // Category assignment management state
  const [managingCategoriesFor, setManagingCategoriesFor] = useState<UserWithAssignments | null>(null);
  const [userCategoryAssignments, setUserCategoryAssignments] = useState<UserCategoryAssignment[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Category lead management state
  const [managingLeadsFor, setManagingLeadsFor] = useState<UserWithAssignments | null>(null);
  const [userLeadAssignments, setUserLeadAssignments] = useState<CategoryLeadAssignment[]>([]);
  const [selectedLeadCategory, setSelectedLeadCategory] = useState('');

  // Create user modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'VOLUNTEER',
    volunteer_type: '__none__',
    status: 'ACTIVE',
  });

  const loadCategories = useCallback(async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .is('parent_id', null)
      .eq('is_active', true)
      .order('order, name');
    setParentCategories(data as Category[] | []);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('profiles').select('*').order('name');

    if (roleFilter !== 'ALL') {
      query = query.eq('role', roleFilter);
    }
    if (statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter);
    }
    if (search.trim()) {
      // Escape the characters that carry meaning in the filter grammar so a
      // search term cannot alter the query it is embedded in.
      const term = search.trim().replace(/[\\%_,().*"']/g, (c) => `\\${c}`);
      query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) {
      toast.error('Could not load users.');
    } else {
      setUsers(data as Profile[] | []);
    }
    setLoading(false);
  }, [roleFilter, statusFilter, search]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function openEditModal(user: UserWithAssignments) {
    setEditingUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      volunteer_type: user.volunteer_type || '__none__',
      graduation_year: user.graduation_year ? String(user.graduation_year) : '',
      school_name: user.school_name || '',
      phone: user.phone || '',
    });
    setNewPassword('');
    setShowPasswordField(false);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    setActionLoading(true);

    if (editForm.email.trim() !== editingUser.email) {
      const emailResult = await adminUpdateEmail(editingUser.id, editForm.email.trim());
      if (!emailResult.success) {
        toast.error(emailResult.error || 'Could not update email.');
        setActionLoading(false);
        return;
      }
      toast.success('Email updated.');
    }

    if (newPassword) {
      const pwResult = await adminUpdatePassword(editingUser.id, newPassword);
      if (!pwResult.success) {
        toast.error(pwResult.error || 'Could not update password.');
        setActionLoading(false);
        return;
      }
      toast.success('Password updated.');
    }

    const result = await adminUpdateProfile(editingUser.id, {
      name: editForm.name.trim(),
      volunteer_type: editForm.volunteer_type === '__none__' ? null : editForm.volunteer_type,
      graduation_year: editForm.graduation_year ? parseInt(editForm.graduation_year) : null,
      school_name: editForm.school_name || null,
      phone: editForm.phone || null,
    });
    if (result.success) {
      toast.success('Profile updated.');
      setEditingUser(null);
      loadUsers();
    } else {
      toast.error(result.error || 'Could not update profile.');
    }
    setActionLoading(false);
  }

  async function handlePromote(userId: string, role: UserRole) {
    setActionLoading(true);
    const result = await promoteUser(userId, role);
    if (result.success) {
      toast.success(`User promoted to ${roleLabel(role)}.`);
      loadUsers();
    } else {
      toast.error(result.error || 'Could not change role.');
    }
    setActionLoading(false);
  }

  async function handleToggleStatus(user: UserWithAssignments) {
    const newStatus: UserStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setActionLoading(true);
    const result = await setUserStatus(user.id, newStatus);
    if (result.success) {
      toast.success(`User ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}.`);
      loadUsers();
    } else {
      toast.error(result.error || 'Could not change status.');
    }
    setActionLoading(false);
  }

  async function handleApproveUser(user: UserWithAssignments) {
    setActionLoading(true);
    const result = await setUserStatus(user.id, 'ACTIVE');
    if (result.success) {
      toast.success(`${user.name} has been approved and can now log hours.`);
      loadUsers();
    } else {
      toast.error(result.error || 'Could not approve user.');
    }
    setActionLoading(false);
  }

  async function openCategoryModal(user: UserWithAssignments) {
    setManagingCategoriesFor(user);
    const { data } = await supabase
      .from('user_category_assignments')
      .select('id, user_id, category_id, category:categories(name)')
      .eq('user_id', user.id);
    setUserCategoryAssignments(data as unknown as UserCategoryAssignment[] | []);
    setSelectedCategory('');
  }

  async function addCategoryAssignment() {
    if (!managingCategoriesFor || !selectedCategory) return;
    const { error } = await supabase.from('user_category_assignments').upsert({
      user_id: managingCategoriesFor.id,
      category_id: selectedCategory,
    }, { onConflict: 'user_id,category_id' });
    if (error) {
      toast.error('Could not assign category.');
      return;
    }
    toast.success('Category assigned.');
    const { data } = await supabase
      .from('user_category_assignments')
      .select('id, user_id, category_id, category:categories(name)')
      .eq('user_id', managingCategoriesFor.id);
    setUserCategoryAssignments(data as unknown as UserCategoryAssignment[] | []);
    setSelectedCategory('');
  }

  async function removeCategoryAssignment(assignmentId: string) {
    const { error } = await supabase.from('user_category_assignments').delete().eq('id', assignmentId);
    if (error) {
      toast.error('Could not remove category.');
      return;
    }
    toast.success('Category removed.');
    setUserCategoryAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  }

  async function openLeadModal(user: UserWithAssignments) {
    setManagingLeadsFor(user);
    const { data } = await supabase
      .from('category_lead_assignments')
      .select('id, user_id, category_id, category:categories(name)')
      .eq('user_id', user.id);
    setUserLeadAssignments(data as unknown as CategoryLeadAssignment[] | []);
    setSelectedLeadCategory('');
  }

  async function addLeadAssignment() {
    if (!managingLeadsFor || !selectedLeadCategory) return;
    const { error } = await supabase.from('category_lead_assignments').upsert({
      user_id: managingLeadsFor.id,
      category_id: selectedLeadCategory,
    }, { onConflict: 'user_id,category_id' });
    if (error) {
      toast.error('Could not assign category lead.');
      return;
    }
    toast.success('Category lead added.');
    const { data } = await supabase
      .from('category_lead_assignments')
      .select('id, user_id, category_id, category:categories(name)')
      .eq('user_id', managingLeadsFor.id);
    setUserLeadAssignments(data as unknown as CategoryLeadAssignment[] | []);
    setSelectedLeadCategory('');
  }

  async function removeLeadAssignment(assignmentId: string) {
    const { error } = await supabase.from('category_lead_assignments').delete().eq('id', assignmentId);
    if (error) {
      toast.error('Could not remove category lead.');
      return;
    }
    toast.success('Category lead removed.');
    setUserLeadAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
  }

  async function handleCreateUser() {
    setActionLoading(true);
    const result = await adminCreateUser({
      email: createForm.email.trim(),
      password: createForm.password,
      name: createForm.name.trim(),
      role: createForm.role,
      volunteer_type: createForm.volunteer_type === '__none__' ? null : createForm.volunteer_type,
      status: createForm.status,
    });
    if (result.success) {
      toast.success('User created successfully.');
      setShowCreateModal(false);
      setCreateForm({ name: '', email: '', password: '', role: 'VOLUNTEER', volunteer_type: '__none__', status: 'ACTIVE' });
      loadUsers();
    } else {
      toast.error(result.error || 'Could not create user.');
    }
    setActionLoading(false);
  }

  const hasActiveFilters = search.trim() || roleFilter !== 'ALL' || statusFilter !== 'ALL';

  function clearFilters() {
    setSearch('');
    setRoleFilter('ALL');
    setStatusFilter('ALL');
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">User Management</h1>
          <p className="mt-1 text-muted-foreground">
            Create, edit, and deactivate users. Assign categories and category leads.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)} disabled={actionLoading} className="shrink-0">
          <UserPlus className="mr-2 h-4 w-4" />
          Create user
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border/60">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="space-y-1.5">
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All roles</SelectItem>
                  <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
                  <SelectItem value="GROUP_LEAD">Category Lead</SelectItem>
                  <SelectItem value="ADMIN">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
              </Select>
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

      {/* Users table */}
      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            {users.length} {users.length === 1 ? 'user' : 'users'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
              <UsersIcon className="mb-3 h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">No users found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasActiveFilters ? 'Try adjusting your filters.' : 'Users will appear here once they sign up.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex flex-col gap-3 rounded-lg border border-border/50 bg-card/40 px-4 py-3 transition-colors hover:bg-card/80 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{user.name}</span>
                  <Badge
                    variant={user.status === 'ACTIVE' ? 'default' : user.status === 'PENDING_APPROVAL' ? 'secondary' : 'secondary'}
                    className={
                      user.status === 'ACTIVE'
                        ? 'text-xs'
                        : user.status === 'PENDING_APPROVAL'
                          ? 'text-xs bg-warning/15 text-warning-foreground border-warning/30'
                          : 'text-xs'
                    }
                  >
                    {userStatusLabel(user.status)}
                  </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{roleLabel(user.role)}</span>
                      {user.volunteer_type && <span>{volunteerTypeLabel(user.volunteer_type)}</span>}
                      <span>Joined {formatDate(user.created_at)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <Select
                      value={user.role}
                      onValueChange={(v) => handlePromote(user.id, v as UserRole)}
                      disabled={actionLoading || user.id === currentUser?.id}
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
                        <SelectItem value="GROUP_LEAD">Category Lead</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => openEditModal(user)}
                      disabled={actionLoading}
                    >
                      <UserCog className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => openCategoryModal(user)}
                      disabled={actionLoading}
                    >
                      Categories
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => openLeadModal(user)}
                      disabled={actionLoading}
                    >
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                      Leads
                    </Button>

                    {user.id !== currentUser?.id && user.status === 'PENDING_APPROVAL' && (
                      <Button
                        variant="default"
                        size="sm"
                        className="h-8"
                        onClick={() => handleApproveUser(user)}
                        disabled={actionLoading}
                      >
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Approve
                      </Button>
                    )}

                    {user.id !== currentUser?.id && user.status !== 'PENDING_APPROVAL' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => handleToggleStatus(user)}
                        disabled={actionLoading}
                      >
                        {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit modal */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update {editingUser?.name}&apos;s profile information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email address</Label>
              <Input
                id="edit-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>

            {showPasswordField ? (
              <div className="space-y-2">
                <Label htmlFor="edit-password">New password</Label>
                <div className="flex gap-2">
                  <Input
                    id="edit-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowPasswordField(false); setNewPassword(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowPasswordField(true)}
              >
                Change password
              </Button>
            )}
            <div className="space-y-2">
              <Label htmlFor="edit-vtype">Volunteer type</Label>
              <Select
                value={editForm.volunteer_type}
                onValueChange={(v) => setEditForm((f) => ({ ...f, volunteer_type: v }))}
              >
                <SelectTrigger id="edit-vtype">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="MIDDLE_SCHOOL">Middle School</SelectItem>
                  <SelectItem value="HIGH_SCHOOL">High School</SelectItem>
                  <SelectItem value="ADULT">Adult</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-grad">Graduation year</Label>
                <Input
                  id="edit-grad"
                  type="number"
                  value={editForm.graduation_year}
                  onChange={(e) => setEditForm((f) => ({ ...f, graduation_year: e.target.value }))}
                  placeholder="2028"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="555-0100"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-school">School name</Label>
              <Input
                id="edit-school"
                value={editForm.school_name}
                onChange={(e) => setEditForm((f) => ({ ...f, school_name: e.target.value }))}
                placeholder="Vrindavan High School"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingUser(null); setShowPasswordField(false); setNewPassword(''); }}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={actionLoading}>
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category assignments modal */}
      <Dialog open={!!managingCategoriesFor} onOpenChange={(open) => !open && setManagingCategoriesFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Category assignments</DialogTitle>
            <DialogDescription>
              Assign {managingCategoriesFor?.name} to categories. They will see these categories when logging hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {userCategoryAssignments.length > 0 ? (
              <div className="space-y-2">
                {userCategoryAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <FolderTree className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{a.category?.name ?? 'Unknown'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeCategoryAssignment(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No categories assigned yet.</p>
            )}

            <div className="border-t border-border pt-4">
              <div className="flex gap-2">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" onClick={addCategoryAssignment} disabled={!selectedCategory}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category lead assignments modal */}
      <Dialog open={!!managingLeadsFor} onOpenChange={(open) => !open && setManagingLeadsFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Category lead assignments</DialogTitle>
            <DialogDescription>
              Designate {managingLeadsFor?.name} as a lead for specific categories. Leads can approve or reject hours logged under their categories.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {userLeadAssignments.length > 0 ? (
              <div className="space-y-2">
                {userLeadAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{a.category?.name ?? 'Unknown'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeLeadAssignment(a.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-2">No category lead assignments yet.</p>
            )}

            <div className="border-t border-border pt-4">
              <div className="flex gap-2">
                <Select value={selectedLeadCategory} onValueChange={setSelectedLeadCategory}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="icon" onClick={addLeadAssignment} disabled={!selectedLeadCategory}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create user modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create new user</DialogTitle>
            <DialogDescription>
              Create an account with a name, email, and default password. The user can log in immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-name">Full name</Label>
              <Input
                id="create-name"
                value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Krishna Das"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Default password</Label>
              <Input
                id="create-password"
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                Share this password with the user. They can change it after logging in.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="create-role">Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, role: v }))}
                >
                  <SelectTrigger id="create-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VOLUNTEER">Volunteer</SelectItem>
                    <SelectItem value="GROUP_LEAD">Category Lead</SelectItem>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="create-status">Status</Label>
                <Select
                  value={createForm.status}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger id="create-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PENDING_APPROVAL">Pending Approval</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-vtype">Volunteer type</Label>
              <Select
                value={createForm.volunteer_type}
                onValueChange={(v) => setCreateForm((f) => ({ ...f, volunteer_type: v }))}
              >
                <SelectTrigger id="create-vtype">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="MIDDLE_SCHOOL">Middle School</SelectItem>
                  <SelectItem value="HIGH_SCHOOL">High School</SelectItem>
                  <SelectItem value="ADULT">Adult</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
            <Button
              onClick={handleCreateUser}
              disabled={actionLoading || !createForm.name.trim() || !createForm.email.trim() || createForm.password.length < 6}
            >
              {actionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
