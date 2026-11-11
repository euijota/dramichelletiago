import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { getRequestHeader, getRequestIP, setResponseHeaders } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const limitResult = z.object({
  allowed: z.boolean(),
  retry_after_seconds: z.number().int().min(0).max(60),
});

export async function enforceClinicalLinkLimit(kind: "read" | "action") {
  setResponseHeaders(
    new Headers({ "cache-control": "no-store", "referrer-policy": "no-referrer" }),
  );
  const secret = process.env.CLINICAL_RATE_LIMIT_SECRET;
  const unavailable = "Não foi possível verificar o acesso. Tente novamente.";
  if (!secret || secret.length < 32) throw new Error(unavailable);

  const address =
    (process.env.VERCEL === "1" ? getRequestHeader("x-vercel-forwarded-for") : getRequestIP()) ??
    "";
  const source = isIP(address) ? address : "unknown";
  const { data, error } = await supabaseAdmin.rpc("clinical_consume_link_limit", {
    p_source_hash: createHmac("sha256", secret).update(`${kind}:${source}`).digest("hex"),
    p_kind: kind,
  });
  const result = limitResult.safeParse(data);
  if (error || !result.success) throw new Error(unavailable);
  if (!result.data.allowed) {
    throw new Error(
      `Muitas tentativas. Aguarde ${result.data.retry_after_seconds} segundos e tente novamente.`,
    );
  }
}
