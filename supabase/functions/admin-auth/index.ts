import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

interface ImportRow {
  name: string;
  email: string;
  phone?: string | null;
  hours: number;
  reflection?: string | null;
  volunteered_date: string;
  category_name?: string | null;
  sub_category_name?: string | null;
  volunteer_state?: string | null;
}

interface AdminAuthRequest {
  action: "update_email" | "update_password" | "create_user" | "import_users" | "delete_user";
  user_id?: string;
  email?: string;
  password?: string;
  name?: string;
  role?: string;
  volunteer_type?: string;
  status?: string;
  import_rows?: ImportRow[];
  default_password?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: AdminAuthRequest = await req.json();

    // Create a user-scoped client to verify the caller's identity
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    // Verify caller is authenticated
    const { data: callerUser } = await userClient.auth.getUser();
    if (!callerUser?.user) {
      return new Response(
        JSON.stringify({ error: "Not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client with service role for privileged operations
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Verify caller is an active admin
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role, status")
      .eq("id", callerUser.user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "ADMIN" || callerProfile.status !== "ACTIVE") {
      return new Response(
        JSON.stringify({ error: "Not authorized: admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    switch (body.action) {
      case "delete_user": {
        if (!body.user_id) {
          throw new Error("user_id is required");
        }
        if (body.user_id === callerUser.user!.id) {
          throw new Error("You cannot delete your own account");
        }
        // Deleting the auth user cascades to profiles (ON DELETE CASCADE),
        // which in turn cascades to hour_entries, user_category_assignments,
        // and category_lead_assignments. approver_id FK is SET NULL so entries
        // they approved are preserved.
        const { error: deleteErr } = await admin.auth.admin.deleteUser(
          body.user_id
        );
        if (deleteErr) {
          throw new Error(`Could not delete user: ${deleteErr.message}`);
        }
        break;
      }

      case "update_email": {
        if (!body.user_id || !body.email) {
          throw new Error("user_id and email are required");
        }
        const { error } = await admin.auth.admin.updateUserById(
          body.user_id,
          { email: body.email.trim() }
        );
        if (error) throw new Error(`Could not update email: ${error.message}`);

        // Also update the email in the profiles table
        const { error: profileErr } = await admin
          .from("profiles")
          .update({ email: body.email.trim(), updated_at: new Date().toISOString() })
          .eq("id", body.user_id);
        if (profileErr) throw new Error(`Could not sync profile email: ${profileErr.message}`);
        break;
      }

      case "update_password": {
        if (!body.user_id || !body.password) {
          throw new Error("user_id and password are required");
        }
        if (body.password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }
        const { error } = await admin.auth.admin.updateUserById(
          body.user_id,
          { password: body.password }
        );
        if (error) throw new Error(`Could not update password: ${error.message}`);
        break;
      }

      case "create_user": {
        if (!body.email || !body.password || !body.name) {
          throw new Error("email, password, and name are required");
        }
        if (body.password.length < 6) {
          throw new Error("Password must be at least 6 characters");
        }

        const email = body.email.trim().toLowerCase();

        // 1. Create the auth user (no email confirmation, no invitation email).
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email,
          password: body.password,
          email_confirm: true,
          user_metadata: { name: body.name.trim() },
        });
        if (createErr) throw new Error(`Could not create user: ${createErr.message}`);
        if (!newUser.user) throw new Error("Could not create user: no user returned");

        // 2. Insert the profile row with admin-supplied fields, including role
        //    and status directly. The service-role client bypasses RLS, so we
        //    can set privileged columns without going through the admin RPC
        //    functions (which require auth.uid() and don't work with the
        //    service-role key). The email trigger fills email from auth.users.
        const { error: profileErr } = await admin
          .from("profiles")
          .insert({
            id: newUser.user.id,
            name: body.name.trim(),
            volunteer_type: body.volunteer_type || null,
            role: (body.role || "VOLUNTEER") as "VOLUNTEER" | "GROUP_LEAD" | "ADMIN",
            status: (body.status || "ACTIVE") as "ACTIVE" | "INACTIVE" | "PENDING_APPROVAL",
          });
        if (profileErr) throw new Error(`Could not create profile: ${profileErr.message}`);

        break;
      }

      case "import_users": {
        if (!body.import_rows || !Array.isArray(body.import_rows)) {
          throw new Error("import_rows array is required");
        }
        if (!body.default_password || body.default_password.length < 6) {
          throw new Error("default_password (min 6 chars) is required");
        }

        const rows = body.import_rows;
        const defaultPassword = body.default_password;
        const callerId = callerUser.user!.id;

        // --- Build category lookup maps (parent + child by name, case-insensitive) ---
        const { data: allCategories } = await admin
          .from("categories")
          .select("id, name, parent_id")
          .eq("is_active", true);

        const catMap = new Map<string, { id: string; parent_id: string | null }>();
        // parentName(lower) -> childName(lower) -> childId
        const childrenByParent = new Map<string, Map<string, string>>();
        // childName(lower) -> childId (fallback when parent name doesn't match)
        const childNameOnly = new Map<string, string>();

        if (allCategories) {
          // Index parents
          for (const c of allCategories) {
            if (!c.parent_id) {
              const key = c.name.trim().toLowerCase();
              if (!catMap.has(key)) catMap.set(key, { id: c.id, parent_id: null });
            }
          }
          // Index children
          for (const c of allCategories) {
            if (c.parent_id) {
              // Also register as a category (some spreadsheets use sub-cat names as the main category)
              const ck = c.name.trim().toLowerCase();
              if (!catMap.has(ck)) catMap.set(ck, { id: c.id, parent_id: c.parent_id });

              const parent = allCategories.find((p) => p.id === c.parent_id);
              if (parent) {
                const pk = parent.name.trim().toLowerCase();
                if (!childrenByParent.has(pk)) childrenByParent.set(pk, new Map());
                childrenByParent.get(pk)!.set(ck, c.id);
              }
              if (!childNameOnly.has(ck)) childNameOnly.set(ck, c.id);
            }
          }
        }

        // --- Collect all unique emails to bulk-lookup existing profiles ---
        const uniqueEmails = [...new Set(rows.map((r) => r.email.trim().toLowerCase()))];

        const { data: existingProfiles } = await admin
          .from("profiles")
          .select("id, email, status, role")
          .in("email", uniqueEmails);

        const profileByEmail = new Map<string, { id: string; status: string; role: string }>();
        if (existingProfiles) {
          for (const p of existingProfiles) {
            profileByEmail.set(p.email.trim().toLowerCase(), { id: p.id, status: p.status, role: p.role });
          }
        }

        // --- Also check auth.users for emails that have an auth account but no
        //     profile row yet (edge case: profile insert failed on a prior
        //     import). We use admin.auth.admin.listUsersByIds indirectly by
        //     listing and filtering, but for batch sizes this is simpler: we
        //     try createUser and if it fails with "already registered" we
        //     look up the existing auth user by email. ---
        // Pre-fetch auth users for emails that don't have a profile, so we can
        // reuse their auth account instead of failing the row.
        // getUserByEmail throws (rather than returning null) when a user was
        // deleted, so each call is wrapped in its own try-catch.
        const emailsWithoutProfile = uniqueEmails.filter((e) => !profileByEmail.has(e));
        const authUserByEmail = new Map<string, string>();
        for (const email of emailsWithoutProfile) {
          try {
            const { data: found } = await admin.auth.admin.getUserByEmail(email);
            if (found?.user) {
              authUserByEmail.set(email, found.user.id);
            }
          } catch {
            // User doesn't exist in auth (e.g. was deleted). That's fine —
            // we'll create a fresh account below.
          }
        }

        // --- Collect existing approved entries for this batch to detect duplicates ---
        // We query by (volunteer_id, date, hours, category_id) to detect potential
        // duplicates from a re-import of the same spreadsheet.
        const allVolunteerIds = new Set<string>();
        for (const p of profileByEmail.values()) allVolunteerIds.add(p.id);
        const allDates = [...new Set(rows.map((r) => r.volunteered_date))];

        const existingEntries = new Set<string>(); // "volunteerId|date|hours|categoryId"
        if (allVolunteerIds.size > 0 && allDates.length > 0) {
          const { data: existing } = await admin
            .from("hour_entries")
            .select("volunteer_id, date, hours, category_id")
            .in("volunteer_id", [...allVolunteerIds])
            .in("date", allDates)
            .eq("status", "APPROVED");

          if (existing) {
            for (const e of existing) {
              existingEntries.add(`${e.volunteer_id}|${e.date}|${e.hours}|${e.category_id ?? 'null'}`);
            }
          }
        }

        // --- Process each row: create account if needed, then insert hour entry ---
        let created = 0;
        let imported = 0;
        let skipped = 0;
        let duplicates = 0;
        let unmatchedCategories = 0;
        const errors: string[] = [];

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const emailKey = row.email.trim().toLowerCase();

          if (!emailKey || !row.name?.trim()) {
            skipped++;
            errors.push(`Row ${i + 2}: missing name or email, skipped.`);
            continue;
          }

          // Validate hours
          const hours = Number(row.hours);
          if (isNaN(hours) || hours < 0.25 || hours > 24) {
            skipped++;
            errors.push(`Row ${i + 2}: invalid hours (${row.hours}), skipped.`);
            continue;
          }

          // Validate date
          if (!row.volunteered_date) {
            skipped++;
            errors.push(`Row ${i + 2}: missing volunteered date, skipped.`);
            continue;
          }

          let userId: string;

          // Find or create user account
          const existing = profileByEmail.get(emailKey);
          if (existing) {
            userId = existing.id;
          } else {
            // Check if an auth account already exists (no profile row)
            const existingAuthId = authUserByEmail.get(emailKey);

            if (existingAuthId) {
              // Auth account exists but no profile — create the profile now
              userId = existingAuthId;

              const targetStatus = row.volunteer_state?.trim().toLowerCase() === "archived"
                ? "INACTIVE"
                : "ACTIVE";

              const { error: profileErr } = await admin
                .from("profiles")
                .insert({
                  id: userId,
                  name: row.name.trim(),
                  phone: row.phone?.trim() || null,
                  status: targetStatus,
                });
              if (profileErr) {
                errors.push(`Row ${i + 2}: profile insert failed for existing auth user ${emailKey} — ${profileErr.message}`);
                // Continue anyway — we can still try to log hours
              }

              profileByEmail.set(emailKey, { id: userId, status: targetStatus, role: "VOLUNTEER" });
              // Don't increment created — the auth account already existed
            } else {
              // Create new auth user with default password
              const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
                email: emailKey,
                password: defaultPassword,
                email_confirm: true,
                user_metadata: { name: row.name.trim() },
              });
              if (createErr) {
                skipped++;
                errors.push(`Row ${i + 2}: could not create account for ${emailKey} — ${createErr.message}`);
                continue;
              }              if (!newUser.user) {
                skipped++;
                errors.push(`Row ${i + 2}: no user returned for ${emailKey}`);
                continue;
              }
              userId = newUser.user.id;

              // Determine status: archived -> INACTIVE, otherwise ACTIVE
              const targetStatus = row.volunteer_state?.trim().toLowerCase() === "archived"
                ? "INACTIVE"
                : "ACTIVE";

              // Insert profile. The email trigger fills email from auth.users.
              // We explicitly set status because the column default is PENDING_APPROVAL
              // (which is for self-signups, not admin imports).
              const { error: profileErr } = await admin
                .from("profiles")
                .insert({
                  id: userId,
                  name: row.name.trim(),
                  phone: row.phone?.trim() || null,
                  status: targetStatus,
                });
              if (profileErr) {
                errors.push(`Row ${i + 2}: account created but profile insert failed — ${profileErr.message}`);
                // Continue anyway — we can still try to log hours
              }

              profileByEmail.set(emailKey, { id: userId, status: targetStatus, role: "VOLUNTEER" });
              created++;
            }
          }

          // --- Resolve category and sub-category ---
          let categoryId: string | null = null;
          let subCategoryId: string | null = null;

          if (row.category_name?.trim()) {
            const catKey = row.category_name.trim().toLowerCase();
            const cat = catMap.get(catKey);
            if (cat) {
              categoryId = cat.id;

              // Try to match sub-category
              if (row.sub_category_name?.trim()) {
                const subKey = row.sub_category_name.trim().toLowerCase();
                const parentName = row.category_name.trim().toLowerCase();

                let childId: string | undefined;
                // First try parent|child match
                if (childrenByParent.has(parentName)) {
                  childId = childrenByParent.get(parentName)!.get(subKey);
                }
                // Fallback: match child name alone
                if (!childId && childNameOnly.has(subKey)) {
                  childId = childNameOnly.get(subKey)!;
                }
                if (childId) subCategoryId = childId;
              }
            } else {
              unmatchedCategories++;
            }
          } else {
            unmatchedCategories++;
          }

          // --- Auto-assign the user to the imported category ---
          if (categoryId) {
            // The assignment table stores parent categories. If the spreadsheet
            // names a child category, assign its parent.
            let parentCatId = categoryId;
            const cat = catMap.get(row.category_name?.trim().toLowerCase() || "");
            if (cat?.parent_id) {
              parentCatId = cat.parent_id;
            }

            const { error: assignErr } = await admin
              .from("user_category_assignments")
              .upsert(
                { user_id: userId, category_id: parentCatId },
                { onConflict: "user_id,category_id" }
              );
            if (assignErr) {
              errors.push(`Row ${i + 2}: could not assign category to ${emailKey} — ${assignErr.message}`);
            }
          }

          // --- Check for duplicate entry (from a previous import of same data) ---
          const dupKey = `${userId}|${row.volunteered_date}|${hours}|${categoryId ?? 'null'}`;
          if (existingEntries.has(dupKey)) {
            duplicates++;
            continue;
          }

          // --- Insert the hour entry (approved, no team) ---
          const { error: entryErr } = await admin
            .from("hour_entries")
            .insert({
              volunteer_id: userId,
              date: row.volunteered_date,
              hours,
              team_id: null,
              category_id: categoryId,
              sub_category_id: subCategoryId,
              reflection: row.reflection?.trim() || null,
              status: "APPROVED",
              approver_id: callerId,
              approved_at: new Date().toISOString(),
            });

          if (entryErr) {
            skipped++;
            errors.push(`Row ${i + 2}: hour entry insert failed — ${entryErr.message}`);
            continue;
          }

          // Track this entry to prevent duplicates within the same batch
          existingEntries.add(dupKey);
          imported++;
        }

        return new Response(
          JSON.stringify({
            success: true,
            summary: {
              total_rows: rows.length,
              accounts_created: created,
              entries_imported: imported,
              entries_skipped: skipped,
              duplicates: duplicates,
              unmatched_categories: unmatchedCategories,
            },
            errors: errors.slice(0, 20),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    console.error("admin-auth failed", err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
