# PayAgent × Tether WDK

**Solana USDT hop template for agent registration and payment.**

Two agents. Two [Tether WDK](https://github.com/tetherto/wdk) wallets. One official USDT transfer on Solana mainnet.

PayAgent never sees the seed. WDK holds the keys on this machine. PayAgent allows the pay, then verifies the on-chain `txHash`.

[Docs](https://www.payagent.co/docs#wdk-protocol) · [HOW-IT-WORKS.pdf](./HOW-IT-WORKS.pdf)

---

## Flow

```
1. npm install          libraries only — does not register an agent
2. npm run wallets      WDK derives two Solana addresses
3. npm run setup        POST /agents/register  →  POST /agents/wallet  →  policy
4. npm run check        preflight ready?  balances?
5. fund                 SOL on both · official USDT on at least one
6. npm run run          WDK transfer  →  POST /pay { txHash }
7. PayAgent             verifies the SPL USDT transfer on Solana
```

```
WDK WalletAccount                 PayAgentProtocol                 PayAgent
   getAddress()          →        preflight                       allow / deny
   transfer(USDT)        →        record(txHash)         →        verify on-chain
```

Settlement is the verified hash. Not a PayAgent balance. Not a DID.

---

## Quick start

Node 18+.

```bash
git clone https://github.com/Mrinallcx/wdk-tether-test-agent.git
cd wdk-tether-test-agent
npm install
cp env.example .env
```

Put a merchant API key in `.env` (`PAYAGENT_API_KEY`). Create one in the [PayAgent portal](https://www.payagent.co) under API credentials.

```bash
npm run wallets     # two Solana addresses (keeps existing seeds)
npm run setup       # register → attach wallets → USDT + Solana, no approval
npm run check       # host, addresses, balances, preflight
```

`check` exits `0` when the template is wired, even if the wallets are empty. It exits `1` only if the API key, register, wallet, or policy is wrong.

Fund **both** addresses with a little SOL. Fund **at least one** with official Solana USDT  
(`Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`).

```bash
npm run run         # waits for funds, then A → B → A
```

---

## What this proves

| Step | What happens | What does not happen |
|---|---|---|
| Register | Creates an agent name (`agt_…`) | No wallet, no money |
| WDK | `getAddress()` on Solana account 0 | PayAgent never receives the seed |
| Attach | Binds that address to the agent | Other signers are still valid in PayAgent |
| Policy | USDT + Solana, `requireApprovalAbove: null` | No human click on each hop |
| Pay | WDK sends; PayAgent verifies `txHash` | No paymaster — the wallet pays SOL |

The same BIP-39 seed on EVM is a **different** address. Attach `networkId: solana` only.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run wallets` | Derive / reuse two WDK Solana addresses |
| `npm run setup` | Register, attach, policy |
| `npm run check` | Readiness report |
| `npm run preflight` | A → B dry run |
| `npm run balances` | SOL + USDT |
| `npm run run` | Watch and hop |

---

## If check is blocked

| Symptom | Fix |
|---|---|
| API key rejected | Key belongs to another host. Set `PAYAGENT_BASE_URL`. |
| Agents missing | `npm run setup` |
| `AGENT_WALLET_MISMATCH` | Address is not the WDK Solana pubkey you attached |
| Approval required | Setup already sets `requireApprovalAbove` to `null` — re-run setup |
| Waiting for funds | SOL on both, official USDT on one |
| RPC `fetch failed` | Set `SOLANA_RPC_URL` |

Do not commit `.env`. Do not share seeds or the API key. If send works and record fails, retry record only — do not send again.

---

## Layout

| Path | Role |
|---|---|
| `lib.ts` | Env, WDK open, PayAgent HTTP, balances |
| `protocol/` | `PayAgentProtocol` — preflight → transfer → record |
| `generate-wallets.ts` | Two BIP-39 seeds |
| `setup.ts` | Register + wallet + policy |
| `check.ts` | End-to-end readiness |
| `run.ts` | `protocol.pay({ type: "address" })` |
| `HOW-IT-WORKS.pdf` | Standard register-and-pay guide |

This template is one wallet path (Tether WDK). PayAgent still accepts any registered agent address.
