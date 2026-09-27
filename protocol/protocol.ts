import { toBaseUnits } from "./amount.js";
import {
  isEvmAddress,
  isEvmNetwork,
  isSolanaAddress,
  isSolanaNetwork,
  lookupAsset,
  sameAddress,
  type CatalogAsset,
} from "./catalog.js";
import { createHttpClient, newIdempotencyKey, type HttpClient } from "./client.js";
import {
  PayAgentProtocolError,
  PreflightDeniedError,
  RecordFailedError,
} from "./errors.js";
import { signAgentChallenge } from "./identity.js";
import type {
  AgentChallenge,
  AgentProof,
  Destination,
  PayAgentProtocolConfig,
  PayIntent,
  PayResult,
  PreflightCheck,
  PreflightResult,
  PublicPaymentLink,
  PublicProfile,
  WdkWalletAccount,
} from "./types.js";

const APPROVAL_REQUIRED = "APPROVAL_REQUIRED";

export class PayAgentProtocol {
  readonly account: WdkWalletAccount;
  readonly config: Required<Pick<PayAgentProtocolConfig, "apiKey" | "agentId" | "networkId">> & {
    baseUrl: string;
  };
  private readonly http: HttpClient;

  constructor(account: WdkWalletAccount, config: PayAgentProtocolConfig) {
    if (!account?.getAddress || !account.transfer) {
      throw new PayAgentProtocolError(
        "NO_ACCOUNT",
        "PayAgentProtocol requires a WDK WalletAccount (getAddress + transfer)",
      );
    }
    if (!config.apiKey?.trim()) {
      throw new PayAgentProtocolError("NO_API_KEY", "apiKey is required");
    }
    if (!config.agentId?.trim()) {
      throw new PayAgentProtocolError("NO_AGENT_ID", "agentId is required");
    }
    if (!config.networkId?.trim()) {
      throw new PayAgentProtocolError("NO_NETWORK", "networkId is required");
    }

    this.account = account;
    this.config = {
      baseUrl: (config.baseUrl ?? "https://www.payagent.co").replace(/\/$/, ""),
      apiKey: config.apiKey.trim(),
      agentId: config.agentId.trim(),
      networkId: config.networkId.trim(),
    };
    this.http = createHttpClient({
      baseUrl: this.config.baseUrl,
      apiKey: this.config.apiKey,
      fetchImpl: config.fetch ?? globalThis.fetch.bind(globalThis),
    });
  }

  async preflight(intent: PayIntent): Promise<PreflightResult> {
    const payerAddress = await this.account.getAddress();
    this.assertAccountFitsNetwork(payerAddress, this.intentNetwork(intent));
    return this.preflightForPayer(intent, payerAddress);
  }

  async pay(intent: PayIntent): Promise<PayResult> {
    const payerAddress = await this.account.getAddress();
    const networkId = this.intentNetwork(intent);
    this.assertAccountFitsNetwork(payerAddress, networkId);

    const idempotencyKey = newIdempotencyKey();
    const preflight = await this.preflightForPayer(intent, payerAddress);

    if (hasApprovalRequired(preflight.checks) && !intent.approvalId) {
      return {
        status: "approval_required",
        checks: preflight.checks,
        approvalId: approvalIdFromChecks(preflight.checks),
      };
    }

    if (!preflight.ready) {
      throw new PreflightDeniedError(
        "PayAgent preflight is not ready. No transfer was sent.",
        preflight.checks,
      );
    }

    const destination = await this.resolvePayee(intent);
    this.assertDestinationFitsAccount(payerAddress, destination);

    const asset = lookupAsset(destination.networkId, destination.tokenId);
    const units = toBaseUnits(destination.amount, asset.decimals);
    if (units <= 0n) {
      throw new PayAgentProtocolError("BAD_AMOUNT", "Amount must be greater than zero");
    }

    const txHash = await this.transfer(destination.recipientAddress, asset, units);

    if (typeof this.account.waitForTransaction === "function") {
      try {
        await this.account.waitForTransaction(txHash, { target: "confirmed" });
      } catch {
        // Hash exists. Record anyway; PayAgent verify may need a retry.
      }
    }

    return this.record({
      intent,
      destination,
      payerAddress,
      txHash,
      idempotencyKey,
    });
  }

  async record(input: {
    intent: PayIntent;
    destination: Destination;
    payerAddress: string;
    txHash: string;
    idempotencyKey: string;
  }): Promise<PayResult> {
    const body = recordBody(this.config.agentId, input.payerAddress, input.txHash, input.intent, input.destination);
    const { status, body: response } = await this.http.post("/api/v1/pay", body, {
      "Idempotency-Key": input.idempotencyKey,
    });

    if (status === 202) {
      const approvalId = readApprovalId(response);
      return {
        status: "approval_required",
        txHash: input.txHash,
        idempotencyKey: input.idempotencyKey,
        approvalId,
        checks: isRecord(response) && isRecord(response.checks)
          ? (response.checks as Record<string, PreflightCheck>)
          : undefined,
      };
    }

    if (status < 200 || status >= 300) {
      throw new RecordFailedError({
        txHash: input.txHash,
        idempotencyKey: input.idempotencyKey,
        status,
        body: response,
      });
    }

    return {
      status: "paid",
      txHash: input.txHash,
      idempotencyKey: input.idempotencyKey,
      destination: input.destination,
      record: response,
    };
  }

  async resolvePayee(intent: PayIntent): Promise<Destination> {
    if (intent.type === "link") {
      const link = await this.http.get(
        `/api/pay/${encodeURIComponent(intent.linkUsername)}/${encodeURIComponent(intent.linkId)}`,
      );
      const parsed = parsePublicLink(link);
      if (!parsed.recipientAddress) {
        throw new PayAgentProtocolError(
          "NO_RECIPIENT",
          "Payment link has no recipient address",
        );
      }
      if (parsed.canPay === false || (parsed.status && parsed.status !== "pending")) {
        throw new PayAgentProtocolError(
          "LINK_NOT_PAYABLE",
          `Payment link is not payable (${parsed.status ?? "unknown"})`,
        );
      }
      return {
        type: "link",
        recipientAddress: parsed.recipientAddress,
        amount: parsed.amount,
        tokenId: parsed.tokenId,
        networkId: parsed.networkId,
        linkUsername: parsed.username,
        linkId: parsed.publicId,
      };
    }

    if (intent.type === "profile") {
      const payload = await this.http.get(
        `/api/public/users/${encodeURIComponent(intent.recipientUsername)}`,
      );
      const profile = parsePublicProfile(payload);
      const wallet = profile.wallets.find((item) => item.networkId === intent.networkId);
      if (!wallet?.address) {
        throw new PayAgentProtocolError(
          "NO_RECIPIENT",
          `Recipient has no verified wallet on ${intent.networkId}`,
        );
      }
      return {
        type: "profile",
        recipientAddress: wallet.address,
        amount: intent.amount,
        tokenId: intent.tokenId,
        networkId: intent.networkId,
        recipientUsername: profile.username,
      };
    }

    return {
      type: "address",
      recipientAddress: intent.recipientAddress,
      amount: intent.amount,
      tokenId: intent.tokenId,
      networkId: intent.networkId,
    };
  }

  private async preflightForPayer(intent: PayIntent, payerAddress: string) {
    const query: Record<string, string | undefined> = {
      type: intent.type,
      agentId: this.config.agentId,
      payerAddress,
    };

    if (intent.type === "link") {
      query.linkUsername = intent.linkUsername;
      query.linkId = intent.linkId;
    } else if (intent.type === "profile") {
      query.recipientUsername = intent.recipientUsername;
      query.tokenId = intent.tokenId;
      query.networkId = intent.networkId;
      query.amount = String(intent.amount);
    } else {
      query.recipientAddress = intent.recipientAddress;
      query.tokenId = intent.tokenId;
      query.networkId = intent.networkId;
      query.amount = String(intent.amount);
    }

    const body = await this.http.get("/api/v1/pay/preflight", query);
    return parsePreflight(body);
  }

  private async transfer(recipient: string, asset: CatalogAsset, units: bigint) {
    if (asset.kind === "native") {
      if (typeof this.account.sendTransaction !== "function") {
        throw new PayAgentProtocolError(
          "NO_NATIVE_SEND",
          "This WalletAccount cannot send native ETH/SOL. Fund a token pay or pass sendTransaction.",
        );
      }
      const result = await this.account.sendTransaction({
        to: recipient,
        value: units,
      });
      return readHash(result);
    }

    if (!asset.address) {
      throw new PayAgentProtocolError("NO_TOKEN", `Missing contract/mint for ${asset.tokenId}`);
    }

    const result = await this.account.transfer({
      token: asset.address,
      recipient,
      amount: units,
    });
    return readHash(result);
  }

  private intentNetwork(intent: PayIntent) {
    if (intent.type === "link") return this.config.networkId;
    return intent.networkId;
  }

  private assertAccountFitsNetwork(payerAddress: string, networkId: string) {
    if (isEvmNetwork(networkId) && !isEvmAddress(payerAddress)) {
      throw new PayAgentProtocolError(
        "NETWORK_MISMATCH",
        `WalletAccount ${payerAddress} is not an EVM address for ${networkId}`,
      );
    }
    if (isSolanaNetwork(networkId) && !isSolanaAddress(payerAddress)) {
      throw new PayAgentProtocolError(
        "NETWORK_MISMATCH",
        `WalletAccount ${payerAddress} is not a Solana address for ${networkId}`,
      );
    }
    if (isEvmNetwork(this.config.networkId) !== isEvmNetwork(networkId)) {
      throw new PayAgentProtocolError(
        "NETWORK_MISMATCH",
        `Protocol is bound to ${this.config.networkId}, intent uses ${networkId}`,
      );
    }
  }

  private assertDestinationFitsAccount(payerAddress: string, destination: Destination) {
    this.assertAccountFitsNetwork(payerAddress, destination.networkId);
    if (destination.networkId !== this.config.networkId) {
      throw new PayAgentProtocolError(
        "NETWORK_MISMATCH",
        `Destination network ${destination.networkId} does not match protocol ${this.config.networkId}`,
      );
    }
    if (
      isEvmNetwork(destination.networkId) &&
      !isEvmAddress(destination.recipientAddress)
    ) {
      throw new PayAgentProtocolError("BAD_RECIPIENT", "Recipient is not a valid EVM address");
    }
    if (
      isSolanaNetwork(destination.networkId) &&
      !isSolanaAddress(destination.recipientAddress)
    ) {
      throw new PayAgentProtocolError("BAD_RECIPIENT", "Recipient is not a valid Solana address");
    }
    if (sameAddress(payerAddress, destination.recipientAddress, destination.networkId)) {
      throw new PayAgentProtocolError("SELF_PAY", "Payer and recipient addresses are the same");
    }
  }

  async issueCredential(ttlHours?: number) {
    const { status, body } = await this.http.post("/api/v1/agents/credentials", {
      agentId: this.config.agentId,
      ttlHours,
    });
    if (status < 200 || status >= 300) {
      throw new PayAgentProtocolError("CREDENTIAL_ISSUE_FAILED", httpError(body, status));
    }
    return body;
  }

  async getPublicCredential(publicId: string) {
    return this.http.get(
      `/agents/${encodeURIComponent(publicId.trim())}/credential.json`,
    );
  }

  async createChallenge(publicId: string): Promise<AgentChallenge> {
    const { status, body } = await this.http.post("/api/public/agent-challenge", {
      publicId: publicId.trim(),
      networkId: this.config.networkId,
    });
    if (status < 200 || status >= 300) {
      throw new PayAgentProtocolError("CHALLENGE_FAILED", httpError(body, status));
    }
    if (
      !isRecord(body) ||
      typeof body.challengeId !== "string" ||
      typeof body.message !== "string" ||
      typeof body.publicId !== "string" ||
      typeof body.networkId !== "string" ||
      typeof body.expiresAt !== "string"
    ) {
      throw new PayAgentProtocolError("CHALLENGE_FAILED", "Unexpected challenge response");
    }
    return {
      challengeId: body.challengeId,
      publicId: body.publicId,
      networkId: body.networkId,
      message: body.message,
      expiresAt: body.expiresAt,
    };
  }

  async prove(publicId: string): Promise<AgentProof> {
    const address = await this.account.getAddress();
    const challenge = await this.createChallenge(publicId);
    const signature = await signAgentChallenge(this.account, challenge.message);
    const { status, body } = await this.http.post("/api/public/agent-challenge/verify", {
      challengeId: challenge.challengeId,
      address,
      signature,
    });
    if (status < 200 || status >= 300) {
      throw new PayAgentProtocolError("PROVE_FAILED", httpError(body, status));
    }
    if (!isRecord(body) || body.ok !== true || typeof body.publicId !== "string") {
      throw new PayAgentProtocolError("PROVE_FAILED", "Unexpected verify response");
    }
    return {
      ok: true,
      publicId: body.publicId,
      address: typeof body.address === "string" ? body.address : address,
      networkId: typeof body.networkId === "string" ? body.networkId : this.config.networkId,
      credential: body.credential,
    };
  }
}

function httpError(body: unknown, status: number) {
  if (isRecord(body) && typeof body.error === "string") return body.error;
  return `Request failed (${status})`;
}

function parsePreflight(body: unknown): PreflightResult {
  if (!isRecord(body) || typeof body.ready !== "boolean" || !isRecord(body.checks)) {
    throw new PayAgentProtocolError("BAD_PREFLIGHT", "Unexpected preflight response");
  }
  return {
    ready: body.ready,
    type: body.type === "profile" || body.type === "address" ? body.type : "link",
    checks: body.checks as Record<string, PreflightCheck>,
  };
}

function parsePublicLink(body: unknown): PublicPaymentLink {
  const link = isRecord(body) && isRecord(body.link) ? body.link : body;
  if (
    !isRecord(link) ||
    typeof link.username !== "string" ||
    typeof link.publicId !== "string" ||
    typeof link.tokenId !== "string" ||
    typeof link.networkId !== "string" ||
    (typeof link.amount !== "number" && typeof link.amount !== "string")
  ) {
    throw new PayAgentProtocolError("BAD_LINK", "Unexpected payment link response");
  }
  return {
    username: link.username,
    publicId: link.publicId,
    amount: typeof link.amount === "number" ? link.amount : Number(link.amount),
    tokenId: link.tokenId,
    networkId: link.networkId,
    recipientAddress:
      typeof link.recipientAddress === "string" ? link.recipientAddress : null,
    canPay: typeof link.canPay === "boolean" ? link.canPay : undefined,
    status: typeof link.status === "string" ? link.status : undefined,
  };
}

function parsePublicProfile(body: unknown): PublicProfile {
  const profile = isRecord(body) && isRecord(body.profile) ? body.profile : body;
  if (!isRecord(profile) || typeof profile.username !== "string" || !Array.isArray(profile.wallets)) {
    throw new PayAgentProtocolError("BAD_PROFILE", "Unexpected profile response");
  }
  return {
    username: profile.username,
    wallets: profile.wallets
      .filter(isRecord)
      .map((wallet) => ({
        networkId: String(wallet.networkId ?? ""),
        address: String(wallet.address ?? ""),
      }))
      .filter((wallet) => wallet.networkId && wallet.address),
  };
}

function recordBody(
  agentId: string,
  payerAddress: string,
  txHash: string,
  intent: PayIntent,
  destination: Destination,
) {
  const base = {
    agentId,
    payerAddress,
    txHash,
    type: destination.type,
    approvalId: intent.approvalId,
  };

  if (destination.type === "link") {
    return {
      ...base,
      linkUsername: destination.linkUsername,
      linkId: destination.linkId,
    };
  }

  if (destination.type === "profile") {
    return {
      ...base,
      recipientUsername: destination.recipientUsername,
      amount: Number(destination.amount),
      tokenId: destination.tokenId,
      networkId: destination.networkId,
    };
  }

  return {
    ...base,
    recipientAddress: destination.recipientAddress,
    amount: Number(destination.amount),
    tokenId: destination.tokenId,
    networkId: destination.networkId,
  };
}

function hasApprovalRequired(checks: Record<string, PreflightCheck>) {
  return Object.values(checks).some((check) => check.code === APPROVAL_REQUIRED);
}

function approvalIdFromChecks(checks: Record<string, PreflightCheck>) {
  for (const check of Object.values(checks)) {
    const match = /approvals\/([A-Za-z0-9]+)/.exec(check.message ?? "");
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function readApprovalId(body: unknown) {
  if (!isRecord(body)) return undefined;
  if (typeof body.approvalId === "string") return body.approvalId;
  if (isRecord(body.error) && typeof body.error.approvalId === "string") {
    return body.error.approvalId;
  }
  return undefined;
}

function readHash(result: { hash: string } | string) {
  const hash = typeof result === "string" ? result : result.hash;
  if (!hash?.trim()) {
    throw new PayAgentProtocolError("NO_TX_HASH", "WalletAccount transfer returned no hash");
  }
  return hash.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
