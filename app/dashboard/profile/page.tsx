'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, Save, Lock, Mail, User, Phone, Calendar, GraduationCap } from 'lucide-react';
import { roleLabel, volunteerTypeLabel, userStatusLabel, formatDate } from '@/lib/format';
import { toast } from 'sonner';

export const dynamic = 'force-dynamic';

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    graduation_year: '',
    school_name: '',
    volunteer_type: '__none__',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name,
      phone: profile.phone ?? '',
      graduation_year: profile.graduation_year?.toString() ?? '',
      school_name: profile.school_name ?? '',
      volunteer_type: profile.volunteer_type ?? '__none__',
    });
  }, [profile]);

  if (!profile) return null;

  const initials = profile.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  async function handleSaveProfile() {
    if (!form.name.trim()) {
      toast.error('Name is required.');
      return;
    }

    const gradYear = form.graduation_year.trim()
      ? parseInt(form.graduation_year, 10)
      : null;

    if (gradYear !== null && (isNaN(gradYear) || gradYear < 1900 || gradYear > 2100)) {
      toast.error('Graduation year must be a valid year.');
      return;
    }

    setSavingProfile(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        graduation_year: gradYear,
        school_name: form.school_name.trim() || null,
        volunteer_type: form.volunteer_type === '__none__' ? null : form.volunteer_type,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile!.id);

    if (error) {
      toast.error('Could not save profile changes.');
    } else {
      toast.success('Profile updated.');
      await refreshProfile();
    }
    setSavingProfile(false);
  }

  async function handleChangePassword() {
    if (!pwForm.newPassword || pwForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    setSavingPassword(true);

    // Verify current password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: profile!.email,
      password: pwForm.currentPassword,
    });

    if (signInError) {
      toast.error('Current password is incorrect.');
      setSavingPassword(false);
      return;
    }

    // Update to the new password
    const { error: updateError } = await supabase.auth.updateUser({
      password: pwForm.newPassword,
    });

    if (updateError) {
      toast.error(updateError.message || 'Could not change password.');
    } else {
      toast.success('Password changed successfully.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
    setSavingPassword(false);
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">My Profile</h1>
        <p className="mt-1 text-muted-foreground">
          View your account details and update your information or password.
        </p>
      </div>

      {/* Profile summary card */}
      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/15 text-primary font-display text-xl font-semibold">
              {initials}
            </div>
            <div className="flex-1">
              <h2 className="font-display text-xl font-semibold">{profile.name}</h2>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge variant="secondary" className="text-xs">
                  {roleLabel(profile.role)}
                </Badge>
                <Badge
                  variant={profile.status === 'ACTIVE' ? 'default' : 'secondary'}
                  className="text-xs"
                >
                  {userStatusLabel(profile.status)}
                </Badge>
                {profile.volunteer_type && (
                  <Badge variant="secondary" className="text-xs">
                    {volunteerTypeLabel(profile.volunteer_type)}
                  </Badge>
                )}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>Member since</p>
              <p className="font-medium text-foreground">{formatDate(profile.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Edit profile info */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Update your name, phone, and school details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                <Mail className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                Full name
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-readonly">
                <Mail className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                Email
              </Label>
              <Input
                id="email-readonly"
                value={profile.email}
                disabled
                className="bg-muted/50"
              />
              <p className="text-xs text-muted-foreground">
                Contact an admin if you need to change your email address.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">
                <Phone className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                Phone
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="grad-year">
                  <GraduationCap className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  Graduation year
                </Label>
                <Input
                  id="grad-year"
                  type="number"
                  value={form.graduation_year}
                  onChange={(e) => setForm((f) => ({ ...f, graduation_year: e.target.value }))}
                  placeholder="2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="school">
                  <Calendar className="inline h-3.5 w-3.5 mr-1 text-muted-foreground" />
                  School name
                </Label>
                <Input
                  id="school"
                  value={form.school_name}
                  onChange={(e) => setForm((f) => ({ ...f, school_name: e.target.value }))}
                  placeholder="Your school"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vtype">Volunteer type</Label>
              <select
                id="vtype"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={form.volunteer_type}
                onChange={(e) => setForm((f) => ({ ...f, volunteer_type: e.target.value }))}
              >
                <option value="__none__">None</option>
                <option value="MIDDLE_SCHOOL">Middle School</option>
                <option value="HIGH_SCHOOL">High School</option>
                <option value="ADULT">Adult</option>
              </select>
            </div>

            <Separator />

            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save changes
            </Button>
          </CardContent>
        </Card>

        {/* Change password */}
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Enter your current password and choose a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-pw">Current password</Label>
              <Input
                id="current-pw"
                type="password"
                value={pwForm.currentPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
                placeholder="Enter your current password"
                autoComplete="current-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-pw">New password</Label>
              <Input
                id="new-pw"
                type="password"
                value={pwForm.newPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
                placeholder="At least 6 characters"
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-pw">Confirm new password</Label>
              <Input
                id="confirm-pw"
                type="password"
                value={pwForm.confirmPassword}
                onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </div>

            <Separator />

            <Button
              onClick={handleChangePassword}
              disabled={savingPassword || !pwForm.currentPassword || !pwForm.newPassword || !pwForm.confirmPassword}
            >
              {savingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
              Change password
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
