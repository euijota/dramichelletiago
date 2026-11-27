import { expect, test, devices } from "@playwright/test";
import {
  createAdmin,
  createPatient,
  db,
  latestOtp,
  openPatientDocuments,
  resetState,
  samplePdf,
  seedRequest,
} from "./helpers";

// Assinatura eletrônica do paciente (docs/ASSINATURA_DIGITAL.md, critérios S1–S12).

const mobile = { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } };

test.beforeEach(async () => {
  await resetState();
});

test("paciente assina por link no celular e a assinatura pode ser verificada", async ({
  browser,
}) => {
  const patientId = await createPatient(`Paciente E2E ${Date.now()}`);
  const { token, requestId, verifyCode } = await seedRequest(patientId, "link");

  const context = await browser.newContext(mobile);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  // 1. Identidade: documento só aparece depois do código (S4)
  await page.goto(`/assinar/${token}`);
  await expect(page.getByRole("heading", { name: "Confirme que é você" })).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.getByRole("button", { name: "Receber código" }).click();
  await expect(page.getByText("(96) 98***-****")).toBeVisible();

  await page.getByLabel("Código de verificação").fill("000000");
  await page.getByRole("button", { name: "Confirmar código" }).click();
  await expect(page.getByRole("alert")).toContainText("Código incorreto. 4 tentativa(s)");

  await page.getByLabel("Código de verificação").fill(await latestOtp());
  await page.getByRole("button", { name: "Confirmar código" }).click();

  // 2. Leitura + declaração
  await expect(page.getByRole("heading", { name: "Leia o documento" })).toBeVisible();
  await expect(page.locator("iframe")).toBeVisible();
  const sign = page.getByRole("button", { name: "Assinar documento" });
  await expect(sign).toBeDisabled();
  await page.getByLabel(/Declaro que li e compreendi/).check();
  await sign.click();

  // 3. Concluído
  await expect(page.getByRole("heading", { name: "Documento assinado" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Baixar minha via/ })).toBeVisible();

  // Evidência imutável gravada com o canal real do código (S7/S8)
  const { data: evidence } = await db
    .from("signature_evidence" as never)
    .select("verification_method, verified_contact_masked, signed_pdf_sha256")
    .eq("request_id", requestId)
    .single();
  expect(evidence).toMatchObject({
    verification_method: "otp_whatsapp",
    verified_contact_masked: "(96) 98***-****",
  });
  const tamper = await db
    .from("signature_evidence" as never)
    .update({ ip: "9.9.9.9" } as never)
    .eq("request_id", requestId);
  expect(tamper.error?.message).toContain("imutável");

  // Link é de uso único (S5)
  await page.goto(`/assinar/${token}`);
  await expect(
    page.getByRole("heading", { name: "Não foi possível abrir o documento" }),
  ).toBeVisible();

  // Verificação pública sem conteúdo clínico (S7)
  await page.goto(`/verificar/${verifyCode}`);
  await expect(page.getByRole("heading", { name: "Assinatura válida" })).toBeVisible();
  await expect(page.getByText("P******* E**").or(page.getByText(/P\*+ E\*+/))).toBeVisible();
  await expect(
    page.getByText((evidence as unknown as { signed_pdf_sha256: string }).signed_pdf_sha256),
  ).toBeVisible();

  // Mobile sem rolagem horizontal (S11)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
  await context.close();
});

test("doutora pede assinatura com QR no painel e acompanha em tempo real", async ({ browser }) => {
  const patientName = `Paciente QR ${Date.now()}`;
  await createPatient(patientName);
  const admin = await createAdmin();

  const panel = await browser.newPage();
  await openPatientDocuments(panel, admin, patientName);
  await panel.getByRole("button", { name: "Pedir assinatura" }).click();

  const dialog = panel.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "tcle.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await samplePdf("TCLE - E2E QR")),
  });
  // "Responsável legal" bloqueado sem responsável no cadastro
  await expect(dialog.getByRole("radio", { name: /Responsável legal/ })).toBeDisabled();

  const created = panel.waitForResponse(
    (r) => r.url().includes("_serverFn") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Gerar QR code" }).click();
  const token = (await (await created).text()).match(/\/assinar\/([A-Za-z0-9_-]{43})/)?.[1];
  expect(token).toBeTruthy();

  const qrDialog = panel.getByRole("dialog");
  await expect(qrDialog.getByRole("img", { name: /QR code para assinar/ })).toBeVisible();
  await expect(qrDialog.getByText(/Expira em 1[45]:/)).toBeVisible();

  // Paciente "escaneia" no próprio celular: o QR some do painel (S3)
  const phone = await browser.newContext(mobile);
  const patient = await phone.newPage();
  await patient.goto(`/assinar/${token}`);
  await expect(qrDialog.getByText("Link aberto. Aguardando o código")).toBeVisible();
  await expect(qrDialog.getByRole("img", { name: /QR code para assinar/ })).toHaveCount(0);

  await patient.getByRole("button", { name: "Receber código" }).click();
  await patient.getByLabel("Código de verificação").fill(await latestOtp());
  await patient.getByRole("button", { name: "Confirmar código" }).click();
  await expect(qrDialog.getByText("Identidade confirmada")).toBeVisible();

  await patient.getByLabel(/Declaro que li e compreendi/).check();
  await patient.getByRole("button", { name: "Assinar documento" }).click();
  await expect(patient.getByRole("heading", { name: "Documento assinado" })).toBeVisible();

  // Painel atualiza sem recarregar (S9)
  await expect(qrDialog.getByRole("heading", { name: "Documento assinado" })).toBeVisible();
  await qrDialog.getByRole("button", { name: "Concluir" }).click();
  await expect(panel.getByRole("button", { name: "PDF assinado" })).toBeVisible();

  await phone.close();
});

test("doutora revoga pedido pendente e o link deixa de funcionar", async ({ browser }) => {
  const patientName = `Paciente Revoga ${Date.now()}`;
  const patientId = await createPatient(patientName);
  const { token } = await seedRequest(patientId, "link");
  const admin = await createAdmin();

  const panel = await browser.newPage();
  await openPatientDocuments(panel, admin, patientName);

  panel.once("dialog", (d) => d.accept());
  await panel.getByRole("button", { name: "Revogar" }).click();
  await expect(panel.getByText("Revogado", { exact: true })).toBeVisible();

  const patient = await browser.newPage();
  await patient.goto(`/assinar/${token}`);
  await expect(
    patient.getByRole("heading", { name: "Não foi possível abrir o documento" }),
  ).toBeVisible();
});
