import { PayAgentProtocolError } from "./errors.js";
import type { WdkWalletAccount } from "./types.js";

export async function signAgentChallenge(
  account: WdkWalletAccount,
  message: string,
) {
  if (typeof account.sign !== "function") {
    throw new PayAgentProtocolError(
      "NO_SIGN",
      "WalletAccount.sign(message) is required to prove an agent challenge",
    );
  }
  const signature = await account.sign(message);
  if (!signature?.trim()) {
    throw new PayAgentProtocolError("NO_SIGNATURE", "WalletAccount.sign returned no signature");
  }
  return signature.trim();
}
