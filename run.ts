import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PreflightDeniedError,
  RecordFailedError,
} from "./protocol/index.ts";
import {
  AGENT_A_ID,
  AGENT_A_NAME,
  AGENT_B_ID,
  AGENT_B_NAME,
  NETWORK_ID,
  TOKEN_ID,
  AGENT_DIR,
  loadEnvFiles,
  loadRunConfig,
  makeProtocol,
  openWdkAccount,
  requiredEnv,
  resolvePayagentHost,
  solanaConnection,
  solanaTxUrl,
  solBalance,
  usdtBalance,
} from "./lib";

loadEnvFiles();

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

async function main() {
  const config = loadRunConfig();
  if (!config.sendEnabled) {
    throw new Error("Refusing to broadcast. Set WDK_TEST_SEND=1 in .env");
  }
  const apiKey = requiredEnv("PAYAGENT_API_KEY");
  const baseUrl = await resolvePayagentHost(apiKey, config.baseUrl);
  const [walletA, walletB] = await Promise.all([
    openWdkAccount(requiredEnv("WDK_SEED_A")),
    openWdkAccount(requiredEnv("WDK_SEED_B")),
  ]);

  const dispose = () => {
    walletA.wdk.dispose();
    walletB.wdk.dispose();
  };
  process.on("SIGINT", () => {
    dispose();
    process.exit(0);
  });

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
    const stats = { sentA: 0, sentB: 0, failed: 0, waited: 0 };
    const startedAt = new Date().toISOString();

    console.log(`${AGENT_A_NAME} ${addressA}`);
    console.log(`${AGENT_B_NAME} ${addressB}`);
    console.log(
      `${config.amount} USDT hops on Solana via WDK + PayAgentProtocol until ${config.targetEach} each`,
    );
    console.log(`PayAgent ${baseUrl}`);
    console.log("Waiting for SOL + USDT. Auto-pay starts as soon as a wallet can send.");

    while (stats.sentA < config.targetEach || stats.sentB < config.targetEach) {
      const [solA, solB, usdtA, usdtB] = await Promise.all([
        solBalance(connection, addressA),
        solBalance(connection, addressB),
        usdtBalance(connection, addressA),
        usdtBalance(connection, addressB),
      ]);

      const fromA =
        stats.sentA < config.targetEach &&
        usdtA >= config.amount &&
        solA > config.minSol;
      const fromB =
        !fromA &&
        stats.sentB < config.targetEach &&
        usdtB >= config.amount &&
        solB > config.minSol;

      if (!fromA && !fromB) {
        stats.waited += 1;
        if (stats.waited === 1 || stats.waited % 5 === 0) {
          console.log(
            `waiting funds solA=${solA.toFixed(4)} solB=${solB.toFixed(4)} usdtA=${usdtA} usdtB=${usdtB} sentA=${stats.sentA} sentB=${stats.sentB}`,
          );
        }
        await sleep(config.sleepMs);
        continue;
      }

      const payer = fromA ? protocolA : protocolB;
      const agentId = fromA ? AGENT_A_ID : AGENT_B_ID;
      const fromAddress = fromA ? addressA : addressB;
      const toAddress = fromA ? addressB : addressA;

      try {
        const result = await payer.pay({
          type: "address",
          recipientAddress: toAddress,
          amount: config.amount,
          tokenId: TOKEN_ID,
          networkId: NETWORK_ID,
        });
        if (result.status !== "paid") {
          throw new Error(
            `PayAgent returned ${result.status}. Use a no-approval USDT policy.`,
          );
        }
        if (fromA) stats.sentA += 1;
        else stats.sentB += 1;
        console.log(
          `${stats.sentA + stats.sentB} ${agentId} ${config.amount} USDT ${fromAddress.slice(0, 6)}→${toAddress.slice(0, 6)} ${solanaTxUrl(result.txHash)}`,
        );
      } catch (error) {
        if (error instanceof RecordFailedError) {
          stats.failed += 1;
          console.error(
            `chain sent but record failed hash=${error.txHash} — do not resend this hop`,
          );
        } else if (error instanceof PreflightDeniedError) {
          console.error("preflight denied", error.checks);
          await sleep(config.sleepMs);
          continue;
        } else {
          stats.failed += 1;
          console.error(
            `tx failed (${stats.failed}):`,
            error instanceof Error ? error.message : error,
          );
        }
        if (stats.failed >= 8) break;
        await sleep(5_000);
        continue;
      }

      await sleep(config.sleepMs);
    }

    const summary = {
      sentA: stats.sentA,
      sentB: stats.sentB,
      failed: stats.failed,
      amount: config.amount,
      startedAt,
      endedAt: new Date().toISOString(),
      addressA,
      addressB,
    };
    writeFileSync(
      resolve(AGENT_DIR, "last-run.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
    );
    console.log("done", summary);
  } finally {
    dispose();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
