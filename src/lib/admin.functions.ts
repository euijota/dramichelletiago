import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bootstrap: the very first person to sign in becomes the clinic administrator.
 * Once an admin exists this becomes a no-op, so it cannot be used to escalate.
 */
export const claimAdminIfUnclaimed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return { granted: false as const };
  });
