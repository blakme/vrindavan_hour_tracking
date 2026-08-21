import { supabase } from '@/lib/supabase';

interface ActionResult {
  success: boolean;
  error?: string;
}

async function getCurrentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, status')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('load current profile failed', error);
    return null;
  }
  return data as { id: string; role: string; status: string } | null;
} 

function reviewErrorMessage(message: string, action: 'approve' | 'reject'): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('cannot review your own hours')) {
    return 'Group leads cannot review their own hours. An admin must approve this entry.';
  }
  if (normalized.includes('already been reviewed')) {
    return 'This entry was already reviewed. Refresh the page to see the latest status.';
  }
  if (normalized.includes('not authorized')) {
    return `You do not have permission to ${action} this entry.`;
  }
  console.error(`${action} entry failed`, message);
  return `Could not ${action} entry. Please try again.`;
}

export async function approveEntry(entryId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };

  const isPrivileged = profile.role === 'ADMIN' || profile.role === 'GROUP_LEAD';
  if (!isPrivileged) return { success: false, error: 'Only category leads and admins can approve entries.' };

  // The review columns are not client-writable; the database function re-checks
  // the caller and claims the entry only while it is still pending.
  const { error } = await supabase.rpc('review_hour_entry', {
    p_entry_id: entryId,
    p_status: 'APPROVED',
  });

  if (error) {
    return { success: false, error: reviewErrorMessage(error.message, 'approve') };
  }
  return { success: true };
}

export async function rejectEntry(entryId: string, reason: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };

  const isPrivileged = profile.role === 'ADMIN' || profile.role === 'GROUP_LEAD';
  if (!isPrivileged) return { success: false, error: 'Only category leads and admins can reject entries.' };

  const { error } = await supabase.rpc('review_hour_entry', {
    p_entry_id: entryId,
    p_status: 'REJECTED',
    p_reason: reason,
  });

  if (error) {
    return { success: false, error: reviewErrorMessage(error.message, 'reject') };
  }
  return { success: true };
}

export async function promoteUser(userId: string, role: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };
  if (profile.role !== 'ADMIN') return { success: false, error: 'Only admins can change roles.' };
  if (userId === profile.id) return { success: false, error: 'You cannot change your own role.' };

  // The role column is not client-writable; the database function re-checks the
  // caller is an active admin before applying the change.
  const { error } = await supabase.rpc('admin_set_user_role', {
    p_user_id: userId,
    p_role: role,
  });

  if (error) {
    console.error('promoteUser failed', error);
    return { success: false, error: 'Could not change role.' };
  }
  return { success: true };
}

export async function setUserStatus(userId: string, status: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };
  if (profile.role !== 'ADMIN') return { success: false, error: 'Only admins can change status.' };
  if (userId === profile.id) return { success: false, error: 'You cannot change your own status.' };

  // The status column is not client-writable; the database function re-checks
  // the caller is an active admin before applying the change.
  const { error } = await supabase.rpc('admin_set_user_status', {
    p_user_id: userId,
    p_status: status,
  });

  if (error) {
    console.error('setUserStatus failed', error);
    return { success: false, error: 'Could not change status.' };
  }
  return { success: true };
}

export async function adminUpdateProfile(
  userId: string,
  updates: {
    name?: string;
    volunteer_type?: string | null;
    graduation_year?: number | null;
    school_name?: string | null;
    phone?: string | null;
  }
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };
  if (profile.role !== 'ADMIN') return { success: false, error: 'Only admins can edit profiles.' };

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) {
    return { success: false, error: 'Could not update profile.' };
  }
  return { success: true };
}

export async function adminUpdateEmail(userId: string, email: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };
  if (profile.role !== 'ADMIN') return { success: false, error: 'Only admins can change emails.' };

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) {
    return { success: false, error: 'Not authenticated' };
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-auth`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'update_email', user_id: userId, email: email.trim() }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: json.error || `Request failed (${response.status})` };
  }
  const json = await response.json().catch(() => ({}));
  if (json.error) return { success: false, error: json.error };
  return { success: true };
}

export async function adminUpdatePassword(userId: string, password: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };
  if (profile.role !== 'ADMIN') return { success: false, error: 'Only admins can change passwords.' };

  if (password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) {
    return { success: false, error: 'Not authenticated' };
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-auth`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'update_password', user_id: userId, password }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: json.error || `Request failed (${response.status})` };
  }
  const json = await response.json().catch(() => ({}));
  if (json.error) return { success: false, error: json.error };
  return { success: true };
}

export async function adminCreateUser(params: {
  email: string;
  password: string;
  name: string;
  role?: string;
  volunteer_type?: string | null;
  status?: string;
}): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { success: false, error: 'Not authenticated' };
  if (profile.role !== 'ADMIN') return { success: false, error: 'Only admins can create users.' };

  if (params.password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }
  if (!params.email.trim() || !params.name.trim()) {
    return { success: false, error: 'Name and email are required.' };
  }

  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) {
    return { success: false, error: 'Not authenticated' };
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-auth`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'create_user',
      email: params.email,
      password: params.password,
      name: params.name,
      role: params.role || 'VOLUNTEER',
      volunteer_type: params.volunteer_type || null,
      status: params.status || 'ACTIVE',
    }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({ error: 'Request failed' }));
    return { success: false, error: json.error || `Request failed (${response.status})` };
  }
  const json = await response.json().catch(() => ({}));
  if (json.error) return { success: false, error: json.error };
  return { success: true };
}
