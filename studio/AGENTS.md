# Ajo Circle

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

Rotating savings circle (ajo / esusu) on Arc Testnet. Members pay USDC each round; the pot goes to one member per round in a rotating order. The contract replaces a trusted organiser: funds are held and released by the contract, every action is transparent onchain.

## Deployed Contracts

- **AjoFactory** (Arc Mainnet, DEFAULT): `0x3cbd2d161fba8fcce9a7f56184d9d33b490bf6d9`
  - Explorer: https://explorer.arc.io/address/0x3cbd2d161fba8fcce9a7f56184d9d33b490bf6d9
- **AjoFactory** (Arc Testnet): `0x73766ceb297ecd12d4db2be9baa37c97c5b5b5b0`
  - Explorer: https://explorer.testnet.arc.io/address/0x73766ceb297ecd12d4db2be9baa37c97c5b5b5b0
  - (Previous testnet: `0xd9eb926c78b3f578ce2d36a9e78111ce6189f402`, `0x098debe6a0a42f987ff12418c494f59ca96bc377`, `0xb37ca1129688dc9a2dbd1700d33a28cd2ddc3e6e`)
- **AjoCircle** (Arc Mainnet, featured): `0xb3d2D00cc36e555b84CaFC0Cc7Aff07aC1dc19F8` ("Kano Ajo, first circle")
- **AjoCircle**: deployed per-circle via AjoFactory.createCircle()

## Active Network Logic
- Wallet on Arc Mainnet (chainId 5042): uses arcMainnet config
- Wallet on Arc Testnet (chainId 5042002): uses arcTestnet config
- Wallet on any other chain: uses DEFAULT (arcMainnet) with a "Switch to Arc" banner
- No wallet connected: uses the ?network= URL param (mainnet/testnet) or DEFAULT (arcMainnet)
- Default network: Arc Mainnet

## Hosting (Vercel)

- `vercel.json` at project root: buildCommand `vite build`, outputDirectory `dist`, wildcard rewrite to `/index.html` so `?circle=0x...&network=mainnet` deep links always load.
- `package.json` `"build"` script: `vite build`.
- To deploy: connect Vercel via the Integrations menu in Arc Studio, then say "deploy this". No env vars required (all config is baked into the build).
- Production build: 2.8 MB uncompressed, ~750 KB gzip (dominated by wagmi/viem/connectkit). Built in 14 s.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Main application logic
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## To Run

```bash
bun install
bun run dev
```
