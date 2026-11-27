import { RampError } from "../errors";
import type { ProviderEvent, ProviderObservation, QuoteRequest, RampProvider, RampQuote } from "../types";

/** Replace only this adapter when TuCOP publishes its enabled Stellar contract. */
export class TucopRampProvider implements RampProvider {
  readonly id = "tucop" as const;
  capability() { return { id: this.id, available: false, networks: [], reason: "TUCOP_STELLAR_NOT_ENABLED" }; }
  private unavailable(): never { throw new RampError("PROVIDER_NOT_AVAILABLE", "TuCOP Stellar todavía no está habilitado.", 503); }
  async createQuote(_request: QuoteRequest): Promise<RampQuote> { return this.unavailable(); }
  async getStatus(_request: QuoteRequest, _quote: RampQuote): Promise<ProviderObservation> { return this.unavailable(); }
  verifyWebhook(): ProviderEvent { return this.unavailable(); }
}
