'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase, Profile, Category, UserCategoryAssignment, CategoryLeadAssignment, UserRole, UserStatus, VolunteerType } from '@/lib/supabase';
import { promoteUser, setUserStatus, adminUpdateProfile, adminUpdateEmail, adminUpdatePassword, adminCreateUser, adminDeleteUser, adminImportUsers, ImportSummary } from '@/lib/admin-actions';
import { downloadXlsx } from '@/lib/export-xlsx';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  UserMinus,
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

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Delete user state
  const [deletingUser, setDeletingUser] = useState<UserWithAssignments | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

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

  async function handleDeleteUser() {
    if (!deletingUser) return;
    setDeleteLoading(true);
    const result = await adminDeleteUser(deletingUser.id);
    if (result.success) {
      toast.success(`${deletingUser.name} and all their hour entries have been removed.`);
      setDeletingUser(null);
      loadUsers();
    } else {
      toast.error(result.error || 'Could not delete user.');
    }
    setDeleteLoading(false);
  }

  async function exportUsersXlsx() {
    if (users.length === 0) return;
    setExportLoading(true);
    const headers = [
      { header: 'Name', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Role', key: 'role' },
      { header: 'Volunteer Type', key: 'volunteer_type' },
      { header: 'School', key: 'school_name' },
      { header: 'Graduation Year', key: 'graduation_year' },
      { header: 'Phone', key: 'phone' },
      { header: 'Status', key: 'status' },
      { header: 'Joined', key: 'created_at' },
    ];

    const rows = users.map((u) => ({
      name: u.name,
      email: u.email,
      role: roleLabel(u.role),
      volunteer_type: u.volunteer_type ? volunteerTypeLabel(u.volunteer_type) : '',
      school_name: u.school_name || '',
      graduation_year: u.graduation_year ?? '',
      phone: u.phone || '',
      status: userStatusLabel(u.status),
      created_at: formatDate(u.created_at),
    }));

    await downloadXlsx(rows, headers, `users-${new Date().toISOString().split('T')[0]}`);
    toast.success('User list exported as Excel.');
    setExportLoading(false);
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

  async function handleImport() {
    if (!importFile) return;
    setImportLoading(true);
    setImportSummary(null);
    setImportErrors([]);

    const { parseImportFile } = await import('@/lib/import-xlsx');
    const parseResult = await parseImportFile(importFile);

    if (parseResult.errors.length > 0 && parseResult.rows.length === 0) {
      setImportErrors(parseResult.errors);
      setImportLoading(false);
      return;
    }

    const result = await adminImportUsers({
      rows: parseResult.rows,
      defaultPassword: 'hariom',
    });

    if (result.success && result.summary) {
      setImportSummary(result.summary);
      setImportErrors([...parseResult.errors, ...(result.errors || [])]);
      toast.success(`Imported ${result.summary.entries_imported} of ${result.summary.total_rows} entries.`);
      loadUsers();
    } else {
      toast.error(result.error || 'Import failed.');
      setImportErrors([result.error || 'Import failed.']);
    }
    setImportLoading(false);
  }

  function resetImportModal() {
    setShowImportModal(false);
    setImportFile(null);
    setImportSummary(null);
    setImportErrors([]);
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
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button onClick={exportUsersXlsx} disabled={actionLoading || exportLoading || users.length === 0} variant="outline">
            {exportLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            Export Excel
          </Button>
          <Button onClick={() => setShowImportModal(true)} disabled={actionLoading} variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import spreadsheet
          </Button>
          <Button onClick={() => setShowCreateModal(true)} disabled={actionLoading}>
            <UserPlus className="mr-2 h-4 w-4" />
            Create user
          </Button>
        </div>
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

                    {user.id !== currentUser?.id && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingUser(user)}
                        disabled={actionLoading}
                      >
                        <UserMinus className="mr-1 h-3.5 w-3.5" />
                        Delete
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

      {/* Import spreadsheet modal */}
      <Dialog open={showImportModal} onOpenChange={(open) => !open && resetImportModal()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Import from Track it Forward</DialogTitle>
            <DialogDescription>
              Upload an .xlsx spreadsheet exported from Track it Forward. Accounts will be created for new volunteers with the default password &quot;hariom&quot;. All hours are imported as approved. Categories are matched by name — unmatched categories will be left unassigned.
            </DialogDescription>
          </DialogHeader>

          {importSummary ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  Import complete
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Total rows</div>
                    <div className="font-medium text-base">{importSummary.total_rows}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Accounts created</div>
                    <div className="font-medium text-base">{importSummary.accounts_created}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Entries imported</div>
                    <div className="font-medium text-base text-success">{importSummary.entries_imported}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground">Entries skipped</div>
                    <div className="font-medium text-base">{importSummary.entries_skipped}</div>
                  </div>
                  {importSummary.duplicates > 0 && (
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Duplicates skipped</div>
                      <div className="font-medium text-base">{importSummary.duplicates}</div>
                    </div>
                  )}
                  {importSummary.unmatched_categories > 0 && (
                    <div className="space-y-1 col-span-2">
                      <div className="text-muted-foreground">Unmatched categories</div>
                      <div className="font-medium text-base text-warning flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4" />
                        {importSummary.unmatched_categories} entries had no matching category
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {importErrors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Warnings &amp; errors ({importErrors.length})</p>
                  <ScrollArea className="h-32 rounded-lg border p-3">
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {importErrors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}

              <DialogFooter>
                <Button onClick={resetImportModal}>Done</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              {importErrors.length > 0 && (
                <div className="space-y-2">
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    {importErrors.map((err, i) => (
                      <p key={i} className="text-xs text-destructive">{err}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Spreadsheet file (.xlsx)</Label>
                <div className="flex items-center gap-3">
                  <label className="flex-1 cursor-pointer">
                    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border p-4 transition-colors hover:bg-muted/40">
                      <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {importFile ? (
                          <>
                            <p className="text-sm font-medium truncate">{importFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(importFile.size / 1024).toFixed(1)} KB</p>
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-medium">Click to select a file</p>
                            <p className="text-xs text-muted-foreground">.xlsx format from Track it Forward</p>
                          </>
                        )}
                      </div>
                    </div>
                    <input
                      type="file"
                      accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setImportFile(file);
                          setImportErrors([]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-lg bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Expected columns:</p>
                <p>Volunteer Name, First Name, Last Name, Phone Number, Email, Hours, Reflection, Volunteered Date, Submission Date, Approved Date, Joined Date, Last Accessed, Volunteer State, Sub-Category, Category</p>
                <p className="pt-1">New volunteers get the password &quot;hariom&quot;. Existing volunteers&apos; hours are imported without changing their account.</p>
              </div>
            </div>
          )}

          {!importSummary && (
            <DialogFooter>
              <Button variant="outline" onClick={resetImportModal}>Cancel</Button>
              <Button
                onClick={handleImport}
                disabled={importLoading || !importFile}
              >
                {importLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {importLoading ? 'Importing...' : 'Start import'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete user confirmation */}
      <AlertDialog open={!!deletingUser} onOpenChange={(open) => !open && setDeletingUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deletingUser?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and all their volunteer hour entries, category assignments, and category lead assignments. Entries they approved for other volunteers will keep their approved status but will no longer show who approved them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
