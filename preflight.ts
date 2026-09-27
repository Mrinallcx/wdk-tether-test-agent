import {
  AGENT_A_ID,
  AGENT_B_ID,
  NETWORK_ID,
  TOKEN_ID,
  loadEnvFiles,
  loadRunConfig,
  makeProtocol,
  openWdkAccount,
  requiredEnv,
  resolvePayagentHost,
} from "./lib";

loadEnvFiles();

async function main() {
  const config = loadRunConfig();
  const apiKey = requiredEnv("PAYAGENT_API_KEY");
  const baseUrl = await resolvePayagentHost(apiKey, config.baseUrl);
  const [walletA, walletB] = await Promise.all([
    openWdkAccount(requiredEnv("WDK_SEED_A")),
    openWdkAccount(requiredEnv("WDK_SEED_B")),
  ]);
  try {
    const addressA = await walletA.account.getAddress();
    const addressB = await walletB.account.getAddress();
    const protocolA = makeProtocol(walletA.account, {
      baseUrl,
      apiKey,
      agentId: AGENT_A_ID,
    });
    const result = await protocolA.preflight({
      type: "address",
      recipientAddress: addressB,
      amount: config.amount,
      tokenId: TOKEN_ID,
      networkId: NETWORK_ID,
    });
    console.log(
      JSON.stringify(
        {
          host: baseUrl,
          from: { id: AGENT_A_ID, address: addressA },
          to: { id: AGENT_B_ID, address: addressB },
          amount: config.amount,
          tokenId: TOKEN_ID,
          networkId: NETWORK_ID,
          preflight: result,
        },
        null,
        2,
      ),
    );
  } finally {
    walletA.wdk.dispose();
    walletB.wdk.dispose();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
