export class PayAgentProtocolError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PayAgentProtocolError";
    this.code = code;
  }
}

export class PreflightDeniedError extends PayAgentProtocolError {
  readonly checks: unknown;

  constructor(message: string, checks: unknown) {
    super("PREFLIGHT_DENIED", message);
    this.name = "PreflightDeniedError";
    this.checks = checks;
  }
}

export class RecordFailedError extends PayAgentProtocolError {
  readonly txHash: string;
  readonly idempotencyKey: string;
  readonly status: number;
  readonly body: unknown;

  constructor(input: {
    txHash: string;
    idempotencyKey: string;
    status: number;
    body: unknown;
    message?: string;
  }) {
    super(
      "RECORD_FAILED",
      input.message ??
        `PayAgent did not record tx ${input.txHash} (HTTP ${input.status}). Retry record() with the same hash and idempotency key. Do not transfer again.`,
    );
    this.name = "RecordFailedError";
    this.txHash = input.txHash;
    this.idempotencyKey = input.idempotencyKey;
    this.status = input.status;
    this.body = input.body;
  }
}
