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
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const sess = data.session;
      setSession(sess);
      setLoading(false);

      // Check admin role via server function if session exists
      if (sess?.user) {
        checkIsAdmin()
          .then((adminData) => {
            if (active) setIsAdmin(adminData.isAdmin);
          })
          .catch(() => {
            if (active) setIsAdmin(false);
          });
      } else {
        setIsAdmin(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);

      if (next?.user) {
        checkIsAdmin()
          .then((adminData) => {
            if (active) setIsAdmin(adminData.isAdmin);
          })
          .catch(() => {
            if (active) setIsAdmin(false);
          });
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, isAdmin, loading };
}
