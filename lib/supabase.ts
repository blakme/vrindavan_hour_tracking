import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const APP_TIMEZONE = 'America/Los_Angeles';

export type UserRole = 'VOLUNTEER' | 'GROUP_LEAD' | 'ADMIN';
export type VolunteerType = 'MIDDLE_SCHOOL' | 'HIGH_SCHOOL' | 'ADULT';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_APPROVAL';
export type EntryStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type MilestoneScope = 'GLOBAL' | 'CATEGORY';

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  volunteer_type: VolunteerType | null;
  graduation_year: number | null;
  school_name: string | null;
  phone: string | null;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface BeneficiaryTeam {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  order: number;
  created_at: string;
}

export interface UserCategoryAssignment {
  id: string;
  user_id: string;
  category_id: string;
  created_at: string;
  category?: Category;
}

export interface CategoryLeadAssignment {
  id: string;
  user_id: string;
  category_id: string;
  created_at: string;
  category?: Category;
}

export interface HourEntry {
  id: string;
  volunteer_id: string;
  date: string;
  hours: number;
  team_id: string;
  category_id: string;
  sub_category_id: string | null;
  reflection: string | null;
  status: EntryStatus;
  approver_id: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  volunteer?: Profile;
  approver?: Profile | null;
  team?: BeneficiaryTeam;
  category?: Category;
  sub_category?: Category | null;
}

export interface Milestone {
  id: string;
  name: string;
  target_hours: number;
  period_start: string;
  period_end: string;
  scope: MilestoneScope;
  category_id: string | null;
  created_at: string;
  category?: Category | null;
}
