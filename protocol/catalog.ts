import { PayAgentProtocolError } from "./errors.js";

export type CatalogAsset = {
  networkId: string;
  tokenId: string;
  decimals: number;
  kind: "erc20" | "spl" | "native";
  address?: string;
};

const catalog: CatalogAsset[] = [
  {
    networkId: "ethereum",
    tokenId: "usdt",
    decimals: 6,
    kind: "erc20",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  {
    networkId: "ethereum",
    tokenId: "usdc",
    decimals: 6,
    kind: "erc20",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
  {
    networkId: "ethereum",
    tokenId: "lcx",
    decimals: 18,
    kind: "erc20",
    address: "0x8CD41041505885EF0aD3858181D66f17BE8aae7E",
  },
  { networkId: "ethereum", tokenId: "eth", decimals: 18, kind: "native" },
  {
    networkId: "base",
    tokenId: "usdt",
    decimals: 6,
    kind: "erc20",
    address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  },
  {
    networkId: "base",
    tokenId: "usdc",
    decimals: 6,
    kind: "erc20",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  },
  { networkId: "base", tokenId: "eth", decimals: 18, kind: "native" },
  {
    networkId: "solana",
    tokenId: "usdt",
    decimals: 6,
    kind: "spl",
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
  },
  {
    networkId: "solana",
    tokenId: "usdc",
    decimals: 6,
    kind: "spl",
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  { networkId: "solana", tokenId: "sol", decimals: 9, kind: "native" },
  {
    networkId: "sepolia",
    tokenId: "usdt",
    decimals: 6,
    kind: "erc20",
    address: "0xF9E0643Ba46eeaf4e1059775567f67F5c867bbfc",
  },
  {
    networkId: "sepolia",
    tokenId: "usdc",
    decimals: 6,
    kind: "erc20",
    address: "0x3402d41AA8e34e0DF605c12109de2f8F4FF33A87",
  },
  {
    networkId: "sepolia",
    tokenId: "lcx",
    decimals: 18,
    kind: "erc20",
    address: "0x98d99c88D31C27C5a591Fe7F023F9DB0B37E4B3b",
  },
  { networkId: "sepolia", tokenId: "eth", decimals: 18, kind: "native" },
];

export function lookupAsset(networkId: string, tokenId: string): CatalogAsset {
  const asset = catalog.find(
    (item) => item.networkId === networkId && item.tokenId === tokenId,
  );
  if (!asset) {
    throw new PayAgentProtocolError(
      "UNSUPPORTED_ASSET",
      `Unsupported token ${tokenId} on ${networkId}`,
    );
  }
  return asset;
}

export function isEvmNetwork(networkId: string) {
  return networkId === "ethereum" || networkId === "base" || networkId === "sepolia";
}

export function isSolanaNetwork(networkId: string) {
  return networkId === "solana";
}

export function isEvmAddress(address: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export function isSolanaAddress(address: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address.trim());
}

export function sameAddress(a: string, b: string, networkId: string) {
  if (isEvmNetwork(networkId)) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  return a.trim() === b.trim();
}
