import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

import { PayAgentProtocol } from "./protocol/index.ts";
import type { WdkWalletAccount } from "./protocol/types.ts";

/** This folder. Scripts work from repo root or from here. */
export const AGENT_DIR = dirname(fileURLToPath(import.meta.url));

export const NETWORK_ID = "solana";
export const TOKEN_ID = "usdt";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const USDT_DECIMALS = 6;
export const DEFAULT_PAYAGENT_HOST = "https://www.payagent.co";

export const AGENT_A_ID = "wdk_test_solana_a";
export const AGENT_B_ID = "wdk_test_solana_b";
export const AGENT_A_NAME = "wdk test agent - solana A";
export const AGENT_B_NAME = "wdk test agent - solana B";

export function envPath() {
  return resolve(AGENT_DIR, ".env");
}

export function loadEnvFiles() {
  const path = envPath();
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const cut = line.indexOf("=");
    if (cut <= 0) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

export function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy env.example to .env in this folder and fill it in.`,
    );
  }
  return value;
}

export function loadRunConfig() {
  const amount = Number(process.env.WDK_USDT_AMOUNT ?? "1");
  const targetEach = Number(process.env.WDK_TARGET_TXS ?? "20");
  const sleepMs = Number(process.env.WDK_SLEEP_MS ?? "8000");
  const minSol = Number(process.env.WDK_MIN_SOL ?? "0.005");
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("WDK_USDT_AMOUNT must be a positive number");
  }
  return {
    apiKey: process.env.PAYAGENT_API_KEY?.trim() || "",
    baseUrl: (process.env.PAYAGENT_BASE_URL ?? "").replace(/\/$/, ""),
    amount,
    targetEach,
    sleepMs,
    minSol,
    sendEnabled: process.env.WDK_TEST_SEND === "1",
  };
}

export function payagentHost(preferred = "") {
  return preferred.replace(/\/$/, "") || DEFAULT_PAYAGENT_HOST;
}

export function solanaRpcUrl() {
  return (
    process.env.SOLANA_RPC_URL?.trim() ||
    "https://api.mainnet-beta.solana.com"
  );
}

/** Origin only — never print API keys that sit in the RPC path. */
export function solanaRpcLabel() {
  try {
    return new URL(solanaRpcUrl()).origin;
  } catch {
    return "solana-mainnet";
  }
}

export function solanaConnection() {
  return new Connection(solanaRpcUrl(), "confirmed");
}

export function solanaTxUrl(signature: string) {
  return `https://solscan.io/tx/${signature}`;
}

async function withRpcRetry<T>(label: string, run: () => Promise<T>) {
  let last: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      last = error;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 400 * attempt));
    }
  }
  const detail = last instanceof Error ? last.message : String(last);
  throw new Error(
    `${label} failed (${detail}). Set SOLANA_RPC_URL to a reliable mainnet endpoint.`,
  );
}

export async function solBalance(connection: Connection, address: string) {
  return withRpcRetry(`SOL balance ${address}`, async () => {
    const lamports = await connection.getBalance(new PublicKey(address));
    return lamports / LAMPORTS_PER_SOL;
  });
}

export async function usdtBalance(connection: Connection, owner: string) {
  return withRpcRetry(`USDT balance ${owner}`, async () => {
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(USDT_MINT),
      new PublicKey(owner),
    );
    try {
      const account = await getAccount(connection, ata);
      return Number(account.amount) / 10 ** USDT_DECIMALS;
    } catch {
      return 0;
    }
  });
}

function resolveWdkRequire() {
  const candidates = [
    resolve(AGENT_DIR, "package.json"),
    resolve(AGENT_DIR, "../../packages/wdk-protocol/package.json"),
  ];
  const errors: string[] = [];
  for (const pkg of candidates) {
    if (!existsSync(pkg)) continue;
    try {
      const req = createRequire(pkg);
      req.resolve("@tetherto/wdk");
      req.resolve("@tetherto/wdk-wallet-solana");
      return req;
    } catch (error) {
      errors.push(
        `${pkg}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw new Error(
    `Cannot resolve Tether WDK. From this folder run: npm install\n${errors.join("\n")}`,
  );
}

export function loadBip39() {
  return resolveWdkRequire()("bip39") as {
    generateMnemonic: (strength?: number) => string;
    validateMnemonic: (mnemonic: string) => boolean;
  };
}

export async function openWdkAccount(seed: string) {
  const req = resolveWdkRequire();
  const wdkHref = pathToFileURL(req.resolve("@tetherto/wdk")).href;
  const solHref = pathToFileURL(req.resolve("@tetherto/wdk-wallet-solana")).href;
  const [{ default: WDK }, { default: WalletManagerSolana }] = await Promise.all([
    import(wdkHref),
    import(solHref),
  ]);

  const wdk = new WDK(seed);
  wdk.registerWallet("solana", WalletManagerSolana, {
    provider: solanaRpcUrl(),
    commitment: "confirmed",
  });
  const account = (await wdk.getAccount("solana", 0)) as WdkWalletAccount;
  return { wdk, account };
}

export function makeProtocol(
  account: WdkWalletAccount,
  input: { baseUrl: string; apiKey: string; agentId: string },
) {
  return new PayAgentProtocol(account, {
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    agentId: input.agentId,
    networkId: NETWORK_ID,
  });
}

export async function apiJson(
  baseUrl: string,
  apiKey: string,
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {},
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Content-Type", "application/json");
  if (init.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  const data = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!response.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${path} failed (${response.status}): ${
        typeof data?.error === "string" ? data.error : JSON.stringify(data)
      }`,
    );
  }
  return data ?? {};
}

export async function resolvePayagentHost(apiKey: string, preferred = "") {
  const host = payagentHost(preferred);
  try {
    await apiJson(host, apiKey, "/api/v1/compliance/catalog", { method: "GET" });
    return host;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PayAgent ${host} rejected this API key. ${message}\nSet PAYAGENT_BASE_URL if you use staging or localhost.`,
    );
  }
}
