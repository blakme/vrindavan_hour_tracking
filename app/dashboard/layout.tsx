'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  HeartHandshake,
  LayoutDashboard,
  Clock,
  CheckSquare,
  Users,
  Settings,
  FileBarChart,
  LogOut,
  Menu,
  X,
  Hourglass,
  UserCircle,
} from 'lucide-react';
import { useState, useEffect, ReactNode } from 'react';
import { roleLabel, volunteerTypeLabel } from '@/lib/format';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !profile) {
      router.replace('/login');
    }
  }, [loading, profile, router]);

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const role = profile.role;
  const initials = profile.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const navItems = [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard, roles: ['VOLUNTEER', 'GROUP_LEAD', 'ADMIN'] },
    { href: '/dashboard/hours', label: 'My Hours', icon: Clock, roles: ['VOLUNTEER', 'GROUP_LEAD', 'ADMIN'] },
    { href: '/dashboard/approvals', label: 'Approvals', icon: CheckSquare, roles: ['GROUP_LEAD', 'ADMIN'] },
    { href: '/dashboard/admin/users', label: 'Users', icon: Users, roles: ['ADMIN'] },
    { href: '/dashboard/admin/reference', label: 'Reference Data', icon: Settings, roles: ['ADMIN'] },
    { href: '/dashboard/admin/milestones', label: 'Milestones', icon: Settings, roles: ['ADMIN'] },
    { href: '/dashboard/reports', label: 'Reports', icon: FileBarChart, roles: ['ADMIN'] },
    { href: '/dashboard/profile', label: 'My Profile', icon: UserCircle, roles: ['VOLUNTEER', 'GROUP_LEAD', 'ADMIN'] },
  ].filter((item) => item.roles.includes(role));

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <div className="min-h-screen bg-grain">
      {/* Mobile top bar */}
      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border/60 bg-background/95 px-4 backdrop-blur md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <HeartHandshake className="h-4 w-4" />
          </div>
          <span className="font-display font-semibold">VHTS</span>
        </Link>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen((v) => !v)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-30 w-64 transform border-r border-border/60 bg-card transition-transform md:translate-x-0',
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          )}
          style={{ top: '3.5rem' }}
        >
          <div className="hidden h-16 items-center gap-2 border-b border-border/60 px-5 md:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <HeartHandshake className="h-5 w-5" />
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              VHTS
            </span>
          </div>

          <nav className="flex flex-col gap-1 p-3">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" style={{ width: '1.125rem', height: '1.125rem' }} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-border/60 p-3">
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{profile.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {roleLabel(role)}
                  {profile.volunteer_type ? ` · ${volunteerTypeLabel(profile.volunteer_type)}` : ''}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full justify-start text-muted-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </Button>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 md:hidden"
            style={{ top: '3.5rem' }}
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Main */}
        <main className="min-h-screen flex-1 md:ml-64">
          <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
            {profile.status === 'PENDING_APPROVAL' && (
              <div className="mb-6 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
                <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-warning-foreground" />
                <div>
                  <p className="text-sm font-medium text-warning-foreground">Account pending approval</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    An admin needs to approve your account before you can log service hours.
                  </p>
                </div>
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
