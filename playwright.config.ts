import { execSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

// E2E contra o Supabase LOCAL (`supabase start` + migrations aplicadas), nunca produção.
// As chaves vêm do `supabase status`; o WhatsApp é um webhook falso que guarda as
// mensagens em memória para o teste ler o código de verificação.

function localSupabase() {
  try {
    const raw = execSync("supabase status -o json", { stdio: ["ignore", "pipe", "ignore"] });
    const s = JSON.parse(raw.toString());
    return {
      url: s.API_URL as string,
      anon: s.ANON_KEY as string,
      service: s.SERVICE_ROLE_KEY as string,
    };
  } catch {
    throw new Error("Supabase local não está rodando. Rode `supabase start` antes do e2e.");
  }
}

const sb = localSupabase();
const PORT = 5180;
const WEBHOOK_PORT = 8788;

process.env.E2E_SUPABASE_URL = sb.url;
process.env.E2E_SUPABASE_SERVICE_KEY = sb.service;
process.env.E2E_WEBHOOK_URL = `http://127.0.0.1:${WEBHOOK_PORT}`;
process.env.E2E_CALENDAR_FEED_TOKEN = "e2e-only-calendar-feed-token-0123456789abc";

const appEnv = {
  SUPABASE_URL: sb.url,
  VITE_SUPABASE_URL: sb.url,
  SUPABASE_SERVICE_ROLE_KEY: sb.service,
  SUPABASE_PUBLISHABLE_KEY: sb.anon,
  VITE_SUPABASE_PUBLISHABLE_KEY: sb.anon,
  SIGNATURE_OTP_SECRET: "e2e-only-signature-otp-secret-0123456789",
  CLINICAL_RATE_LIMIT_SECRET: "e2e-only-rate-limit-secret-0123456789ab",
  CALENDAR_FEED_TOKEN: process.env.E2E_CALENDAR_FEED_TOKEN,
  WHATSAPP_WEBHOOK_URL: `http://127.0.0.1:${WEBHOOK_PORT}/hook`,
  VERCEL: "",
};

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `node tests/e2e/fake-whatsapp.mjs ${WEBHOOK_PORT}`,
      url: `http://127.0.0.1:${WEBHOOK_PORT}/messages`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite dev --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: appEnv,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
