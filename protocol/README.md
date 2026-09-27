# PayAgent protocol (vendored)

`PayAgentProtocol` takes a Tether WDK `WalletAccount`. It never holds a seed.

`preflight` → `account.transfer` → `POST /api/v1/pay` with `txHash`.

This copy is here so the template runs from a clone. The published name is `@payagent/wdk-protocol`.
