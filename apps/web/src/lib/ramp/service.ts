import { randomUUID } from "node:crypto";
import { applyObservation } from "./domain";
import { asRampError, RampError } from "./errors";
import type { RampCodec } from "./codec";
import type { ProviderResolver, QuoteRequest, RampOperation, RampRepository } from "./types";

/** Only this projection leaves the server. Requests, keys and provider identifiers stay private. */
export function publicOperation(operation: RampOperation, now = Date.now()) {
  const q = operation.quote;
  const canFund = !!q && !!operation.acceptedAt && !operation.reportedTxHash && Date.parse(q.expiresAt) > now && operation.state === "awaiting_funding";
  return { id: operation.id, provider: operation.provider, state: operation.state, network: operation.request.network,
    simulation: operation.provider === "mock",
    ...(operation.providerStatus?{providerStatus:operation.providerStatus}:{}), createdAt: operation.createdAt, updatedAt: operation.updatedAt,
    ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
    ...(operation.receiptId ? { receiptId: operation.receiptId } : {}),
    ...(operation.refundReceiptId ? { refundReceiptId: operation.refundReceiptId } : {}),
    ...(operation.failureCode ? { failureCode: operation.failureCode } : {}),
    receiptPending: operation.provider === "pods" && operation.state === "paid" && !operation.receiptId,
    ...(q ? { quote: { expiresAt: q.expiresAt, sourceAmount: q.sourceAmount, sourceCurrency: "USDC", destinationAmount: q.destinationAmount, destinationCurrency: q.destinationCurrency ?? "BRL", totalAmount:q.totalAmount??q.sourceAmount, consumerFeeWallet:q.consumerFeeWallet, settlementTime:q.settlementTime, fees: q.fees, recipientName: q.recipientName,
      canFund, ...(canFund ? { funding: q.funding } : {}) } } : {}) };
}
export class RampService {
  constructor(private readonly repository: RampRepository, private readonly provider: ProviderResolver, private readonly codec: RampCodec, private readonly now: () => number = Date.now) {}
  async get(customer: string, id: string): Promise<RampOperation> {
    const operation = await this.repository.get(customer, id);
    if (!operation) throw new RampError("OPERATION_NOT_FOUND", "Operación no encontrada.", 404);
    return operation;
  }
  async create(customer: string, key: string, request: QuoteRequest): Promise<RampOperation> {
    const requestHash = this.codec.fingerprint(request), timestamp = new Date(this.now()).toISOString();
    const reserved = await this.repository.reserve({ id: randomUUID(), customerId: customer, provider: request.provider, idempotencyKey: key, requestHash, request, state: "quoting", version: 0, createdAt: timestamp, updatedAt: timestamp });
    if (reserved.operation.requestHash !== requestHash) throw new RampError("IDEMPOTENCY_CONFLICT", "La misma clave de idempotencia ya se usó con otros datos.", 409);
    if (!reserved.created) return reserved.operation;
    const operation = reserved.operation;
    try {
      operation.quote = await this.provider(operation.provider).createQuote(request,{customerId:customer,operationId:operation.id,idempotencyKey:`quote:${operation.id}`});
      operation.state = "quoted";
    } catch (error) {
      const safe = asRampError(error); operation.state = safe.retryable ? "needs_attention" : "failed"; operation.errorCode = safe.code;
    }
    operation.version++; operation.updatedAt = new Date(this.now()).toISOString();
    if (!await this.repository.save(operation, 0)) return this.get(customer, operation.id);
    return operation;
  }
  private async change(customer: string, id: string, update: (operation: RampOperation) => void): Promise<RampOperation> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const operation = await this.get(customer, id), version = operation.version;
      update(operation); operation.version++; operation.updatedAt = new Date(this.now()).toISOString();
      if (await this.repository.save(operation, version)) return operation;
    }
    throw new RampError("OPERATION_BUSY", "La operación está actualizándose. Consulta de nuevo.", 409, true);
  }
  async getForClient(customer:string,id:string):Promise<RampOperation> {
    const operation=await this.get(customer,id);
    if(operation.acceptancePending&&this.provider(operation.provider).prepareFunding)return this.reconcile(customer,id);
    if(operation.acceptedAt&&!operation.reportedTxHash&&operation.state==="awaiting_funding"&&this.provider(operation.provider).prepareFunding)return this.reconcile(customer,id);
    if(operation.quote&&!operation.quote.providerPaymentId&&operation.state==="quoted"&&Date.parse(operation.quote.expiresAt)<=this.now()&&this.provider(operation.provider).prepareFunding)return this.reconcile(customer,id);
    return operation;
  }
  async accept(customer: string, id: string): Promise<RampOperation> {
    const current=await this.get(customer,id),provider=this.provider(current.provider);
    if(provider.prepareFunding) {
      if(current.acceptedAt)return this.reconcile(customer,id);
      const pending=await this.change(customer,id,operation=>{
        if(operation.acceptedAt)return;
        if(!operation.quote||!operation.acceptancePending&&operation.state!=="quoted")throw new RampError("QUOTE_NOT_READY","La cotización no está disponible para aceptar.",409);
        if(!operation.acceptanceStartedAt&&Date.parse(operation.quote.expiresAt)<=this.now())throw new RampError("QUOTE_EXPIRED","La cotización venció. Solicita una nueva.",409);
        if(!operation.quote.providerPaymentId&&operation.acceptanceStartedAt&&this.now()-Date.parse(operation.acceptanceStartedAt)>23*60*60*1000)throw new RampError("ACCEPTANCE_REVIEW_REQUIRED","El resultado de creación requiere revisión antes de reintentar.",409);
        operation.acceptanceStartedAt??=new Date(this.now()).toISOString();operation.acceptancePending=true;
      });
      if(pending.acceptedAt)return this.reconcile(customer,id);
      let prepared;
      try {prepared=await provider.prepareFunding(pending.request,pending.quote!,{customerId:customer,operationId:id,idempotencyKey:`payment:${id}`,recovery:current.acceptancePending===true,mayRetryCreation:this.now()-Date.parse(pending.acceptanceStartedAt!)<=23*60*60*1000,rememberPayment:async paymentId=>{
        await this.change(customer,id,operation=>{
          if(!operation.quote)throw new RampError("QUOTE_NOT_READY","La cotización no está disponible.",409);
          if(operation.quote.providerPaymentId&&operation.quote.providerPaymentId!==paymentId)throw new RampError("PAYMENT_CONFLICT","La operación ya tiene otro pago vinculado.",409);
          operation.quote.providerPaymentId=paymentId;operation.quote.providerActionId=paymentId;
        });
      }});}
      catch(error){const safe=asRampError(error);const retained=await this.change(customer,id,operation=>{if(operation.acceptedAt)return;const recoverable=safe.retryable||!!operation.quote?.providerPaymentId;operation.errorCode=safe.code;operation.acceptancePending=recoverable;operation.state=recoverable?"needs_attention":safe.code.includes("QUOTE_EXPIRED")?"expired":"failed";});throw retained.acceptancePending&&!safe.retryable?new RampError(safe.code,safe.message,safe.status,true):safe;}
      const accepted=await this.change(customer,id,operation=>{
        if(operation.quote?.providerPaymentId&&operation.quote.providerPaymentId!==prepared.providerPaymentId)throw new RampError("PAYMENT_CONFLICT","La operación ya tiene otro pago vinculado.",409);
        if(operation.acceptedAt)return;operation.quote=prepared;operation.acceptedAt=new Date(this.now()).toISOString();operation.acceptancePending=false;operation.state=prepared.paymentState??"awaiting_funding";operation.providerStatus=prepared.providerStatus;delete operation.errorCode;
      });
      return accepted.state==="awaiting_funding"&&!accepted.reportedTxHash?this.reconcile(customer,id):accepted;
    }
    return this.change(customer, id, operation => {
      if (operation.acceptedAt) return;
      if (!operation.quote || operation.state !== "quoted") throw new RampError("QUOTE_NOT_READY", "La cotización no está disponible para aceptar.", 409);
      if (Date.parse(operation.quote.expiresAt) <= this.now()) throw new RampError("QUOTE_EXPIRED", "La cotización venció. Solicita una nueva.", 409);
      if (operation.quote.funding.kind === "unavailable") throw new RampError("FUNDING_UNAVAILABLE", "Pods debe confirmar el contrato de fondeo Stellar antes de continuar.", 409);
      operation.acceptedAt = new Date(this.now()).toISOString(); operation.state = "awaiting_funding";
    });
  }
  async reportFunding(customer: string, id: string, hash: string): Promise<RampOperation> {
    if (!/^[a-f0-9]{64}$/i.test(hash)) throw new RampError("INVALID_TX_HASH", "Se requiere un hash de transacción Stellar válido.");
    const normalized = hash.toLowerCase();
    return this.change(customer, id, operation => {
      if (!operation.acceptedAt) throw new RampError("QUOTE_NOT_ACCEPTED", "Debes aceptar la cotización antes de reportar el envío.", 409);
      if (operation.reportedTxHash && operation.reportedTxHash !== normalized) throw new RampError("FUNDING_CONFLICT", "Ya hay otra transacción registrada para esta operación.", 409);
      operation.reportedTxHash = normalized;
      if (["awaiting_funding", "quoted"].includes(operation.state)) operation.state = "funding_reported";
    });
  }
  async reconcile(customer: string, id: string): Promise<RampOperation> {
    const snapshot = await this.get(customer, id);
    if (!snapshot.quote) return snapshot;
    if(this.provider(snapshot.provider).prepareFunding&&snapshot.acceptancePending)return this.accept(customer,id);
    if(this.provider(snapshot.provider).prepareFunding&&!snapshot.quote.providerPaymentId) {
      if(snapshot.state==="quoted"&&Date.parse(snapshot.quote.expiresAt)<=this.now())return this.change(customer,id,operation=>{if(!operation.acceptancePending&&!operation.acceptedAt&&operation.state==="quoted")operation.state="expired";});
      return snapshot;
    }
    const observation = await this.provider(snapshot.provider).getStatus(snapshot.request, snapshot.quote);
    return this.change(customer, id, operation => {
      if (observation.observedAt < (operation.providerObservedAt ?? 0)) return;
      const next = applyObservation(operation.state, operation.providerObservedAt ?? 0, observation);
      operation.state = operation.state === "quoted" && next === "awaiting_funding" ? "quoted" : next;
      operation.providerObservedAt = observation.observedAt;
      if(observation.providerStatus)operation.providerStatus=observation.providerStatus;
      if(operation.quote&&observation.funding) {
        operation.quote.funding=observation.funding;
        if(observation.fees)operation.quote.fees=observation.fees;
        if(observation.sourceAmount)operation.quote.sourceAmount=observation.sourceAmount;
        if(observation.totalAmount)operation.quote.totalAmount=observation.totalAmount;
      }
      if (observation.receiptId && !operation.receiptId) operation.receiptId = observation.receiptId;
      if (observation.refundReceiptId && !operation.refundReceiptId) operation.refundReceiptId = observation.refundReceiptId;
      if (observation.failureCode) operation.failureCode = observation.failureCode;
      delete operation.errorCode;
    });
  }
  /** Signed webhooks only enqueue. Scheduler + status polling provide recovery without provider retries. */
  async reconcileBatch(limit: number) {
    let reconciled = 0, events = 0, errors = 0;
    const seen = new Set<string>();
    for (const item of await this.repository.pendingEvents(limit)) {
      try {
        const operation = item.event.actionId ? await this.repository.byAction(item.provider, item.event.actionId) : null;
        if (!operation) continue; // A webhook can arrive before the quote is committed.
        await this.reconcile(operation.customerId, operation.id); seen.add(operation.id); reconciled++;
        await this.repository.completeEvent(item.provider, item.event.id); events++;
      } catch { errors++; }
    }
    for (const operation of await this.repository.candidates(limit)) {
      if (seen.has(operation.id)) continue;
      try { await this.reconcile(operation.customerId, operation.id); reconciled++; } catch { errors++; }
    }
    return { reconciled, events, errors };
  }
}
