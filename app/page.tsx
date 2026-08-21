'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  HeartHandshake,
  Clock,
  CheckCircle2,
  BarChart3,
  ShieldCheck,
  FileText,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && profile) {
      router.replace('/dashboard');
    }
  }, [loading, user, profile, router]);

  return (
    <div className="min-h-screen bg-grain">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              Vrindavan Volunteer Hour Tracking System
            </span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Get started</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Hero */}
        <section className="grid items-center gap-10 py-16 lg:grid-cols-2 lg:py-24">
          <div className="animate-fade-in">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Replacing Track it Forward
            </div>
            <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Every hour of <span className="text-primary">seva</span>, honored and counted.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              A purpose-built volunteer hours tracker for the Vrindavan ashram —
              log service, route approvals to group leads, and celebrate milestones together.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="group">
                  Create your account
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button size="lg" variant="outline">
                  I already have an account
                </Button>
              </Link>
            </div>
          </div>

          <div className="relative animate-fade-in lg:pl-8" style={{ animationDelay: '0.1s' }}>
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/10 via-accent/40 to-transparent blur-2xl" />
            <Card className="relative overflow-hidden border-border/60 shadow-xl">
              <CardContent className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    This week&apos;s seva
                  </span>
                  <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                    +18.5 hrs
                  </span>
                </div>
                <div className="space-y-3">
                  {[
                    { name: 'Prasad Seva', group: 'Green', hours: 5, status: 'Approved' },
                    { name: 'Festival Setup', group: 'Arts & Crafts', hours: 3, status: 'Approved' },
                    { name: 'Class Assistance', group: 'Technology', hours: 2.5, status: 'Pending' },
                    { name: 'Weekly Gita Class', group: 'Bioscience', hours: 8, status: 'Approved' },
                  ].map((row, i) => (
                    <div
                      key={row.name}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-card/60 px-4 py-3"
                      style={{ animationDelay: `${0.15 + i * 0.05}s` }}
                    >
                      <div>
                        <p className="text-sm font-medium">{row.name}</p>
                        <p className="text-xs text-muted-foreground">{row.group}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">
                          {row.hours} hrs
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.status === 'Approved'
                              ? 'bg-success/15 text-success'
                              : 'bg-warning/15 text-warning-foreground'
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 rounded-xl bg-secondary/60 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Annual Seva Goal</span>
                    <span className="text-muted-foreground">68 / 100 hrs</span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-warning transition-all"
                      style={{ width: '68%' }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Feature grid */}
        <section className="py-16">
          <div className="mb-10 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Built for the whole community
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
              From middle-school volunteers to group leads and admins, everyone
              gets exactly the access they need — no more, no less.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Clock,
                title: 'Log hours in seconds',
                body: 'Date, hours, project group, beneficiary team, category, and a short reflection — all from your dashboard.',
              },
              {
                icon: CheckCircle2,
                title: 'Routed approvals',
                body: 'Group leads review only their own team’s entries. Approve one-by-one or in bulk with a single click.',
              },
              {
                icon: BarChart3,
                title: 'Milestone progress',
                body: 'Track approved hours against annual or per-group goals, with pending hours shown separately.',
              },
              {
                icon: ShieldCheck,
                title: 'Role-based access',
                body: 'Volunteer, Group Lead, and Admin roles enforced in the database — never just in the UI.',
              },
              {
                icon: FileText,
                title: 'Verification letters & CSV',
                body: 'Generate printable PDFs for school or scholarship use, and export raw data as CSV.',
              },
              {
                icon: HeartHandshake,
                title: 'Private by design',
                body: 'Contact details and timesheets are visible only to you, your group leads, and admins.',
              },
            ].map((f) => (
              <Card key={f.title} className="border-border/60 transition-shadow hover:shadow-md">
                <CardContent className="p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display text-lg font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
          Vrindavan Volunteer Hour Tracking System — a volunteer service hours tracker for the Vrindavan ashram.
        </footer>
      </main>
    </div>
  );
}
