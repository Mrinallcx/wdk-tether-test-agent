export type PayType = "link" | "profile" | "address";

export type WdkTransferResult = {
  hash: string;
};

export type WdkWalletAccount = {
  getAddress(): Promise<string>;
  transfer(options: {
    token: string;
    recipient: string;
    amount: bigint;
  }): Promise<WdkTransferResult>;
  sendTransaction?(tx: {
    to: string;
    value: bigint;
  }): Promise<WdkTransferResult | string>;
  waitForTransaction?(
    hash: string,
    options?: { target?: "confirmed" | "final" },
  ): Promise<unknown>;
  /** Sign a plaintext challenge. Required only for prove(), not for pay(). */
  sign?(message: string): Promise<string>;
};

export type AgentChallenge = {
  challengeId: string;
  publicId: string;
  networkId: string;
  message: string;
  expiresAt: string;
};

export type AgentProof = {
  ok: true;
  publicId: string;
  address: string;
  networkId: string;
  credential?: unknown;
};

export type PayAgentProtocolConfig = {
  baseUrl?: string;
  apiKey: string;
  agentId: string;
  networkId: string;
  fetch?: typeof fetch;
};

export type LinkPayIntent = {
  type: "link";
  linkUsername: string;
  linkId: string;
  approvalId?: string;
};

export type ProfilePayIntent = {
  type: "profile";
  recipientUsername: string;
  amount: string | number;
  tokenId: string;
  networkId: string;
  approvalId?: string;
};

export type AddressPayIntent = {
  type: "address";
  recipientAddress: string;
  amount: string | number;
  tokenId: string;
  networkId: string;
  approvalId?: string;
};

export type PayIntent = LinkPayIntent | ProfilePayIntent | AddressPayIntent;

export type PreflightCheck = {
  ok: boolean;
  code?: string;
  message: string;
};

export type PreflightResult = {
  ready: boolean;
  type: PayType;
  checks: Record<string, PreflightCheck>;
};

export type Destination = {
  type: PayType;
  recipientAddress: string;
  amount: string | number;
  tokenId: string;
  networkId: string;
  linkUsername?: string;
  linkId?: string;
  recipientUsername?: string;
};

export type ApprovalRequiredResult = {
  status: "approval_required";
  checks?: Record<string, PreflightCheck>;
  approvalId?: string;
  txHash?: string;
  idempotencyKey?: string;
};

export type PaidResult = {
  status: "paid";
  txHash: string;
  idempotencyKey: string;
  destination: Destination;
  record: unknown;
};

export type PayResult = ApprovalRequiredResult | PaidResult;

export type PublicPaymentLink = {
  username: string;
  publicId: string;
  amount: number;
  tokenId: string;
  networkId: string;
  recipientAddress?: string | null;
  canPay?: boolean;
  status?: string;
};

export type PublicProfile = {
  username: string;
  wallets: Array<{
    networkId: string;
    address: string;
  }>;
};
