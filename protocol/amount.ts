import { PayAgentProtocolError } from "./errors.js";

/** Exact human amount → token base units. Rejects float-unsafe numbers. */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new PayAgentProtocolError("BAD_DECIMALS", `Invalid decimals: ${decimals}`);
  }

  const human =
    typeof amount === "number"
      ? formatNumberAsDecimalString(amount)
      : amount.trim();

  if (!human || human.startsWith("-") || human === "." || human === "+") {
    throw new PayAgentProtocolError("BAD_AMOUNT", `Invalid amount: ${String(amount)}`);
  }

  const parts = human.split(".");
  if (parts.length > 2) {
    throw new PayAgentProtocolError("BAD_AMOUNT", `Invalid amount: ${human}`);
  }

  const whole = parts[0] === "" ? "0" : parts[0]!;
  const fraction = parts[1] ?? "";

  if (!/^\d+$/.test(whole) || (fraction.length > 0 && !/^\d+$/.test(fraction))) {
    throw new PayAgentProtocolError("BAD_AMOUNT", `Invalid amount: ${human}`);
  }

  if (fraction.length > decimals) {
    throw new PayAgentProtocolError(
      "AMOUNT_PRECISION",
      `Amount ${human} has more than ${decimals} decimal places`,
    );
  }

  const padded = fraction.padEnd(decimals, "0");
  const base = 10n ** BigInt(decimals);
  return BigInt(whole) * base + BigInt(padded || "0");
}

function formatNumberAsDecimalString(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PayAgentProtocolError("BAD_AMOUNT", `Invalid amount: ${amount}`);
  }
  const text = amount.toString();
  if (/e/i.test(text)) {
    throw new PayAgentProtocolError(
      "BAD_AMOUNT",
      "Pass the amount as a decimal string to avoid scientific notation",
    );
  }
  return text;
}
