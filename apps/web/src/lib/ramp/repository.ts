import type { RampCodec } from "./codec";
import { RampError } from "./errors";
import type { ProviderEvent, RampOperation, RampProviderId, RampRepository } from "./types";

type Row = Record<string, unknown>;
export type RampStatement = { bind(...values: (string | number | null)[]): RampStatement; all<T = Row>(): Promise<{ results: T[] }>; first<T = Row>(): Promise<T | null>; run(): Promise<unknown> };
export type RampDatabase = { prepare(sql: string): RampStatement };
/** D1/SQLite triggers append the audit event in the same atomic write as the snapshot. */
export class D1RampRepository implements RampRepository {
  constructor(private readonly db: RampDatabase, private readonly codec: RampCodec) {}
  private decode(row: Row): RampOperation {
    const operation = this.codec.decrypt<RampOperation>(String(row.encrypted_data), String(row.customer_id), String(row.id));
    if (operation.id !== row.id || operation.customerId !== row.customer_id || operation.provider !== row.provider || operation.state !== row.state || operation.version !== row.version || operation.requestHash !== row.request_hash || operation.idempotencyKey !== row.idempotency_key || (operation.quote?.providerQuoteId ?? null) !== row.provider_quote_id || (operation.quote?.providerActionId ?? null) !== row.provider_action_id) throw new Error("Ramp snapshot integrity mismatch");
    return operation;
  }
  async reserve(operation: RampOperation) {
    const encrypted = this.codec.encrypt(operation, operation.customerId, operation.id);
    const row = await this.db.prepare(`INSERT INTO ramp_operations (id,customer_id,provider,idempotency_key,request_hash,state,version,encrypted_data,created_at,updated_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT (customer_id,idempotency_key) DO NOTHING RETURNING *`)
      .bind(operation.id, operation.customerId, operation.provider, operation.idempotencyKey, operation.requestHash, operation.state, operation.version, encrypted, operation.createdAt, operation.updatedAt).first();
    if (row) return { operation: this.decode(row), created: true };
    const existing = await this.db.prepare("SELECT * FROM ramp_operations WHERE customer_id=?1 AND idempotency_key=?2").bind(operation.customerId, operation.idempotencyKey).first();
    if (!existing) throw new Error("Missing ramp idempotency reservation");
    return { operation: this.decode(existing), created: false };
  }
  async get(customer: string, id: string) {
    const row = await this.db.prepare("SELECT * FROM ramp_operations WHERE customer_id=?1 AND id=?2").bind(customer, id).first();
    return row ? this.decode(row) : null;
  }
  async save(operation: RampOperation, version: number) {
    const row = await this.db.prepare(`UPDATE ramp_operations SET state=?1,version=?2,encrypted_data=?3,provider_quote_id=?4,provider_action_id=?5,updated_at=?6
      WHERE id=?7 AND customer_id=?8 AND version=?9 RETURNING id`).bind(operation.state, operation.version, this.codec.encrypt(operation, operation.customerId, operation.id), operation.quote?.providerQuoteId ?? null, operation.quote?.providerActionId ?? null, operation.updatedAt, operation.id, operation.customerId, version).first();
    return row !== null;
  }
  async candidates(limit: number) {
    const result = await this.db.prepare(`UPDATE ramp_operations SET reconcile_attempted_at=?1 WHERE id IN (
      SELECT id FROM ramp_operations WHERE provider_quote_id IS NOT NULL AND state<>'refunded'
        AND (state NOT IN ('paid','expired','failed') OR julianday(created_at)>julianday('now','-7 days'))
      ORDER BY COALESCE(reconcile_attempted_at,updated_at),id LIMIT ?2) RETURNING *`).bind(new Date().toISOString(), limit).all();
    return result.results.map(row => this.decode(row));
  }
  async inbox(provider: RampProviderId, event: ProviderEvent) {
    const row = await this.db.prepare(`INSERT INTO ramp_webhook_events (provider,event_id,digest,action_id,relevant,processed,received_at)
      VALUES (?1,?2,?3,?4,?5,?6,?7) ON CONFLICT (provider,event_id) DO UPDATE SET event_id=excluded.event_id
      WHERE ramp_webhook_events.digest=excluded.digest RETURNING event_id`).bind(provider,event.id,event.digest,event.actionId,Number(event.relevant),Number(!event.relevant),new Date().toISOString()).first();
    if (!row) throw new RampError("WEBHOOK_CONFLICT", "Este evento ya existe con otro contenido.", 409);
  }
  async pendingEvents(limit: number) {
    const result = await this.db.prepare(`UPDATE ramp_webhook_events SET attempted_at=?1 WHERE (provider,event_id) IN (
      SELECT provider,event_id FROM ramp_webhook_events WHERE processed=0 ORDER BY COALESCE(attempted_at,received_at),event_id LIMIT ?2) RETURNING *`).bind(new Date().toISOString(),limit).all();
    return result.results.map(row => ({ provider: row.provider as RampProviderId, event: { id:String(row.event_id),digest:String(row.digest),actionId:row.action_id === null ? null : String(row.action_id),relevant:row.relevant === 1 } }));
  }
  async byAction(provider: RampProviderId, action: string) {
    const row = await this.db.prepare("SELECT * FROM ramp_operations WHERE provider=?1 AND provider_action_id=?2").bind(provider,action).first();
    return row ? this.decode(row) : null;
  }
  async completeEvent(provider: RampProviderId, eventId: string) { await this.db.prepare("UPDATE ramp_webhook_events SET processed=1 WHERE provider=?1 AND event_id=?2").bind(provider,eventId).run(); }
}
