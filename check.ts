import {
  AGENT_A_ID,
  AGENT_A_NAME,
  AGENT_B_ID,
  AGENT_B_NAME,
  NETWORK_ID,
  TOKEN_ID,
  loadEnvFiles,
  loadRunConfig,
  makeProtocol,
  openWdkAccount,
  payagentHost,
  requiredEnv,
  resolvePayagentHost,
  solanaConnection,
  solanaRpcLabel,
  solBalance,
  usdtBalance,
} from "./lib";

loadEnvFiles();

type Status = "READY_TO_PAY" | "WAITING_FUNDS" | "BLOCKED";

async function main() {
  const config = loadRunConfig();
  const apiKey = requiredEnv("PAYAGENT_API_KEY");
  const seedA = requiredEnv("WDK_SEED_A");
  const seedB = requiredEnv("WDK_SEED_B");
  const baseUrl = await resolvePayagentHost(apiKey, config.baseUrl);

  const [walletA, walletB] = await Promise.all([
    openWdkAccount(seedA),
    openWdkAccount(seedB),
  ]);

  try {
    const addressA = await walletA.account.getAddress();
    const addressB = await walletB.account.getAddress();
    const protocolA = makeProtocol(walletA.account, {
      baseUrl,
      apiKey,
      agentId: AGENT_A_ID,
    });
    const protocolB = makeProtocol(walletB.account, {
      baseUrl,
      apiKey,
      agentId: AGENT_B_ID,
    });

    const connection = solanaConnection();
    const [solA, solB, usdtA, usdtB] = await Promise.all([
      solBalance(connection, addressA),
      solBalance(connection, addressB),
      usdtBalance(connection, addressA),
      usdtBalance(connection, addressB),
    ]);

    const intentA = {
      type: "address" as const,
      recipientAddress: addressB,
      amount: config.amount,
      tokenId: TOKEN_ID,
      networkId: NETWORK_ID,
    };
    const intentB = {
      type: "address" as const,
      recipientAddress: addressA,
      amount: config.amount,
      tokenId: TOKEN_ID,
      networkId: NETWORK_ID,
    };

    const [preflightA, preflightB] = await Promise.all([
      protocolA.preflight(intentA).catch((error: unknown) => ({
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      })),
      protocolB.preflight(intentB).catch((error: unknown) => ({
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      })),
    ]);

    const canA = usdtA >= config.amount && solA > config.minSol;
    const canB = usdtB >= config.amount && solB > config.minSol;
    const policyOk = preflightA.ready || preflightB.ready;
    const status: Status = !policyOk
      ? "BLOCKED"
      : canA || canB
        ? "READY_TO_PAY"
        : "WAITING_FUNDS";

    const next =
      status === "READY_TO_PAY"
        ? "npm run run"
        : status === "WAITING_FUNDS"
          ? "Fund both addresses with SOL. Fund at least one with official Solana USDT. Then npm run run."
          : "Run npm run setup, then npm run check again.";

    const report = {
      status,
      next,
      host: baseUrl,
      rpc: solanaRpcLabel(),
      hop: `${config.amount} USDT on ${NETWORK_ID}`,
      sendEnabled: config.sendEnabled,
      agents: [
        {
          id: AGENT_A_ID,
          name: AGENT_A_NAME,
          address: addressA,
          sol: solA,
          usdt: usdtA,
          preflightReady: preflightA.ready,
        },
        {
          id: AGENT_B_ID,
          name: AGENT_B_NAME,
          address: addressB,
          sol: solB,
          usdt: usdtB,
          preflightReady: preflightB.ready,
        },
      ],
    };

    console.log("PayAgent × WDK template — check");
    console.log(`Host     ${report.host}`);
    console.log(`RPC      ${report.rpc}`);
    console.log(`Hop      ${report.hop}`);
    console.log(
      `Agent A  ${addressA}  SOL ${solA.toFixed(4)}  USDT ${usdtA}  preflight ${preflightA.ready}`,
    );
    console.log(
      `Agent B  ${addressB}  SOL ${solB.toFixed(4)}  USDT ${usdtB}  preflight ${preflightB.ready}`,
    );
    console.log(`Status   ${status}`);
    console.log(`Next     ${next}`);
    console.log("");
    console.log(JSON.stringify(report, null, 2));

    if (status === "BLOCKED") process.exit(1);
  } finally {
    walletA.wdk.dispose();
    walletB.wdk.dispose();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(`Tried host ${payagentHost(process.env.PAYAGENT_BASE_URL ?? "")}`);
  process.exit(1);
});
