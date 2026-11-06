import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server function to check if the authenticated user has admin role.
 * Returns { isAdmin: boolean }.
 */
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // 1. Try authenticated client first (respects RLS where user can read own role)
    const { data: userRole } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (userRole) {
      return { isAdmin: true };
    }

    // 2. Fallback to supabaseAdmin
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .eq("role", "admin")
        .maybeSingle();

      return { isAdmin: !!data };
    } catch {
      return { isAdmin: false };
    }
  });
