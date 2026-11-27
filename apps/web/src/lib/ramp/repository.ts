import type { getSql } from "@/lib/db";
import type { RampCodec } from "./codec";
import { RampError } from "./errors";
import type { ProviderEvent, RampOperation, RampProviderId, RampRepository } from "./types";

type Row = Record<string, unknown>;
/** Schema is installed by an explicit migration, never by an HTTP request. */
export class PostgresRampRepository implements RampRepository {
  constructor(private readonly sql: ReturnType<typeof getSql>, private readonly codec: RampCodec) {}
  private decode(row: Row): RampOperation {
    const operation = this.codec.decrypt<RampOperation>(String(row.encrypted_data), String(row.customer_id), String(row.id));
    if (operation.id !== row.id || operation.customerId !== row.customer_id || operation.provider !== row.provider || operation.state !== row.state || operation.version !== row.version || operation.requestHash !== row.request_hash || operation.idempotencyKey !== row.idempotency_key || (operation.quote?.providerQuoteId ?? null) !== row.provider_quote_id || (operation.quote?.providerActionId ?? null) !== row.provider_action_id) throw new Error("Ramp snapshot integrity mismatch");
    return operation;
  }
  async reserve(operation: RampOperation) {
    const encrypted = this.codec.encrypt(operation, operation.customerId, operation.id);
    const rows = await this.sql`
      WITH inserted AS (
        INSERT INTO ramp_operations (id, customer_id, provider, idempotency_key, request_hash, state, version, encrypted_data, created_at, updated_at)
        VALUES (${operation.id}, ${operation.customerId}, ${operation.provider}, ${operation.idempotencyKey}, ${operation.requestHash}, ${operation.state}, ${operation.version}, ${encrypted}, ${operation.createdAt}, ${operation.updatedAt})
        ON CONFLICT (customer_id, idempotency_key) DO NOTHING RETURNING *
      ), audit AS (
        INSERT INTO ramp_operation_events (operation_id, version, state, occurred_at)
        SELECT id, version, state, updated_at FROM inserted
      ) SELECT * FROM inserted`;
    if (rows[0]) return { operation: this.decode(rows[0]), created: true };
    // Separate statement sees the concurrent insert after ON CONFLICT waits for its commit.
    const existing = await this.sql`SELECT * FROM ramp_operations WHERE customer_id = ${operation.customerId} AND idempotency_key = ${operation.idempotencyKey}`;
    if (!existing[0]) throw new Error("Missing ramp idempotency reservation");
    return { operation: this.decode(existing[0]), created: false };
  }
  async get(customer: string, id: string) {
    const rows = await this.sql`SELECT * FROM ramp_operations WHERE customer_id = ${customer} AND id = ${id}`;
    return rows[0] ? this.decode(rows[0]) : null;
  }
  async save(operation: RampOperation, expectedVersion: number) {
    const encrypted = this.codec.encrypt(operation, operation.customerId, operation.id);
    const rows = await this.sql`
      WITH changed AS (
        UPDATE ramp_operations SET state = ${operation.state}, version = ${operation.version}, encrypted_data = ${encrypted},
          provider_quote_id = ${operation.quote?.providerQuoteId ?? null}, provider_action_id = ${operation.quote?.providerActionId ?? null}, updated_at = ${operation.updatedAt}
        WHERE id = ${operation.id} AND customer_id = ${operation.customerId} AND version = ${expectedVersion}
        RETURNING id, version, state, updated_at
      ), audit AS (
        INSERT INTO ramp_operation_events (operation_id, version, state, occurred_at)
        SELECT id, version, state, updated_at FROM changed
      ) SELECT id FROM changed`;
    return rows.length === 1;
  }
  async candidates(limit: number) {
    const rows = await this.sql`
      SELECT * FROM ramp_operations WHERE provider_quote_id IS NOT NULL AND state <> 'refunded'
        AND (state NOT IN ('paid','expired','failed') OR created_at > NOW() - INTERVAL '7 days')
      ORDER BY updated_at ASC LIMIT ${limit}`;
    return rows.map(row => this.decode(row));
  }
  async inbox(provider: RampProviderId, event: ProviderEvent) {
    const rows = await this.sql`
      INSERT INTO ramp_webhook_events (provider, event_id, digest, action_id, relevant, processed)
      VALUES (${provider}, ${event.id}, ${event.digest}, ${event.actionId}, ${event.relevant}, ${!event.relevant})
      ON CONFLICT (provider, event_id) DO UPDATE SET event_id = EXCLUDED.event_id
        WHERE ramp_webhook_events.digest = EXCLUDED.digest
      RETURNING event_id`;
    if (!rows.length) throw new RampError("WEBHOOK_CONFLICT", "Este evento ya existe con otro contenido.", 409);
  }
  async pendingEvents(limit: number) {
    const rows = await this.sql`
      WITH selected AS (
        SELECT provider, event_id FROM ramp_webhook_events WHERE processed = FALSE
        ORDER BY COALESCE(attempted_at, received_at) ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
      ) UPDATE ramp_webhook_events AS e SET attempted_at = NOW() FROM selected AS s
        WHERE e.provider = s.provider AND e.event_id = s.event_id RETURNING e.*`;
    return rows.map(row => ({ provider: row.provider as RampProviderId, event: { id: String(row.event_id), digest: String(row.digest), actionId: row.action_id === null ? null : String(row.action_id), relevant: row.relevant === true } }));
  }
  async byAction(provider: RampProviderId, action: string) {
    const rows = await this.sql`SELECT * FROM ramp_operations WHERE provider = ${provider} AND provider_action_id = ${action}`;
    return rows[0] ? this.decode(rows[0]) : null;
  }
  async completeEvent(provider: RampProviderId, eventId: string) {
    await this.sql`UPDATE ramp_webhook_events SET processed = TRUE WHERE provider = ${provider} AND event_id = ${eventId}`;
  }
}
