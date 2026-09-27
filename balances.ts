import {
  AGENT_A_ID,
  AGENT_A_NAME,
  AGENT_B_ID,
  AGENT_B_NAME,
  loadEnvFiles,
  openWdkAccount,
  requiredEnv,
  solanaConnection,
  solanaRpcLabel,
  solBalance,
  usdtBalance,
} from "./lib";

loadEnvFiles();

async function main() {
  const [walletA, walletB] = await Promise.all([
    openWdkAccount(requiredEnv("WDK_SEED_A")),
    openWdkAccount(requiredEnv("WDK_SEED_B")),
  ]);
  try {
    const addressA = await walletA.account.getAddress();
    const addressB = await walletB.account.getAddress();
    const connection = solanaConnection();
    const [solA, solB, usdtA, usdtB] = await Promise.all([
      solBalance(connection, addressA),
      solBalance(connection, addressB),
      usdtBalance(connection, addressA),
      usdtBalance(connection, addressB),
    ]);
    console.log(
      JSON.stringify(
        {
          rpc: solanaRpcLabel(),
          agents: [
            {
              id: AGENT_A_ID,
              name: AGENT_A_NAME,
              address: addressA,
              sol: solA,
              usdt: usdtA,
            },
            {
              id: AGENT_B_ID,
              name: AGENT_B_NAME,
              address: addressB,
              sol: solB,
              usdt: usdtB,
            },
          ],
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
