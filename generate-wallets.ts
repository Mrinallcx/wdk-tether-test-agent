import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AGENT_A_ID,
  AGENT_A_NAME,
  AGENT_B_ID,
  AGENT_B_NAME,
  AGENT_DIR,
  envPath,
  loadBip39,
  loadEnvFiles,
  openWdkAccount,
} from "./lib";

loadEnvFiles();

const ENV_PATH = envPath();
const EXAMPLE_PATH = resolve(AGENT_DIR, "env.example");

function upsertEnv(text: string, key: string, value: string) {
  const line = `${key}=${value}`;
  if (new RegExp(`^${key}=`, "m").test(text)) {
    return text.replace(new RegExp(`^${key}=.*$`, "m"), line);
  }
  return `${text.replace(/\s*$/, "")}\n${line}\n`;
}

async function main() {
  const { generateMnemonic, validateMnemonic } = loadBip39();
  let envText = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, "utf8")
    : readFileSync(EXAMPLE_PATH, "utf8");

  const existingA = process.env.WDK_SEED_A?.trim();
  const existingB = process.env.WDK_SEED_B?.trim();
  const seedA =
    existingA && validateMnemonic(existingA)
      ? existingA
      : generateMnemonic(128);
  const seedB =
    existingB && validateMnemonic(existingB)
      ? existingB
      : generateMnemonic(128);

  envText = upsertEnv(envText, "WDK_SEED_A", seedA);
  envText = upsertEnv(envText, "WDK_SEED_B", seedB);
  if (!/^PAYAGENT_API_KEY=.+/m.test(envText)) {
    envText = upsertEnv(envText, "PAYAGENT_API_KEY", process.env.PAYAGENT_API_KEY ?? "");
  }
  envText = upsertEnv(envText, "WDK_TEST_SEND", "1");
  writeFileSync(ENV_PATH, envText.endsWith("\n") ? envText : `${envText}\n`);

  const [walletA, walletB] = await Promise.all([
    openWdkAccount(seedA),
    openWdkAccount(seedB),
  ]);
  try {
    const addressA = await walletA.account.getAddress();
    const addressB = await walletB.account.getAddress();
    console.log(
      JSON.stringify(
        {
          wrote: ENV_PATH,
          reusedSeeds: Boolean(existingA && existingB),
          agents: [
            { id: AGENT_A_ID, name: AGENT_A_NAME, address: addressA },
            { id: AGENT_B_ID, name: AGENT_B_NAME, address: addressB },
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
