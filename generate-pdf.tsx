import { resolve } from "node:path";

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToFile,
} from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#111827",
    lineHeight: 1.5,
  },
  kicker: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#6b7280",
    marginBottom: 6,
  },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  subtitle: { fontSize: 11, color: "#374151", marginBottom: 16 },
  h1: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 16,
    marginBottom: 6,
  },
  h2: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 4,
  },
  p: { marginBottom: 6 },
  mono: { fontFamily: "Courier", fontSize: 8.5, color: "#111827" },
  box: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 10,
    marginBottom: 8,
  },
  step: { marginBottom: 5, paddingLeft: 4 },
  stepNum: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 88, fontFamily: "Helvetica-Bold" },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    fontSize: 8,
    color: "#6b7280",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  li: { marginBottom: 3, paddingLeft: 10 },
});

function P({ children }: { children: React.ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <Text style={styles.li}>• {children}</Text>;
}

function Mono({ children }: { children: React.ReactNode }) {
  return <Text style={styles.mono}>{children}</Text>;
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <Text style={styles.step}>
      <Text style={styles.stepNum}>{n}. </Text>
      {children}
    </Text>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text>PayAgent — how an agent registers and pays</Text>
      <Text
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}

function Doc() {
  return (
    <Document
      title="How an agent registers and pays"
      author="PayAgent"
      subject="Standard guide: register an agent, attach a wallet, send a payment"
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.kicker}>Standard guide</Text>
        <Text style={styles.title}>How an agent registers and pays</Text>
        <Text style={styles.subtitle}>
          Anyone connecting an agent can follow this. It covers the normal
          PayAgent path and the optional Tether WDK wallet. Date: 27 September
          2026.
        </Text>

        <Text style={styles.h1}>1. The one thing to remember</Text>
        <P>
          Registering an agent only creates a name in PayAgent. It does not
          create a wallet and it does not move money. The wallet lives on the
          agent machine. PayAgent never sees the seed or private key.
        </P>
        <P>
          You can use Tether WDK, Phantom, MetaMask, or any other signer. WDK
          is one option, not a lock-in. If you use WDK, install the package on
          the agent first, then attach the address it prints.
        </P>

        <Text style={styles.h1}>2. Who does what</Text>
        <View style={styles.box}>
          <View style={styles.row}>
            <Text style={styles.label}>You / portal</Text>
            <Text>Create an API key. See agents, wallets, and policies.</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Agent machine</Text>
            <Text>Holds the wallet. Signs and sends the on-chain payment.</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>PayAgent</Text>
            <Text>Checks the rules, then verifies the on-chain txHash.</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>WDK (optional)</Text>
            <Text>Opens the wallet and sends the token. Never hosted by us.</Text>
          </View>
        </View>

        <Text style={styles.h1}>3. The path, start to finish</Text>
        <Step n={1}>Create a merchant API key in the PayAgent portal.</Step>
        <Step n={2}>
          If the agent uses WDK: install the package on that machine (see
          section 6). Open a wallet. Copy the address.
        </Step>
        <Step n={3}>
          Register the agent. You only send a name. No wallet is created here.
        </Step>
        <Step n={4}>
          Attach the wallet address to that agent (Solana, Ethereum, or Base).
        </Step>
        <Step n={5}>
          Set a spend policy (which network, which token, how much, approval).
        </Step>
        <Step n={6}>
          Fund the wallet on-chain. The agent pays its own gas. PayAgent does
          not sponsor fees.
        </Step>
        <Step n={7}>
          Ask PayAgent “may I pay?” (preflight). If ready, the wallet sends.
        </Step>
        <Step n={8}>
          Report the txHash. PayAgent checks the chain. If it matches, the
          payment is paid.
        </Step>
        <Footer />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>4. How registration works</Text>
        <P>
          Registration is an API call with your merchant key. It creates an
          agent row: a public id (agt_…) and the name you chose. After that the
          agent appears under Registered Agents.
        </P>
        <P>
          <Mono>POST /api/v1/agents/register</Mono>
          {"  "}body: agent name (and optional your own agent id).
        </P>
        <P>What this step does not do:</P>
        <Li>It does not install any package.</Li>
        <Li>It does not create or fund a wallet.</Li>
        <Li>It does not let the agent pay yet.</Li>
        <P>
          Next you bind a payer address. PayAgent will only accept payments from
          that address. A different wallet gets AGENT_WALLET_MISMATCH.
        </P>
        <P>
          <Mono>POST /api/v1/agents/wallet</Mono>
          {"  "}body: agent id, wallet address, network (for example solana).
        </P>
        <P>
          Then you set the rules. Without an active policy, preflight stays
          blocked.
        </P>
        <P>
          <Mono>PUT /api/v1/compliance/agents/{"{agentId}"}/policy</Mono>
        </P>
        <P>
          In the portal you will see the agent name, id, and wallet. You can
          copy the wallet from Registered Agents or Wallets → Agents. That
          address is what you fund.
        </P>

        <Text style={styles.h1}>5. How payment works</Text>
        <P>
          Money never sits in PayAgent. The agent wallet sends the token on
          the real chain. PayAgent’s job is: allow or deny, then prove the
          transfer happened.
        </P>
        <Step n={1}>
          Preflight — GET /api/v1/pay/preflight. PayAgent checks: agent
          exists, wallet matches, policy allows this token / network / amount,
          and no extra human approval is required.
        </Step>
        <Step n={2}>
          If ready is false, stop. Do not send. Fix funding, policy, or
          approval first.
        </Step>
        <Step n={3}>
          The wallet sends the token to the payee (a payment link, a profile,
          or a raw address).
        </Step>
        <Step n={4}>
          Record — POST /api/v1/pay with the txHash. PayAgent reads the chain
          and checks amount, token, sender, and receiver.
        </Step>
        <Step n={5}>
          If it matches, status is paid. That receipt is the settlement. Not a
          DID, not a PayAgent balance.
        </Step>
        <P>
          If the send works but the record call fails, retry the record only
          with the same txHash. Do not send the payment again.
        </P>
        <P>
          With WDK you do not have to call those two HTTP steps yourself. After
          install, protocol.pay(...) does preflight → WDK transfer → record.
        </P>
        <Footer />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>6. If the agent uses a WDK wallet</Text>
        <P>
          Install this on the agent machine. npm install only gets the library.
          It does not register the agent.
        </P>
        <View style={styles.box}>
          <Text style={styles.mono}>
            npm install @payagent/wdk-protocol @tetherto/wdk
            @tetherto/wdk-wallet-solana
          </Text>
        </View>
        <P>
          For Ethereum or Base, use @tetherto/wdk-wallet-evm instead of the
          Solana module. The same seed on Solana and EVM makes two different
          addresses. Attach the one that matches the network.
        </P>
        <P>Then, in your agent code:</P>
        <Li>Open a WDK WalletAccount (seed stays on that machine).</Li>
        <Li>Read account.getAddress() — that is what you register.</Li>
        <Li>
          new PayAgentProtocol(account, {"{"} apiKey, agentId, networkId {"}"}).
        </Li>
        <Li>
          protocol.pay({"{"} type: "address" | "link" | "profile", … {"}"}).
        </Li>
        <P>
          PayAgent never receives the seed. WDK only hands over getAddress and
          transfer. There is no paymaster. The wallet pays SOL or ETH for gas.
        </P>

        <Text style={styles.h1}>7. Worked example — two Solana agents</Text>
        <P>
          This folder (agents/wdk-test-agent) is a ready example. Two dummy
          agents hop 1 USDT on Solana mainnet. Same rules as above. Real SOL
          and official USDT — not a free testnet.
        </P>
        <View style={styles.box}>
          <View style={styles.row}>
            <Text style={styles.label}>Agent A</Text>
            <Text>wdk test agent - solana A</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Agent B</Text>
            <Text>wdk test agent - solana B</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Token</Text>
            <Text>USDT  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>What you see</Text>
            <Text>A pays B, then B pays A. Solscan link + paid receipt.</Text>
          </View>
        </View>
        <P>From this folder (the template Tether runs):</P>
        <Li>
          <Mono>npm install</Mono> then copy env.example to .env and add the
          merchant API key
        </Li>
        <Li>
          <Mono>npm run wallets</Mono> — two WDK Solana addresses
        </Li>
        <Li>
          <Mono>npm run setup</Mono> — register, attach wallets, USDT +
          Solana + no-approval policy
        </Li>
        <Li>
          <Mono>npm run check</Mono> — host, addresses, balances, preflight
        </Li>
        <Li>
          Confirm both names on Registered Agents (and Wallets → Agents)
        </Li>
        <Li>
          Fund both addresses with SOL. Fund at least one with official USDT.
        </Li>
        <Li>
          <Mono>npm run run</Mono> — waits for funds, then hops
        </Li>
        <Footer />
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>8. If something does not work</Text>
        <Li>
          Agent missing in the portal — the API key belongs to another
          workspace, or register never ran.
        </Li>
        <Li>
          AGENT_WALLET_MISMATCH — the paying address is not the one you
          attached. Same seed on EVM vs Solana is a different address.
        </Li>
        <Li>
          Waiting for funds — no SOL (gas) or no official Solana USDT.
        </Li>
        <Li>
          Approval required — policy still wants a human yes. For a hands-off
          demo, requireApprovalAbove must be empty / null.
        </Li>
        <Li>
          Send worked, PayAgent not paid — retry record only. Do not send again.
        </Li>
        <Li>
          npm installed but nothing registered — expected. Install ≠ register.
        </Li>

        <Text style={styles.h1}>9. Rules that do not change</Text>
        <Li>PayAgent never generates or stores a wallet seed.</Li>
        <Li>One agent is bound to the addresses you attached.</Li>
        <Li>Settlement is the on-chain txHash after PayAgent verifies it.</Li>
        <Li>The agent wallet pays gas. PayAgent is not a paymaster.</Li>
        <Li>No extra fee on this WDK path.</Li>
        <Li>Never commit .env, seeds, or API keys.</Li>
        <Li>
          This payment path is a working sidecar for partners to test. Do not
          call DIDs / VCs production settlement.
        </Li>

        <Text style={styles.h1}>10. APIs used</Text>
        <Li>POST /api/v1/agents/register — create the agent name</Li>
        <Li>POST /api/v1/agents/wallet — bind the payer address</Li>
        <Li>PUT /api/v1/compliance/agents/:agentId/policy — spend rules</Li>
        <Li>GET /api/v1/pay/preflight — may this agent pay?</Li>
        <Li>POST /api/v1/pay — record the txHash after the wallet sends</Li>
        <P>
          Public docs: https://www.payagent.co/docs  (WDK section:
          #wdk-protocol).
        </P>

        <Text style={styles.h1}>11. Share this, not the secrets</Text>
        <P>
          Share this PDF, the public wallet addresses, and the npm package
          name. Do not share .env, seeds, or the merchant API key. If someone
          else runs the example, they use their own key and their own seeds.
        </P>

        <Text style={styles.h1}>12. Repo commands (this folder only)</Text>
        <View style={styles.box}>
          <Text style={styles.mono}>cd agents/wdk-test-agent</Text>
          <Text style={styles.mono}>npm install</Text>
          <Text style={styles.mono}>npm run wallets</Text>
          <Text style={styles.mono}>npm run setup</Text>
          <Text style={styles.mono}>npm run check</Text>
          <Text style={styles.mono}>npm run run</Text>
        </View>
        <Footer />
      </Page>
    </Document>
  );
}

async function main() {
  const out = resolve(process.cwd(), "agents/wdk-test-agent/HOW-IT-WORKS.pdf");
  await renderToFile(<Doc />, out);
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
