import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "@/integrations/supabase/auth-middleware";

// Assinatura eletrônica avançada do paciente — spec em docs/ASSINATURA_DIGITAL.md.
// Módulo compartilhado: tudo que usa node:crypto/service_role é importado dentro dos handlers.

export const SIGNATURE_DOCUMENT_TYPES = ["tcle", "plano_tratamento", "orcamento"] as const;
export const SIGNER_ROLES = ["paciente", "responsavel_legal"] as const;
export type SignatureDocumentType = (typeof SIGNATURE_DOCUMENT_TYPES)[number];

// Texto exibido ao paciente e gravado (por versão) na evidência. Mudou o texto → nova versão.
export const CONSENT_TEXT_VERSION = "v1-2026-11-27";
export const CONSENT_TEXT =
  "Declaro que li e compreendi integralmente este documento, tive a oportunidade de esclarecer " +
  "minhas dúvidas com a profissional e concordo com o seu conteúdo.";

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, "Link inválido ou expirado.");
const INVALID_LINK = "Link inválido, expirado ou já utilizado.";
const SIGNED_URL_SECONDS = 60;

const openResultSchema = z.object({
  code: z.literal("ok"),
  request_id: z.uuid(),
  patient_id: z.uuid(),
  document_type: z.enum(SIGNATURE_DOCUMENT_TYPES),
  document_path: z.string(),
  document_sha256: z.string(),
  signer_name: z.string(),
  signer_role: z.enum(SIGNER_ROLES),
  otp_verified: z.boolean(),
  otp_channel: z.enum(["whatsapp", "email"]).nullable(),
  otp_contact_masked: z.string().nullable(),
  verify_code: z.string(),
});

/** Abre o pedido pelo token (marca opened_at) ou lança a mensagem neutra de link inválido. */
async function openByToken(token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { hashLinkToken } = await import("@/lib/appointment-links.server");
  const tokenHash = hashLinkToken(token);
  const { data, error } = await (supabaseAdmin.rpc as any)("signature_open_request", {
    p_token_hash: tokenHash,
  });
  if (error) throw new Error("Não foi possível abrir o documento. Tente novamente.");
  const parsed = openResultSchema.safeParse(data);
  if (!parsed.success) throw new Error(INVALID_LINK);
  return { tokenHash, req: parsed.data, supabaseAdmin };
}

async function signedDocumentUrl(
  supabaseAdmin: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"],
  path: string,
) {
  const { data, error } = await supabaseAdmin.storage
    .from("signatures")
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error("Não foi possível carregar o documento. Tente novamente.");
  return data.signedUrl;
}

async function loadSignerContact(patientId: string, role: (typeof SIGNER_ROLES)[number]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { resolveSignerContact } = await import("@/lib/signature.server");
  const { data: patient, error } = await supabaseAdmin
    .from("patients")
    .select("name, phone, email, notes, birth_date")
    .eq("id", patientId)
    .maybeSingle();
  if (error || !patient) return null;
  return resolveSignerContact(patient, role);
}

// ============================================================================
// PAINEL (admin)
// ============================================================================

export const createSignatureRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      patientId: z.uuid(),
      documentType: z.enum(SIGNATURE_DOCUMENT_TYPES),
      signerRole: z.enum(SIGNER_ROLES),
      channel: z.enum(["link", "qr"]),
      // base64 de até ~5 MB de PDF
      pdfBase64: z.string().min(8).max(7_000_000),
    }),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { generateRandomLinkToken } = await import("@/lib/appointment-links.server");
    const sig = await import("@/lib/signature.server");

    const bytes = new Uint8Array(Buffer.from(data.pdfBase64, "base64"));
    if (!sig.isPdf(bytes) || bytes.length > sig.MAX_SIGNATURE_PDF_BYTES) {
      throw new Error("Arquivo inválido: envie um PDF de até 5 MB.");
    }

    const contact = await loadSignerContact(data.patientId, data.signerRole);
    if (!contact) {
      throw new Error(
        data.signerRole === "responsavel_legal"
          ? "Cadastre o responsável legal do paciente antes de pedir a assinatura."
          : "Paciente não encontrado.",
      );
    }
    if (!contact.phone && !contact.email) {
      throw new Error("Quem vai assinar precisa ter WhatsApp ou e-mail no cadastro.");
    }

    const documentPath = `${crypto.randomUUID()}/original.pdf`;
    const upload = await supabaseAdmin.storage
      .from("signatures")
      .upload(documentPath, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) throw new Error("Não foi possível guardar o documento. Tente novamente.");

    const { rawToken, tokenHash } = generateRandomLinkToken();
    const { data: issued, error } = await (supabaseAdmin.rpc as any)("signature_issue_request", {
      p_patient_id: data.patientId,
      p_document_type: data.documentType,
      p_document_path: documentPath,
      p_document_sha256: sig.sha256Hex(bytes),
      p_signer_name: contact.name,
      p_signer_role: data.signerRole,
      p_token_hash: tokenHash,
      p_channel: data.channel,
      p_created_by: context.userId,
    });
    const parsed = z
      .object({
        code: z.literal("ok"),
        request_id: z.uuid(),
        expires_at: z.string(),
        verify_code: z.string(),
      })
      .safeParse(issued);
    if (error || !parsed.success) {
      await supabaseAdmin.storage.from("signatures").remove([documentPath]);
      throw new Error("Não foi possível criar o pedido de assinatura.");
    }

    const url = `${sig.SIGNATURE_BASE_URL}/assinar/${rawToken}`;
    let deliveredVia: "whatsapp" | "email" | null = null;
    if (data.channel === "link") {
      deliveredVia = await sig.deliverToSigner(
        contact,
        sig.buildLinkMessage(contact.name, data.documentType, url),
        `signature-link-${parsed.data.request_id}`,
      );
    }

    return {
      requestId: parsed.data.request_id,
      // Link: para copiar se o envio falhar. QR: conteúdo do QR mostrado na tela.
      url,
      expiresAt: parsed.data.expires_at,
      deliveredVia,
    };
  });

export const revokeSignatureRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ requestId: z.uuid() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await (supabaseAdmin.rpc as any)("signature_revoke_request", {
      p_request_id: data.requestId,
    });
    if (error) throw new Error("Não foi possível revogar o pedido.");
    if (result?.code !== "ok") throw new Error("Só pedidos pendentes podem ser revogados.");
    return { ok: true as const };
  });

// ============================================================================
// PÚBLICO (/assinar/$token)
// ============================================================================

export const openSignature = createServerFn({ method: "POST" })
  .validator((input: string) => tokenSchema.parse(input))
  .handler(async ({ data: token }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("read");
    const { maskName } = await import("@/lib/anamnesis");
    const { documentLabel } = await import("@/lib/signature.server");
    const { req, supabaseAdmin } = await openByToken(token);

    return {
      documentType: req.document_type,
      documentLabel: documentLabel(req.document_type),
      signerNameMasked: maskName(req.signer_name),
      signerRole: req.signer_role,
      otpVerified: req.otp_verified,
      // Documento só aparece depois do código conferido.
      documentUrl: req.otp_verified
        ? await signedDocumentUrl(supabaseAdmin, req.document_path)
        : null,
    };
  });

export const sendSignatureOtp = createServerFn({ method: "POST" })
  .validator((input: string) => tokenSchema.parse(input))
  .handler(async ({ data: token }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("action");
    const sig = await import("@/lib/signature.server");
    const { tokenHash, req, supabaseAdmin } = await openByToken(token);

    const contact = await loadSignerContact(req.patient_id, req.signer_role);
    if (!contact || (!contact.phone && !contact.email)) {
      throw new Error("Não há contato para enviar o código. Fale com o consultório.");
    }

    const otp = sig.generateOtp();
    const { data: stored, error } = await (supabaseAdmin.rpc as any)("signature_set_otp", {
      p_token_hash: tokenHash,
      p_otp_hash: sig.hashOtp(tokenHash, otp),
    });
    if (error) throw new Error("Não foi possível gerar o código. Tente novamente.");
    if (stored?.code === "locked") {
      throw new Error("Limite de códigos atingido. Peça um novo link ao consultório.");
    }
    if (stored?.code !== "ok") throw new Error(INVALID_LINK);

    const via = await sig.deliverToSigner(
      contact,
      sig.buildOtpMessage(otp),
      `signature-otp-${req.request_id}-${Number(stored.sends_left)}`,
    );
    if (!via)
      throw new Error("Não foi possível enviar o código agora. Tente de novo em instantes.");

    const contactMasked = sig.maskContact(contact, via);
    await (supabaseAdmin.rpc as any)("signature_record_otp_delivery", {
      p_token_hash: tokenHash,
      p_channel: via,
      p_contact_masked: contactMasked,
    });

    return { sentVia: via, contactMasked, sendsLeft: Number(stored.sends_left) };
  });

export const verifySignatureOtp = createServerFn({ method: "POST" })
  .validator(z.object({ token: tokenSchema, otp: z.string().regex(/^\d{6}$/, "Código inválido.") }))
  .handler(async ({ data }) => {
    const { enforceClinicalLinkLimit } = await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("action");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { hashLinkToken } = await import("@/lib/appointment-links.server");
    const { hashOtp } = await import("@/lib/signature.server");

    const tokenHash = hashLinkToken(data.token);
    const { data: result, error } = await (supabaseAdmin.rpc as any)("signature_verify_otp", {
      p_token_hash: tokenHash,
      p_otp_hash: hashOtp(tokenHash, data.otp),
    });
    if (error) throw new Error("Não foi possível conferir o código. Tente novamente.");

    switch (result?.code) {
      case "ok":
        return { ok: true as const };
      case "otp_invalid":
        return {
          ok: false as const,
          reason: "invalid" as const,
          attemptsLeft: result.attempts_left,
        };
      case "otp_expired":
        return { ok: false as const, reason: "expired" as const };
      case "locked":
        return { ok: false as const, reason: "locked" as const };
      default:
        throw new Error(INVALID_LINK);
    }
  });

export const completeSignature = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: tokenSchema,
      accepted: z.literal(true, "Marque a declaração para assinar."),
      // PNG do canvas, opcional (~300 KB no máximo)
      rubricPngBase64: z.string().max(400_000).nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { enforceClinicalLinkLimit, getClientIp } =
      await import("@/lib/clinical-link-limit.server");
    await enforceClinicalLinkLimit("action");
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const sig = await import("@/lib/signature.server");
    const { tokenHash, req, supabaseAdmin } = await openByToken(data.token);

    if (!req.otp_verified || !req.otp_channel) {
      throw new Error("Confirme o código enviado ao seu celular antes de assinar.");
    }

    const rubric = data.rubricPngBase64
      ? new Uint8Array(Buffer.from(data.rubricPngBase64, "base64"))
      : null;
    if (rubric && !sig.isPng(rubric)) throw new Error("Rubrica inválida. Limpe e desenhe de novo.");

    // S6: o arquivo guardado precisa ser exatamente o que foi congelado na emissão.
    const download = await supabaseAdmin.storage.from("signatures").download(req.document_path);
    if (download.error || !download.data) {
      throw new Error("Não foi possível carregar o documento. Tente novamente.");
    }
    const original = new Uint8Array(await download.data.arrayBuffer());
    if (sig.sha256Hex(original) !== req.document_sha256) {
      console.error(`[assinatura] Hash divergente no pedido ${req.request_id}`);
      throw new Error("O documento foi alterado e não pode ser assinado. Fale com o consultório.");
    }

    const signedAt = new Date();
    const ip = getClientIp();
    const userAgent = getRequestHeader("user-agent") ?? null;
    const signedPdf = await sig.buildSignedPdf({
      original,
      documentType: req.document_type,
      documentSha256: req.document_sha256,
      signerName: req.signer_name,
      signerRole: req.signer_role,
      signedAt,
      ip,
      userAgent,
      verificationLabel: `Código de uso único enviado por ${
        req.otp_channel === "whatsapp" ? "WhatsApp" : "e-mail"
      } para ${req.otp_contact_masked ?? "o contato cadastrado"}`,
      consentText: CONSENT_TEXT,
      consentVersion: CONSENT_TEXT_VERSION,
      verifyCode: req.verify_code,
      rubricPng: rubric,
    });

    const folder = req.document_path.replace(/\/[^/]+$/, "");
    const signedPath = `${folder}/assinado-${signedAt.getTime()}.pdf`;
    const rubricPath = rubric ? `${folder}/rubrica-${signedAt.getTime()}.png` : null;
    const bucket = supabaseAdmin.storage.from("signatures");
    const uploads = await Promise.all([
      bucket.upload(signedPath, signedPdf, { contentType: "application/pdf", upsert: false }),
      rubric && rubricPath
        ? bucket.upload(rubricPath, rubric, { contentType: "image/png", upsert: false })
        : Promise.resolve({ error: null }),
    ]);
    const cleanup = () => bucket.remove([signedPath, ...(rubricPath ? [rubricPath] : [])]);
    if (uploads.some((u) => u.error)) {
      await cleanup();
      throw new Error("Não foi possível salvar a assinatura. Tente novamente.");
    }

    const { data: result, error } = await (supabaseAdmin.rpc as any)("signature_complete", {
      p_token_hash: tokenHash,
      p_document_sha256: sig.sha256Hex(original),
      p_signed_at: signedAt.toISOString(),
      p_signed_pdf_path: signedPath,
      p_signed_pdf_sha256: sig.sha256Hex(signedPdf),
      p_ip: ip,
      p_user_agent: userAgent,
      p_consent_text_version: CONSENT_TEXT_VERSION,
      p_rubric_png_path: rubricPath,
    });
    if (error || result?.code !== "ok") {
      await cleanup();
      if (result?.code === "otp_required") {
        throw new Error("O código expirou. Peça um novo código para assinar.");
      }
      throw new Error(
        error ? "Não foi possível concluir a assinatura. Tente novamente." : INVALID_LINK,
      );
    }

    return {
      signedAt: signedAt.toISOString(),
      verifyUrl: sig.verifyUrl(req.verify_code),
      // Via do paciente: baixar logo (URL vale 60s)
      signedPdfUrl: await signedDocumentUrl(supabaseAdmin, signedPath),
    };
  });
