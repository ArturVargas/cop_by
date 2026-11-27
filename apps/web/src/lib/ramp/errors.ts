export class RampError extends Error {
  constructor(readonly code: string, message: string, readonly status = 400, readonly retryable = false) { super(message); this.name = "RampError"; }
}
export function asRampError(error: unknown): RampError {
  return error instanceof RampError ? error : new RampError("INTERNAL_ERROR", "No pudimos completar la operación.", 500, true);
}
