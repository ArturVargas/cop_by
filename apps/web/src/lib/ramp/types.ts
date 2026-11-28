export type RampProviderId = "pods" | "tucop" | "mock";
export type RampNetwork = "mainnet" | "testnet";
export type RampState = "quoting" | "quoted" | "awaiting_funding" | "funding_reported" | "processing" | "paid" | "refunded" | "expired" | "failed" | "needs_attention";
export type FiatCurrency = "BRL" | "COP" | "MXN";
export type PodsQuoteRequest = { provider: "pods" | "mock"; network: RampNetwork; sourceAddress: string; amount: string; pixKey: string; thirdParty: boolean; kycUserId: string };
export type TucopQuoteRequest = {provider:"tucop";network:RampNetwork;sourceAddress:string;amount:string;currency:FiatCurrency;destinationId:string;returnMemo:string};
export type QuoteRequest = PodsQuoteRequest | TucopQuoteRequest;
export type ProviderContext = {customerId:string;operationId:string;idempotencyKey:string;recovery?:boolean;mayRetryCreation?:boolean;rememberPayment?:(id:string)=>Promise<void>};
export type FundingInstructions =
  | { kind: "stellar_payment"; network: RampNetwork; sourceAddress: string; destination: string; memo?:string; memolessDestination?:string; amount: string; assetCode: "USDC"; assetIssuer: string }
  | { kind: "simulation" }
  | { kind: "unavailable"; reason: string };
export type RampFee = { kind: string; label: string; amount: string; currency: "USDC" | FiatCurrency };
export type RampQuote = { providerQuoteId: string; providerActionId?: string; providerTokenId?: string; providerPaymentId?:string; providerDestinationId?:string; paymentState?:RampState; providerStatus?:string; destinationCurrency?:FiatCurrency; totalAmount?:string; consumerFeeWallet?:string; settlementTime?:{minMinutes:number;maxMinutes:number}; expiresAt: string; sourceAmount: string; destinationAmount: string; fees: RampFee[]; recipientName?: string; funding: FundingInstructions };
export type ProviderObservation = { fees?:RampFee[]; funding?:FundingInstructions; sourceAmount?:string; totalAmount?:string; providerStatus?:string; state: RampState; observedAt: number; receiptId?: string; refundReceiptId?: string; failureCode?: string };
export type ProviderEvent = { id: string; digest: string; actionId: string | null; relevant: boolean };
export type ProviderCapability = { id: RampProviderId; available: boolean; networks: RampNetwork[]; reason?: string };
export interface RampProvider {
  readonly id: RampProviderId;
  capability(): ProviderCapability;
  createQuote(request: QuoteRequest, context?:ProviderContext): Promise<RampQuote>;
  prepareFunding?(request:QuoteRequest,quote:RampQuote,context:ProviderContext):Promise<RampQuote>;
  getStatus(request: QuoteRequest, quote: RampQuote): Promise<ProviderObservation>;
  verifyWebhook(raw: Uint8Array, headers: Headers): ProviderEvent;
}
export type RampOperation = { id: string; customerId: string; provider: RampProviderId; idempotencyKey: string; requestHash: string; request: QuoteRequest; state: RampState; version: number; quote?: RampQuote; acceptanceStartedAt?:string; acceptancePending?:boolean; providerStatus?:string; acceptedAt?: string; reportedTxHash?: string; providerObservedAt?: number; receiptId?: string; refundReceiptId?: string; failureCode?: string; errorCode?: string; createdAt: string; updatedAt: string };
export interface RampRepository {
  reserve(operation: RampOperation): Promise<{ operation: RampOperation; created: boolean }>;
  get(customerId: string, id: string): Promise<RampOperation | null>;
  save(operation: RampOperation, expectedVersion: number): Promise<boolean>;
  candidates(limit: number): Promise<RampOperation[]>;
  inbox(provider: RampProviderId, event: ProviderEvent): Promise<void>;
  pendingEvents(limit: number): Promise<{ provider: RampProviderId; event: ProviderEvent }[]>;
  byAction(provider: RampProviderId, actionId: string): Promise<RampOperation | null>;
  completeEvent(provider: RampProviderId, eventId: string): Promise<void>;
}
export type ProviderResolver = (id: RampProviderId) => RampProvider;
