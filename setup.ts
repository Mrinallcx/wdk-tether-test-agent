import {
  AGENT_A_ID,
  AGENT_A_NAME,
  AGENT_B_ID,
  AGENT_B_NAME,
  NETWORK_ID,
  TOKEN_ID,
  apiJson,
  loadEnvFiles,
  loadRunConfig,
  openWdkAccount,
  requiredEnv,
  resolvePayagentHost,
  solanaConnection,
  solBalance,
  usdtBalance,
} from "./lib";

loadEnvFiles();

async function ensureAgent(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  name: string,
) {
  try {
    const created = await apiJson(baseUrl, apiKey, "/api/v1/agents/register", {
      method: "POST",
      body: JSON.stringify({ agentId, agentName: name }),
    });
    console.log(`Registered ${agentId}`, created);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("409") && !message.includes("already")) {
      throw error;
    }
    console.log(`${agentId} already registered`);
  }
}

async function ensureWallet(
  baseUrl: string,
  apiKey: string,
  agentId: string,
  address: string,
) {
  await apiJson(baseUrl, apiKey, "/api/v1/agents/wallet", {
    method: "POST",
    body: JSON.stringify({
      agentId,
      walletAddress: address,
      networkId: NETWORK_ID,
    }),
  });
  console.log(`Wallet attached ${agentId} ${address}`);
}

async function ensurePolicy(baseUrl: string, apiKey: string, agentId: string) {
  await apiJson(baseUrl, apiKey, `/api/v1/compliance/agents/${agentId}/policy`, {
    method: "PUT",
    body: JSON.stringify({
      status: "active",
      maxAmountPerPayment: 10,
      dailySpendCap: 50_000,
      confirmWideOpen: true,
      monthlySpendCap: null,
      allowedNetworkIds: [NETWORK_ID],
      allowedTokenIds: [TOKEN_ID],
      allowCreatePaymentLinks: false,
      allowPay: true,
      autoPayEnabled: true,
      requireApprovalAbove: null,
    }),
  });
  console.log(`Policy active for ${agentId} (USDT on Solana, no approval)`);
}

async function main() {
  const apiKey = requiredEnv("PAYAGENT_API_KEY");
  const config = loadRunConfig();
  const baseUrl = await resolvePayagentHost(apiKey, config.baseUrl);

  const seedA = requiredEnv("WDK_SEED_A");
  const seedB = requiredEnv("WDK_SEED_B");
  const [walletA, walletB] = await Promise.all([
    openWdkAccount(seedA),
    openWdkAccount(seedB),
  ]);

  try {
    const addressA = await walletA.account.getAddress();
    const addressB = await walletB.account.getAddress();

    await ensureAgent(baseUrl, apiKey, AGENT_A_ID, AGENT_A_NAME);
    await ensureAgent(baseUrl, apiKey, AGENT_B_ID, AGENT_B_NAME);
    await ensureWallet(baseUrl, apiKey, AGENT_A_ID, addressA);
    await ensureWallet(baseUrl, apiKey, AGENT_B_ID, addressB);
    await ensurePolicy(baseUrl, apiKey, AGENT_A_ID);
    await ensurePolicy(baseUrl, apiKey, AGENT_B_ID);

    const connection = solanaConnection();
    const [solA, solB, usdtA, usdtB] = await Promise.all([
      solBalance(connection, addressA),
      solBalance(connection, addressB),
      usdtBalance(connection, addressA),
      usdtBalance(connection, addressB),
    ]);

    console.log("");
    console.log(`PayAgent ${baseUrl}`);
    console.log(`Hop ${config.amount} USDT on ${NETWORK_ID}`);
    console.log(`${AGENT_A_NAME} (${AGENT_A_ID})`);
    console.log(`  ${addressA}`);
    console.log(`  SOL ${solA}  USDT ${usdtA}`);
    console.log(`${AGENT_B_NAME} (${AGENT_B_ID})`);
    console.log(`  ${addressB}`);
    console.log(`  SOL ${solB}  USDT ${usdtB}`);
    console.log("");
    console.log("Fund BOTH wallets with a little SOL for gas.");
    console.log("Fund at least ONE wallet with USDT (SPL mint Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB).");
    console.log("Then: npm run check   and after funding   npm run run");
  } finally {
    walletA.wdk.dispose();
    walletB.wdk.dispose();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
