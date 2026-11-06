import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { checkIsAdmin } from "@/lib/admin-check";

export type SessionState = {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
};

/**
 * Reads the current Supabase session and whether the signed-in user holds the
 * `admin` role. Role state comes from the `user_roles` table via server function,
 * never from client storage.
 */
async function determineAdmin(userId: string): Promise<boolean> {
  // 1. Direct check via client (fast, validated against PostgreSQL RLS with current JWT)
  try {
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (data?.role === "admin") return true;
  } catch (err) {
    console.warn("Client admin check error, falling back to server function:", err);
  }

  // 2. Server function fallback
  try {
    const adminData = await checkIsAdmin();
    return !!adminData?.isAdmin;
  } catch {
    return false;
  }
}

export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      const sess = data.session;
      setSession(sess);

      if (sess?.user) {
        const admin = await determineAdmin(sess.user.id);
        if (active) {
          setIsAdmin(admin);
          setLoading(false);
        }
      } else {
        if (active) {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);

      if (next?.user) {
        const admin = await determineAdmin(next.user.id);
        if (active) {
          setIsAdmin(admin);
          setLoading(false);
        }
      } else {
        if (active) {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, isAdmin, loading };
}
