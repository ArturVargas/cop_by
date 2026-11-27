import { createHash } from "node:crypto";
import { amountToUnits, unitsToAmount } from "../domain";
import { RampError } from "../errors";
import type { ProviderEvent, QuoteRequest, RampProvider, RampQuote } from "../types";

/** Explicit simulation. No destination, XDR or real money instructions are generated. */
export class MockRampProvider implements RampProvider {
  readonly id = "mock" as const;
  capability() { return { id: this.id, available: true, networks: ["testnet" as const] }; }
  async createQuote(request: QuoteRequest): Promise<RampQuote> {
    if (request.network !== "testnet") throw new RampError("UNSUPPORTED_NETWORK", "La simulación solo admite Testnet.", 422);
    const id = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    return { providerQuoteId: `mock-${id}`, providerActionId: `mock-action-${id}`, expiresAt: new Date(Date.now() + 300_000).toISOString(), sourceAmount: request.amount, destinationAmount: unitsToAmount(amountToUnits(request.amount, 7) * 5n / 100_000n, 2), fees: [], funding: { kind: "simulation" } };
  }
  async getStatus() { return { state: "awaiting_funding" as const, observedAt: Date.now() }; }
  verifyWebhook(): ProviderEvent { throw new RampError("WEBHOOK_NOT_SUPPORTED", "La simulación no admite webhooks.", 404); }
}
