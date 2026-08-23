export const APP_TIMEZONE = 'America/Los_Angeles';

export function formatHours(hours: number | string | null | undefined): string {
  if (hours === null || hours === undefined) return '0';
  const n = typeof hours === 'string' ? parseFloat(hours) : hours;
  if (Number.isNaN(n)) return '0';
  return Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toDateInputValue(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const y = d.toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE });
  return y;
}

export function roleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'GROUP_LEAD':
      return 'Category Lead';
    case 'VOLUNTEER':
      return 'Volunteer';
    default:
      return role;
  }
}

export function volunteerTypeLabel(t: string | null): string {
  if (!t) return '—';
  switch (t) {
    case 'MIDDLE_SCHOOL':
      return 'Middle School';
    case 'HIGH_SCHOOL':
      return 'High School';
    case 'ADULT':
      return 'Adult';
    default:
      return t;
  }
}

export function statusLabel(s: string): string {
  switch (s) {
    case 'PENDING':
      return 'Pending';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    default:
      return s;
  }
}

export function userStatusLabel(s: string): string {
  switch (s) {
    case 'ACTIVE':
      return 'Active';
    case 'INACTIVE':
      return 'Inactive';
    case 'PENDING_APPROVAL':
      return 'Pending Approval';
    default:
      return s;
  }
}
