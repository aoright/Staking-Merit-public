<div align="center">
  <h1>ShieldWall</h1>
  <p><strong>On-Chain Transaction Guardian Protocol on Monad</strong></p>
  <p>Smart contract wallet with built-in security rules engine. Every transaction is checked on-chain before execution.</p>

  <p>
    <img src="https://img.shields.io/badge/chain-Monad_Testnet-836EF9.svg" alt="Chain" />
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/solidity-0.8.25-363636.svg" alt="Solidity" />
    <img src="https://img.shields.io/badge/tests-13_passed-22c55e.svg" alt="Tests" />
  </p>
</div>

---

## The Problem

Every year, **billions of dollars** are lost to phishing, malicious contracts, and blind signing in Web3. On-chain security checks on Ethereum cost $5-20 per transaction, making them impractical.

## The Solution

**ShieldWall** leverages Monad's 50 gwei gas and parallel execution to run a **full security rules engine on-chain** — before every transaction executes. This is only practical on Monad.

### How It Works

1. Deploy your personal **Guardian Wallet** (smart contract)
2. Configure security rules: spending limits, whitelists, cooldowns
3. Route transactions through your guardian — rules are enforced automatically
4. Community **Threat Registry** warns you about known malicious contracts

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Web Frontend (React)                   │
│  Dashboard · Rules Config · Threat Registry · History    │
└──────────────┬───────────────────────────────────────────┘
               │ Wagmi + Viem
┌──────────────▼───────────────────────────────────────────┐
│                  Monad Testnet (Chain 10143)              │
│                                                          │
│  ┌─────────────────┐  ┌─────────────────────────────┐   │
│  │ ShieldWallFactory│  │     ThreatRegistry          │   │
│  │ (CREATE2 deploy) │  │ (Community threat intel)    │   │
│  └────────┬────────┘  └──────────────┬──────────────┘   │
│           │                          │                   │
│  ┌────────▼──────────────────────────▼──────────────┐   │
│  │              GuardianWallet                       │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │         Security Rules Engine            │    │   │
│  │  │  • Max per-transaction value limit       │    │   │
│  │  │  • Daily spending cap                    │    │   │
│  │  │  • High-value cooldown timer             │    │   │
│  │  │  • Contract whitelist / blacklist        │    │   │
│  │  │  • Threat registry integration           │    │   │
│  │  │  • Emergency pause                       │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  │                                                   │   │
│  │  execute(to, value, data)                        │   │
│  │    → _checkSecurity() ← ALL ON-CHAIN             │   │
│  │    → if safe: execute                            │   │
│  │    → if blocked: revert with reason              │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Smart Contracts

| Contract | Description |
|----------|-------------|
| **ShieldWallFactory** | Factory — deploys personal GuardianWallets via CREATE2 |
| **GuardianWallet** | Smart contract wallet with 6 configurable security rules |
| **ThreatRegistry** | Decentralized threat database with stake-to-report governance |

### Security Rules (All Enforced On-Chain)

| Rule | Description |
|------|-------------|
| **Spending Limit** | Max value per single transaction |
| **Daily Cap** | Maximum total daily spending |
| **Cooldown** | Time delay between high-value transactions |
| **Whitelist** | Only allow transactions to approved addresses |
| **Blacklist** | Block transactions to known-bad addresses |
| **Threat Check** | Auto-check destination against community threat registry |
| **Emergency Pause** | Instantly freeze all outgoing transactions |

---

## Quick Start

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Node.js >= 18 / pnpm
- A wallet with Monad Testnet MON ([Faucet](https://testnet.monad.xyz))

### 1. Compile & Test Contracts

```bash
cd contracts
forge install
forge build
forge test -vv   # 13/13 tests pass
```

### 2. Deploy to Monad Testnet

```bash
export PRIVATE_KEY=your_private_key_here

forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --private-key $PRIVATE_KEY \
  --gas-price 50gwei
```

After deployment, update the contract addresses in `frontend/src/config/chain.ts`.

### 3. Run the Frontend

```bash
cd frontend
pnpm install
pnpm dev         # http://localhost:5173
```

### 4. Deploy Frontend

```bash
pnpm build       # Output in frontend/dist/
# Deploy to Vercel, Netlify, etc.
```

---

## Verify Contracts

```bash
forge verify-contract \
  --rpc-url https://testnet-rpc.monad.xyz \
  --verifier sourcify \
  --verifier-url 'https://sourcify-api-monad.blockvision.org' \
  <CONTRACT_ADDRESS> \
  src/ThreatRegistry.sol:ThreatRegistry
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contracts | Solidity 0.8.25 + Foundry |
| Frontend | Vite + React + TypeScript |
| Chain Interaction | Wagmi + Viem |
| Wallet Connect | MetaMask + WalletConnect (Reown) |
| Target Chain | Monad Testnet (10143) |

---

## Why Monad?

> On Ethereum mainnet, on-chain security checks cost $5-20 per transaction.
> On Monad, the same checks cost < $0.001 thanks to 50 gwei gas + parallel execution.
> This makes ShieldWall's on-chain rules engine **only practical on Monad**.

---

## License

MIT
</div>
