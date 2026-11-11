// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let db: PGlite;
const hash = (seed: string) => createHash("sha256").update(seed).digest("hex");
async function rpc(name: string, values: unknown[] = []) {
  const args = values.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.query<{ result: any }>(
    `SELECT public.${name}(${args}) AS result`,
    values,
  );
  return result.rows[0].result;
}
async function appointment() {
  const id = randomUUID();
  await db.query(
    "INSERT INTO appointments(id,patient_name,patient_phone,appointment_date,appointment_time,notes) VALUES ($1,'Paciente Teste','96981112222','2099-11-10','15:00','Observação preservada')",
    [id],
  );
  return id;
}
async function issue(id: string, seed = "token-test") {
  expect((await rpc("clinical_issue_appointment_link", [id, hash(seed)])).code).toBe("ok");
  return hash(seed);
}
const payload = {
  from: "agenda@example.com",
  to: ["clinic@example.com"],
  subject: "Teste",
  html: "<p>Teste</p>",
  text: "Teste",
  template_version: 1,
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE TYPE appointment_status AS ENUM ('pending','confirmed','cancelled','completed');
    CREATE TABLE appointments(id uuid PRIMARY KEY, patient_name text NOT NULL, patient_phone text,
      appointment_date date NOT NULL, appointment_time time NOT NULL, status appointment_status NOT NULL DEFAULT 'pending',
      notes text, confirmed_at timestamptz, updated_at timestamptz DEFAULT now());`);
  const jobsSql = await readFile(
    new URL(
      "../../supabase/migrations/20261110200408_clinical_notification_jobs.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(
    jobsSql.slice(
      jobsSql.indexOf("CREATE OR REPLACE FUNCTION public.clinical_cleanup_expired_buckets"),
    ),
  );
  for (const path of [
    "20261110191957_clinical_notification_core.sql",
    "20261110200352_integrate_clinical_notification_flow.sql",
    "20261110200530_restrict_legacy_appointment_actions.sql",
    "20261111004050_clinical_notification_operations.sql",
  ]) {
    await db.exec(
      await readFile(new URL(`../../supabase/migrations/${path}`, import.meta.url), "utf8"),
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec(
    "RESET ROLE; DROP TRIGGER IF EXISTS reject_event ON clinical_notification_events; TRUNCATE appointments CASCADE; TRUNCATE clinical_link_rate_buckets;",
  );
});
afterAll(async () => {
  await db?.close();
});

describe("SQL real do core clínico em PostgreSQL isolado", () => {
  it("limita ações e leituras separadamente e só registra hash da origem", async () => {
    const source = hash("fixture-origin");
    for (const [kind, allowed] of [
      ["action", 10],
      ["read", 30],
    ] as const) {
      for (let i = 0; i < allowed; i++) {
        expect((await rpc("clinical_consume_link_limit", [source, kind])).allowed).toBe(true);
      }
      expect((await rpc("clinical_consume_link_limit", [source, kind])).allowed).toBe(false);
    }
    expect(
      (await rpc("clinical_consume_link_limit", [hash("other-origin"), "action"])).allowed,
    ).toBe(true);
  });

  it("sinaliza atraso, falha terminal e recuperação após revisão", async () => {
    const id = await appointment();
    const token = await issue(id);
    const action = await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    expect(await rpc("clinical_notification_health")).toBe("healthy");
    await db.query(
      "UPDATE clinical_notification_events SET created_at=now()-interval '61 seconds' WHERE id=$1",
      [action.event_id],
    );
    expect(await rpc("clinical_notification_health")).toBe("delayed");
    await db.query(
      "UPDATE clinical_notification_events SET status='failed', next_attempt_at=null WHERE id=$1",
      [action.event_id],
    );
    expect(await rpc("clinical_notification_health")).toBe("failed");
    expect(
      (await rpc("clinical_acknowledge_notification", [action.event_id, randomUUID()])).code,
    ).toBe("ok");
    expect(await rpc("clinical_notification_health")).toBe("healthy");
  });

  it("remove eventos terminais e links antigos, preservando consultas e eventos pendentes", async () => {
    const id = await appointment();
    const token = await issue(id);
    const action = await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    await db.query(
      "UPDATE appointment_link_tokens SET revoked_at=now()-interval '31 days' WHERE appointment_id=$1",
      [id],
    );
    await db.query(
      "UPDATE clinical_notification_events SET created_at=now()-interval '31 days' WHERE id=$1",
      [action.event_id],
    );
    await rpc("clinical_purge_expired_notification_data");
    expect((await db.query("SELECT id FROM appointment_link_tokens")).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM clinical_notification_events")).rows).toHaveLength(1);
    await db.query(
      "UPDATE clinical_notification_events SET status='accepted', accepted_at=now()-interval '31 days', next_attempt_at=null WHERE id=$1",
      [action.event_id],
    );
    await rpc("clinical_purge_expired_notification_data");
    expect((await db.query("SELECT id FROM clinical_notification_events")).rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM appointments")).rows).toHaveLength(1);
  });
  it("guarda somente hash e revoga o link anterior na reemissão", async () => {
    const id = await appointment();
    const first = await issue(id, "first");
    await issue(id, "second");
    expect((await rpc("clinical_preview_appointment", [first])).code).toBe("invalid_link");
    expect((await rpc("clinical_apply_patient_action", [first, "confirm", null])).code).toBe(
      "invalid_link",
    );
  });
  it("persiste consulta e evento juntos; repetição não duplica", async () => {
    const id = await appointment();
    const token = await issue(id);
    const first = await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    expect(first.code).toBe("ok");
    expect(first.event_id).toBeTruthy();
    expect((await rpc("clinical_apply_patient_action", [token, "confirm", null])).code).toBe(
      "already_applied",
    );
    expect((await db.query("SELECT * FROM clinical_notification_events")).rows).toHaveLength(1);
  });
  it("falha ao criar evento reverte a alteração da consulta", async () => {
    const id = await appointment();
    const token = await issue(id);
    await db.exec(`CREATE OR REPLACE FUNCTION reject_test_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$;
      CREATE TRIGGER reject_event BEFORE INSERT ON clinical_notification_events FOR EACH ROW EXECUTE FUNCTION reject_test_event();`);
    await expect(rpc("clinical_apply_patient_action", [token, "confirm", null])).rejects.toThrow();
    expect(
      (await db.query<{ status: string }>("SELECT status FROM appointments WHERE id=$1", [id]))
        .rows[0].status,
    ).toBe("pending");
  });
  it("cancelamento preserva notas e guarda motivo em campo próprio", async () => {
    const id = await appointment();
    const token = await issue(id);
    await rpc("clinical_apply_patient_action", [token, "cancel", "Imprevisto"]);
    const row = (
      await db.query("SELECT notes,cancellation_reason FROM appointments WHERE id=$1", [id])
    ).rows[0];
    expect(row).toEqual({ notes: "Observação preservada", cancellation_reason: "Imprevisto" });
  });
  it("reagendar revoga credencial antes de nova ação", async () => {
    const id = await appointment();
    const token = await issue(id);
    await db.query("UPDATE appointments SET appointment_date='2099-11-11' WHERE id=$1", [id]);
    expect((await rpc("clinical_apply_patient_action", [token, "confirm", null])).code).toBe(
      "invalid_link",
    );
  });
  it("reservas são individuais; liberar uma não revive um evento iniciado", async () => {
    for (const seed of ["one", "two"]) {
      const id = await appointment();
      const token = await issue(id, seed);
      await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    }
    const events = await rpc("clinical_claim_notification_events", [10]);
    expect(events).toHaveLength(2);
    expect(events[0].lease_id).not.toBe(events[1].lease_id);
    const first = events[0];
    const begin = await rpc("clinical_begin_notification_attempt", [
      first.id,
      first.lease_id,
      payload,
    ]);
    expect(begin.frozen_payload).toEqual(payload);
    expect(
      (await rpc("clinical_release_unstarted_events", [events.map((event: any) => event.lease_id)]))
        .released_count,
    ).toBe(1);
    expect(
      (
        await db.query<{ status: string }>(
          "SELECT status FROM clinical_notification_events WHERE id=$1",
          [first.id],
        )
      ).rows[0].status,
    ).toBe("processing");
  });
  it("reagendamento após reserva supera o evento antes de iniciar HTTP", async () => {
    const id = await appointment();
    const token = await issue(id);
    await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    const [event] = await rpc("clinical_claim_notification_events", [10]);
    await db.query("UPDATE appointments SET appointment_time='16:00' WHERE id=$1", [id]);
    expect(
      (await rpc("clinical_begin_notification_attempt", [event.id, event.lease_id, payload])).code,
    ).not.toBe("ok");
  });
  it("limita recuperação à janela de idempotência sem reenvio incerto tardio", async () => {
    const id = await appointment();
    const token = await issue(id);
    await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    await db.exec(
      "UPDATE clinical_notification_events SET first_request_intent_at=now()-interval '25 hours', status='uncertain'",
    );
    expect(await rpc("clinical_claim_notification_events", [10])).toEqual([]);
    const row = (await db.query("SELECT status,next_attempt_at FROM clinical_notification_events"))
      .rows[0];
    expect(row).toEqual({ status: "uncertain", next_attempt_at: null });
  });
  it("rejeita link expirado e não cria evento", async () => {
    const id = await appointment();
    const token = await issue(id);
    await db.query(
      "UPDATE appointment_link_tokens SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE token_hash=$1",
      [token],
    );
    expect((await rpc("clinical_apply_patient_action", [token, "confirm", null])).code).toBe(
      "invalid_link",
    );
    expect((await db.query("SELECT id FROM clinical_notification_events")).rows).toHaveLength(0);
  });
  it("reserva vencida não inicia; retentativa preserva payload e chave", async () => {
    const id = await appointment();
    const token = await issue(id);
    await rpc("clinical_apply_patient_action", [token, "confirm", null]);
    const [first] = await rpc("clinical_claim_notification_events", [10]);
    const begin = await rpc("clinical_begin_notification_attempt", [
      first.id,
      first.lease_id,
      payload,
    ]);
    await rpc("clinical_finish_notification_attempt", [
      first.id,
      first.lease_id,
      "uncertain",
      null,
      "timeout",
      null,
    ]);
    await db.exec(
      "UPDATE clinical_notification_events SET next_attempt_at=now()-interval '1 second'",
    );
    const [retry] = await rpc("clinical_claim_notification_events", [10]);
    expect(retry.frozen_payload).toEqual(payload);
    expect(
      (
        await rpc("clinical_begin_notification_attempt", [
          retry.id,
          retry.lease_id,
          { ...payload, subject: "Alterado" },
        ])
      ).code,
    ).toBe("invalid_payload");
    const resumed = await rpc("clinical_begin_notification_attempt", [
      retry.id,
      retry.lease_id,
      payload,
    ]);
    expect(resumed.idempotency_key).toBe(begin.idempotency_key);
    await db.exec(
      "UPDATE clinical_notification_events SET lease_expires_at=now()-interval '1 second'",
    );
    expect(
      (await rpc("clinical_begin_notification_attempt", [retry.id, retry.lease_id, payload])).code,
    ).toBe("stale_lease");
  });
  it("papéis públicos não executam RPC privilegiada", async () => {
    await db.exec("SET ROLE anon");
    try {
      await expect(
        rpc("clinical_issue_appointment_link", [randomUUID(), hash("forbidden")]),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("RESET ROLE");
    }
  });
});
