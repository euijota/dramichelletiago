import crypto from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Cliente service_role do Supabase LOCAL (chaves preenchidas pelo playwright.config).
export const db = createClient(
  process.env.E2E_SUPABASE_URL!,
  process.env.E2E_SUPABASE_SERVICE_KEY!,
  { auth: { persistSession: false } },
);

const webhook = process.env.E2E_WEBHOOK_URL!;

export async function samplePdf(title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595.28, 841.89]);
  page.drawText(title, { x: 50, y: 780, size: 14, font });
  page.drawText("Documento de teste e2e.", { x: 50, y: 750, size: 10, font });
  return doc.save();
}

/** Limpa o limite por IP e as mensagens do webhook (o e2e faz muitas ações seguidas). */
export async function resetState() {
  await db.from("clinical_link_rate_buckets").delete().gte("request_count", 0);
  await fetch(`${webhook}/messages`, { method: "DELETE" });
}

export async function createPatient(name: string) {
  const { data, error } = await db
    .from("patients")
    .insert({ name, phone: "(96) 98111-2222", email: "paciente-e2e@example.test" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Cria um pedido como o servidor faz: PDF no bucket privado, hash e token por hash. */
export async function seedRequest(patientId: string, channel: "link" | "qr" = "link") {
  const pdf = await samplePdf("TERMO DE CONSENTIMENTO - E2E");
  const path = `${crypto.randomUUID()}/original.pdf`;
  const up = await db.storage.from("signatures").upload(path, pdf, {
    contentType: "application/pdf",
  });
  if (up.error) throw up.error;
  const token = crypto.randomBytes(32).toString("base64url");
  const { data, error } = await db.rpc(
    "signature_issue_request" as never,
    {
      p_patient_id: patientId,
      p_document_type: "tcle",
      p_document_path: path,
      p_document_sha256: crypto.createHash("sha256").update(pdf).digest("hex"),
      p_signer_name: "Paciente E2E",
      p_signer_role: "paciente",
      p_token_hash: crypto.createHash("sha256").update(token).digest("hex"),
      p_channel: channel,
      p_created_by: null,
    } as never,
  );
  if (error) throw error;
  const result = data as unknown as { request_id: string; verify_code: string };
  return { token, requestId: result.request_id, verifyCode: result.verify_code };
}

/** Último código de 6 dígitos que o "WhatsApp" recebeu. */
export async function latestOtp(): Promise<string> {
  let otp: string | undefined;
  await expect
    .poll(async () => {
      const messages = (await fetch(`${webhook}/messages`).then((r) => r.json())) as {
        event: string;
        text: string;
      }[];
      otp = messages
        .filter((m) => m.event === "signature_otp")
        .at(-1)
        ?.text.match(/\b(\d{6})\b/)?.[1];
      return otp;
    })
    .toBeTruthy();
  return otp!;
}

export async function createAdmin() {
  const email = `admin-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = crypto.randomBytes(18).toString("base64url");
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const role = await db.from("user_roles").insert({ user_id: data.user.id, role: "admin" });
  if (role.error) throw role.error;
  return { email, password };
}

/** Faz login como admin e abre a aba Documentos do prontuário do paciente. */
export async function openPatientDocuments(
  page: Page,
  admin: { email: string; password: string },
  patientName: string,
) {
  await page.goto("/auth");
  // Antes de o React hidratar, enviar o form faz um GET nativo para /auth? em vez de logar.
  await page.waitForFunction(() =>
    Object.keys(document.querySelector("form") ?? {}).some((k) => k.startsWith("__reactProps")),
  );
  await page.getByPlaceholder("E-mail").fill(admin.email);
  await page.getByPlaceholder("Senha").fill(admin.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/painel/);

  await page.getByText("Pacientes", { exact: true }).first().click();
  // A lista é paginada e o banco local acumula pacientes: buscar, não contar com a página 1.
  await page.getByPlaceholder(/Encontre pacientes por nome/).fill(patientName);
  await page.getByText(patientName, { exact: true }).click();
  await page.getByRole("tab", { name: "Documentos" }).click();
}
