import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSignedPdf,
  deliverToSigner,
  formatSignedAt,
  isPng,
  generateOtp,
  hashOtp,
  isPdf,
  resolveSignerContact,
  sha256Hex,
  toWhatsAppPhone,
} from "./signature.server";
import { EMPTY_GUARDIANS_DATA, serializePatientNotes } from "./patient-guardians";

const mocks = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/email.server", async (original) => ({
  ...(await original<typeof import("./email.server")>()),
  sendClinicalEmail: mocks.send,
}));

const tokenHash = "a".repeat(64);

beforeEach(() => {
  vi.stubEnv("SIGNATURE_OTP_SECRET", "s".repeat(40));
  vi.stubEnv("RESEND_API_KEY", "k".repeat(40));
  vi.stubEnv("CLINICAL_EMAIL_FROM", "agenda@example.com");
  mocks.send.mockReset().mockResolvedValue({ status: "accepted", providerId: "x" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("código de verificação", () => {
  it("gera sempre 6 dígitos", () => {
    for (let i = 0; i < 200; i++) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("hash depende do segredo, do pedido e do código", () => {
    const h = hashOtp(tokenHash, "123456");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(hashOtp(tokenHash, "123456")).toBe(h);
    expect(hashOtp(tokenHash, "123457")).not.toBe(h);
    expect(hashOtp("b".repeat(64), "123456")).not.toBe(h);
    // Não é SHA-256 puro do código (seria revertido por força bruta)
    expect(h).not.toBe(sha256Hex(new TextEncoder().encode("123456")));
    vi.stubEnv("SIGNATURE_OTP_SECRET", "t".repeat(40));
    expect(hashOtp(tokenHash, "123456")).not.toBe(h);
  });

  it("recusa segredo ausente ou curto", () => {
    vi.stubEnv("SIGNATURE_OTP_SECRET", "curto");
    expect(() => hashOtp(tokenHash, "123456")).toThrow(/SIGNATURE_OTP_SECRET/);
  });
});

describe("validação do documento", () => {
  it("aceita só PDF pela assinatura mágica", () => {
    expect(isPdf(new TextEncoder().encode("%PDF-1.7 ..."))).toBe(true);
    expect(isPdf(new TextEncoder().encode("<html>"))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
  });

  it("sha256 hex conhecido", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("contato de quem assina", () => {
  const patient = {
    name: " Ana Clara Souza ",
    phone: "(96) 98111-2222",
    email: "ana@example.com",
    notes: null as string | null,
    birth_date: "2015-03-01",
  };

  it("paciente usa os próprios dados", () => {
    expect(resolveSignerContact(patient, "paciente")).toEqual({
      name: "Ana Clara Souza",
      phone: "(96) 98111-2222",
      email: "ana@example.com",
    });
  });

  it("responsável legal vem do cadastro de responsáveis", () => {
    const notes = serializePatientNotes({
      ...EMPTY_GUARDIANS_DATA,
      hasGuardian: true,
      guardianName: "Maria Souza",
      guardianPhone: "96 99999-0000",
      guardianEmail: "maria@example.com",
    });
    expect(resolveSignerContact({ ...patient, notes }, "responsavel_legal")).toEqual({
      name: "Maria Souza",
      phone: "96 99999-0000",
      email: "maria@example.com",
    });
  });

  it("sem responsável cadastrado não deixa pedir assinatura do responsável", () => {
    expect(resolveSignerContact(patient, "responsavel_legal")).toBeNull();
  });

  it("formata telefone para WhatsApp com DDI", () => {
    expect(toWhatsAppPhone("(96) 98111-2222")).toBe("5596981112222");
    expect(toWhatsAppPhone("5596981112222")).toBe("5596981112222");
    expect(toWhatsAppPhone("1234")).toBeNull();
  });
});

describe("envio para quem assina", () => {
  const contact = { name: "Ana", phone: "96981112222", email: "ana@example.com" };
  const msg = { event: "signature_otp", text: "Código 123456", subject: "Código" };

  it("usa WhatsApp quando o webhook aceita", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_URL", "https://wa.example.com/hook");
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(deliverToSigner(contact, msg, "k1")).resolves.toBe("whatsapp");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      phone: "5596981112222",
      event: "signature_otp",
      text: "Código 123456",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("cai para e-mail se o WhatsApp falhar", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_URL", "https://wa.example.com/hook");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x", { status: 500 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(deliverToSigner(contact, msg, "k2")).resolves.toBe("email");
    expect(mocks.send.mock.calls[0][0].to).toEqual(["ana@example.com"]);
    expect(mocks.send.mock.calls[0][1]).toBe("k2");
  });

  it("retorna null quando nenhum canal aceita", async () => {
    vi.stubEnv("WHATSAPP_WEBHOOK_URL", "");
    mocks.send.mockResolvedValue({ status: "permanent" });
    await expect(deliverToSigner(contact, msg, "k3")).resolves.toBeNull();
  });
});

describe("PDF final assinado", () => {
  async function samplePdf(pages: number) {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([595.28, 841.89]);
    return doc.save();
  }

  const base = {
    documentType: "tcle",
    documentSha256: "b".repeat(64),
    signerName: "Ana Clara Souza 😀",
    signerRole: "paciente" as const,
    signedAt: new Date("2026-11-27T15:04:05Z"),
    ip: "200.1.2.3",
    userAgent: "Mozilla/5.0 (iPhone)",
    verificationLabel: "Código de uso único enviado por WhatsApp para (96) 98***-****",
    consentText: "Declaro que li e concordo.",
    consentVersion: "v1",
    verifyCode: "0123456789abcdef",
  };

  it("mantém as páginas originais e acrescenta o manifesto", async () => {
    const { PDFDocument } = await import("pdf-lib");
    const original = await samplePdf(2);
    const out = await buildSignedPdf({ ...base, original });
    expect(isPdf(out)).toBe(true);
    const loaded = await PDFDocument.load(out);
    expect(loaded.getPageCount()).toBe(3);
    expect(loaded.getTitle()).toContain("assinado");
  });

  it("embute a rubrica quando enviada", async () => {
    const QRCode = (await import("qrcode")).default;
    const png = new Uint8Array(await QRCode.toBuffer("rubrica", { type: "png" }));
    expect(isPng(png)).toBe(true);
    const out = await buildSignedPdf({ ...base, original: await samplePdf(1), rubricPng: png });
    expect(out.length).toBeGreaterThan(
      (await buildSignedPdf({ ...base, original: await samplePdf(1) })).length,
    );
  });

  it("horário impresso é o de Macapá", () => {
    expect(formatSignedAt(base.signedAt)).toBe("27/11/2026, 12:04:05");
  });
});
