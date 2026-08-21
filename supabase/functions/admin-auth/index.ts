import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

interface AdminAuthRequest {
  action: "update_email" | "update_password";
  user_id: string;
  email?: string;
  password?: string;
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

      default:
        throw new Error(`Unknown action: ${body.action}`);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    // Detail stays in the logs; the caller gets a generic message so that
    // provider and database internals are not disclosed.
    console.error("admin-auth failed", err);
    return new Response(
      JSON.stringify({ error: "The request could not be completed." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
