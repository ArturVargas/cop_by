import type { ProviderEvent, RampOperation, RampProviderId, RampRepository } from "../types";

/** Test double only; production always requires D1. */
export class MemoryRepository implements RampRepository {
  operations = new Map<string, RampOperation>();
  events = new Map<string, { provider: RampProviderId; event: ProviderEvent; done: boolean }>();
  async reserve(operation: RampOperation) {
    const existing = [...this.operations.values()].find(v => v.customerId === operation.customerId && v.idempotencyKey === operation.idempotencyKey);
    if (existing) return { operation: structuredClone(existing), created: false };
    this.operations.set(operation.id, structuredClone(operation)); return { operation, created: true };
  }
  async get(customer: string, id: string) { const v = this.operations.get(id); return v?.customerId === customer ? structuredClone(v) : null; }
  async save(operation: RampOperation, version: number) {
    if (this.operations.get(operation.id)?.version !== version) return false;
    this.operations.set(operation.id, structuredClone(operation)); return true;
  }
  async candidates(limit: number) { return [...this.operations.values()].filter(v => v.quote && !["paid", "refunded", "failed", "expired"].includes(v.state)).slice(0, limit).map(v => structuredClone(v)); }
  async inbox(provider: RampProviderId, event: ProviderEvent) {
    const key = `${provider}:${event.id}`, old = this.events.get(key);
    if (old && old.event.digest !== event.digest) throw new Error("Webhook conflict");
    if (!old) this.events.set(key, { provider, event, done: !event.relevant });
  }
  async pendingEvents(limit: number) { return [...this.events.values()].filter(v => !v.done).slice(0, limit); }
  async byAction(provider: RampProviderId, action: string) { const v = [...this.operations.values()].find(v => v.provider === provider && v.quote?.providerActionId === action); return v ? structuredClone(v) : null; }
  async completeEvent(provider: RampProviderId, id: string) { this.events.get(`${provider}:${id}`)!.done = true; }
}
