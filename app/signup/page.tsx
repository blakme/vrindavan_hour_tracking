'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HeartHandshake, Loader2, AlertCircle, MailCheck } from 'lucide-react';
import { VolunteerType } from '@/lib/supabase';

export default function SignupPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [volunteerType, setVolunteerType] = useState<VolunteerType | ''>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNeedsConfirmation(false);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { name: name.trim() },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (signUpError) {
      setLoading(false);
      // Never surface the provider's own message: it distinguishes "already
      // registered" from other failures, which lets anyone test whether an
      // address has an account here. Detail stays in the console.
      console.error('sign up failed', signUpError);
      setError(
        'We could not create an account with those details. If you already have an account, log in instead.'
      );
      return;
    }

    const userId = data.user?.id;
    if (userId) {
      // Insert profile row. RLS allows a user to insert their own profile.
      // Role, account status and email are NOT sent: none of them is
      // client-writable. The database fills role/status from its own defaults
      // (VOLUNTEER / PENDING_APPROVAL) and a trigger fills the email from the
      // account this session belongs to, so a crafted request cannot
      // self-approve, self-promote, or claim somebody else's address.
      const { error: profileErr } = await supabase.from('profiles').insert({
        id: userId,
        name: name.trim(),
        volunteer_type: volunteerType || null,
      });
      // 23505 = the profile already exists (e.g. a repeated submit); not an error.
      if (profileErr && profileErr.code !== '23505') {
        console.error('signup profile creation failed', profileErr);
        setLoading(false);
        setError('Your account was created, but we could not finish setting up your profile. Please contact an admin.');
        return;
      }
    }

    await refreshProfile();
    setLoading(false);

    // If email confirmation is enabled and the session is null, the user must
    // confirm via the link emailed to them before they can log in.
    if (!data.session) {
      setNeedsConfirmation(true);
      return;
    }

    router.replace('/dashboard');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grain px-4 py-12">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <HeartHandshake className="h-6 w-6" />
          </div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Join Vrindavan Volunteer Hour Tracking System
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a volunteer account to start logging service hours
          </p>
        </div>

        {needsConfirmation ? (
          <Card className="border-border/60 shadow-lg">
            <CardHeader>
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <MailCheck className="h-6 w-6 text-primary" />
              </div>
              <CardTitle className="text-center">Check your email</CardTitle>
              <CardDescription className="text-center">
                We sent a confirmation link to <strong>{email}</strong>.
                Click the link in the email to activate your account, then come back to log in.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Go to log in
              </Link>
              <button
                type="button"
                className="text-sm text-muted-foreground hover:underline"
                onClick={() => setNeedsConfirmation(false)}
              >
                Use a different email
              </button>
            </CardContent>
          </Card>
        ) : (
        <Card className="border-border/60 shadow-lg">
          <CardHeader>
            <CardTitle>Sign up</CardTitle>
            <CardDescription>
              New accounts require admin approval before you can log hours. Category leads and admins are promoted later.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Krishna Das"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vtype">Volunteer type (optional)</Label>
                <Select
                  value={volunteerType}
                  onValueChange={(v) => setVolunteerType(v as VolunteerType)}
                >
                  <SelectTrigger id="vtype">
                    <SelectValue placeholder="Select if applicable" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MIDDLE_SCHOOL">Middle School</SelectItem>
                    <SelectItem value="HIGH_SCHOOL">High School</SelectItem>
                    <SelectItem value="ADULT">Adult</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {loading ? 'Creating account…' : 'Create account'}
              </Button>
            </form>

            <div className="mt-5 text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-primary hover:underline">
                Log in
              </Link>
            </div>
          </CardContent>
        </Card>
        )}
      </div>
    </div>
  );
}
